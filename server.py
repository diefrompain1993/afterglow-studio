from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, uuid, threading, concurrent.futures, subprocess, wave, math, struct, time, os
import imageio_ffmpeg
import yt_dlp

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DATA = ROOT / 'data'
DATA.mkdir(exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)
JOBS = {}
LOCK = threading.Lock()
PORT = int(os.environ.get('AFTERGLOW_PORT', 8765))

def run(args):
    p = subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', *args], capture_output=True, timeout=1800)
    if p.returncode:
        raise ValueError(p.stderr.decode('utf-8', errors='replace')[-1500:])

def metadata(track_id):
    return json.loads((DATA / track_id / 'meta.json').read_text(encoding='utf-8'))

def save(meta):
    path = DATA / meta['id'] / 'meta.json'
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    tmp.replace(path)

def ingest(path, title, track_id, kind='original', settings=None):
    folder = DATA / track_id
    out = folder / 'audio.wav'
    run(['-i', str(path), '-vn', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', str(out)])
    with wave.open(str(out)) as w:
        duration = w.getnframes() / w.getframerate()
    meta = dict(id=track_id, title=title, duration=duration, kind=kind, created=time.time(), settings=settings)
    save(meta)
    if path != out: path.unlink(missing_ok=True)
    return meta

def import_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username:
        raise ValueError('Введите корректную HTTP(S) ссылку на трек.')
    # Local-only service: still reject private/LAN destinations supplied as URLs.
    import socket, ipaddress
    for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443):
        if not ipaddress.ip_address(item[4][0]).is_global:
            raise ValueError('Локальные и служебные сетевые адреса не поддерживаются.')
    track_id = uuid.uuid4().hex
    folder = DATA / track_id
    folder.mkdir()
    options = dict(format='bestaudio/best', outtmpl=str(folder / 'source.%(ext)s'), noplaylist=True,
                   quiet=True, no_warnings=True, ffmpeg_location=FFMPEG, max_filesize=512*1024*1024,
                   socket_timeout=30, retries=2, js_runtimes={'node': {}},
                   match_filter=yt_dlp.utils.match_filter_func('!is_live & duration < 7200'))
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info or 'entries' in info: raise ValueError('Вставьте ссылку на отдельный трек, а не плейлист.')
            path = Path(ydl.prepare_filename(info))
        return ingest(path, info.get('title', 'Импортированный трек'), track_id)
    except Exception as exc:
        raise ValueError('Не удалось импортировать ссылку. Сервис может требовать вход, блокировать загрузку или быть недоступен. Попробуйте загрузить файл. ' + str(exc)[-600:]) from exc

def number(settings, key, default, low, high):
    v = float(settings.get(key, default))
    if not math.isfinite(v) or not low <= v <= high: raise ValueError('Некорректное значение: ' + key)
    return v

def render(track_id, s, fmt='wav'):
    meta = metadata(track_id)
    speed = number(s, 'speed', 0.85, 0.25, 2)
    pitch = number(s, 'pitch', -2, -12, 12)
    bass = number(s, 'bass', 0, -12, 18)
    wet = number(s, 'reverb', 25, 0, 100)/100
    room = number(s, 'room', 2, 0.2, 8)
    start = number(s, 'start', 0, 0, meta['duration'])
    end = number(s, 'end', meta['duration'], 0, meta['duration'])
    if end <= start: raise ValueError('Конец фрагмента должен быть позже начала.')
    ratio = 2 ** (pitch/12)
    tempo = speed / ratio
    filters = [f'atrim=start={start}:end={end}', 'asetpts=PTS-STARTPTS', f'asetrate={44100*ratio}', 'aresample=44100']
    while tempo < .5:
        filters.append('atempo=0.5'); tempo /= .5
    while tempo > 2:
        filters.append('atempo=2'); tempo /= 2
    filters += [f'atempo={tempo}', f'bass=g={bass}:f=110:w=0.6']
    length = (end-start)/speed
    if wet:
        delays = '|'.join(str(round((23+i*13.7)*room)) for i in range(18))
        decays = '|'.join(str(round(wet*.24*math.exp(-i/7), 5)) for i in range(18))
        filters.append(f'aecho=0.8:0.9:{delays}:{decays}')
    fadein = number(s, 'fadein', 0, 0, 10)
    fadeout = number(s, 'fadeout', 0, 0, 10)
    if fadein: filters.append(f'afade=t=in:d={min(fadein,length)}')
    if fadeout: filters.append(f'afade=t=out:st={max(0,length-fadeout)}:d={min(fadeout,length)}')
    if s.get('normalize', True): filters.append('loudnorm=I=-16:TP=-1.5:LRA=11')
    filters.append('alimiter=limit=0.95')
    result_id = uuid.uuid4().hex
    folder = DATA / result_id
    folder.mkdir()
    fmt = 'mp3' if fmt == 'mp3' else 'wav'
    target = folder / ('audio.' + fmt)
    codec = ['-c:a', 'libmp3lame', '-b:a', '320k'] if fmt == 'mp3' else ['-c:a', 'pcm_s16le']
    run(['-i', str(DATA / track_id / 'audio.wav'), '-af', ','.join(filters), '-ar', '44100', *codec, str(target)])
    if fmt == 'mp3': run(['-i', str(target), '-c:a', 'pcm_s16le', str(folder/'audio.wav')])
    with wave.open(str(folder/'audio.wav')) as w: duration = w.getnframes()/w.getframerate()
    result = dict(id=result_id, title=meta['title'] + ' · remix', duration=duration, kind='remix', created=time.time(), settings=s, format=fmt)
    save(result)
    return result

def job(fn, *args):
    key = uuid.uuid4().hex
    JOBS[key] = {'state':'working'}
    def worker():
        try: JOBS[key] = {'state':'done','result':fn(*args)}
        except Exception as exc: JOBS[key] = {'state':'error','error':str(exc)}
    POOL.submit(worker)
    return {'job':key}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def log_message(self, *args): pass
    def send_json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{PORT}',f'localhost:{PORT}')
    def do_GET(self):
        if not self.valid_host(): return self.send_json({'error':'Invalid host'},403)
        p = urlparse(self.path)
        if p.path == '/api/library':
            tracks=[]
            for path in DATA.glob('*/meta.json'):
                try: tracks.append(json.loads(path.read_text(encoding='utf-8')))
                except (ValueError,OSError): pass
            return self.send_json(sorted(tracks,key=lambda x:x['created'],reverse=True))
        if p.path.startswith('/api/jobs/'):
            return self.send_json(JOBS.get(p.path.split('/')[-1],{'state':'error','error':'Задача не найдена'}))
        if p.path.startswith('/media/'):
            parts=p.path.split('/')
            if len(parts)!=4 or not all(c in '0123456789abcdef' for c in parts[2]) or len(parts[2])!=32 or parts[3] not in ('audio.wav','audio.mp3'):
                return self.send_error(404)
            file=DATA/parts[2]/parts[3]
            if not file.exists(): return self.send_error(404)
            size=file.stat().st_size; lo=0; hi=size-1; status=200
            rg=self.headers.get('Range','')
            if rg.startswith('bytes='):
                try:
                    a,b=rg[6:].split('-'); lo=int(a or 0); hi=min(int(b) if b else hi,hi); status=206
                    if lo>hi: raise ValueError()
                except ValueError: return self.send_error(416)
            self.send_response(status); self.send_header('Content-Type','audio/mpeg' if file.suffix=='.mp3' else 'audio/wav'); self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Length',str(hi-lo+1))
            if status==206: self.send_header('Content-Range',f'bytes {lo}-{hi}/{size}')
            if p.query=='download': self.send_header('Content-Disposition',f'attachment; filename="afterglow-{parts[2][:8]}{file.suffix}"')
            self.end_headers()
            try:
                with file.open('rb') as f:
                    f.seek(lo); remaining=hi-lo+1
                    while remaining:
                        chunk=f.read(min(65536,remaining)); self.wfile.write(chunk); remaining-=len(chunk)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError): pass
            return
        return super().do_GET()
    def do_POST(self):
        origin=self.headers.get('Origin')
        if not self.valid_host() or (origin and origin not in (f'http://localhost:{PORT}',f'http://127.0.0.1:{PORT}')):
            return self.send_json({'error':'Origin not allowed'},403)
        try:
            length=int(self.headers.get('Content-Length',0))
            if length>512*1024*1024: return self.send_json({'error':'Максимальный размер — 512 МБ'},413)
            p=urlparse(self.path)
            if p.path=='/api/upload':
                title=parse_qs(p.query).get('name',['Трек'])[0][:250]
                track_id=uuid.uuid4().hex; folder=DATA/track_id; folder.mkdir(); path=folder/'upload'
                with path.open('wb') as f:
                    remaining=length
                    while remaining:
                        chunk=self.rfile.read(min(65536,remaining))
                        if not chunk: raise ValueError('Загрузка прервана')
                        f.write(chunk); remaining-=len(chunk)
                return self.send_json(job(ingest,path,title,track_id))
            body=json.loads(self.rfile.read(length))
            if p.path=='/api/import': return self.send_json(job(import_url,body['url']))
            if p.path=='/api/render':
                tid=body['id']
                if len(tid)!=32 or any(c not in '0123456789abcdef' for c in tid): raise ValueError('Неверный ID')
                return self.send_json(job(render,tid,body['settings'],body.get('format','wav')))
            return self.send_json({'error':'Not found'},404)
        except Exception as exc: return self.send_json({'error':str(exc)},400)

if __name__=='__main__':
    print(f'Afterglow Studio: http://127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
