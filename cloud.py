"""Small bounded importer for a free cloud instance. No accounts/cookies/DRM bypass."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'cloud-data'
DATA.mkdir(exist_ok=True)
app = FastAPI(docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv('ALLOWED_ORIGIN', 'https://diefrompain1993.github.io')], allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
jobs = {}
lock = threading.Lock()
requests_log = []

class ImportRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)

def validate_url(url):
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Нужна HTTPS-ссылка на публичный трек.')
    if host not in {'youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','soundcloud.com','www.soundcloud.com','m.soundcloud.com','on.soundcloud.com'}:
        raise ValueError('Облачный импорт поддерживает только YouTube и SoundCloud.')
    if host.endswith('youtube.com') and not (parsed.path == '/watch' or re.fullmatch(r'/(shorts|embed)/[\w-]+',parsed.path)):
        raise ValueError('Нужна ссылка на одно видео, не канал или плейлист.')
    if host=='youtu.be' and not re.fullmatch(r'/[\w-]+',parsed.path):
        raise ValueError('Неверная короткая ссылка YouTube.')
    if host in {'soundcloud.com','www.soundcloud.com','m.soundcloud.com'} and len(parsed.path.strip('/').split('/')) != 2:
        raise ValueError('Нужна ссылка на один трек SoundCloud.')
    return url

def cleanup():
    now=time.time()
    with lock:
        expired=[key for key,job in jobs.items() if job['state']!='working' and now-job['created']>1800]
        for key in expired:
            jobs.pop(key,None)
            shutil.rmtree(DATA/key,ignore_errors=True)

def download(key,url):
    folder=DATA/key
    folder.mkdir()
    try:
        command=[sys.executable,'-m','yt_dlp','--no-playlist','--no-progress','--no-warnings','--no-cache-dir',
                 '--socket-timeout','20','--retries','1','--fragment-retries','1',
                 '--max-filesize','80M','--match-filter','!is_live & duration <= 1200',
                 '--js-runtimes','node','--write-info-json','-f','bestaudio/best',
                 '-x','--audio-format','mp3','--audio-quality','192K',
                 '-o',str(folder/'source.%(ext)s'),'--',url]
        result=subprocess.run(command,capture_output=True,timeout=240)
        path=folder/'source.mp3'
        if result.returncode or not path.is_file():
            raise ValueError('Сервис не отдал аудио. Возможно, ссылка недоступна или YouTube/SoundCloud блокирует облачный IP. Попробуй другой публичный трек или загрузи файл.')
        if path.stat().st_size>40*1024*1024:raise ValueError('Трек слишком большой для бесплатного импорта.')
        info=json.loads((folder/'source.info.json').read_text(encoding='utf-8'))
        # Never expose extractor metadata, signed media URLs or logs to visitors.
        title=str(info.get('title') or 'Imported track')[:250]
        for extra in folder.iterdir():
            if extra!=path:extra.unlink(missing_ok=True)
        with lock:jobs[key].update(state='done',result={'id':key,'title':title,'duration':info.get('duration',0),'format':'mp3'})
    except subprocess.TimeoutExpired:
        with lock:jobs[key].update(state='error',error='Импорт занял слишком долго. Попробуй более короткий трек.')
        shutil.rmtree(folder,ignore_errors=True)
    except Exception as exc:
        with lock:jobs[key].update(state='error',error=str(exc) if isinstance(exc,ValueError) else 'Не удалось импортировать трек. Попробуй позже.')
        shutil.rmtree(folder,ignore_errors=True)

@app.get('/api/health')
def health():return {'ok':True,'service':'afterglow-import','version':1}

@app.post('/api/import')
def start_import(body:ImportRequest,request:Request):
    try:url=validate_url(body.url)
    except ValueError as exc:raise HTTPException(400,str(exc))
    cleanup()
    with lock:
        now=time.time()
        requests_log[:]=[t for t in requests_log if now-t<3600]
        if len(requests_log)>=12:raise HTTPException(429,'Бесплатный сервер занят: лимит 12 импортов в час. Попробуй позже.')
        if sum(j['state']=='working' for j in jobs.values())>=2:raise HTTPException(429,'Сейчас обрабатываются другие треки. Попробуй через минуту.')
        key=uuid.uuid4().hex
        jobs[key]={'state':'working','created':now}
        requests_log.append(now)
    pool.submit(download,key,url)
    return {'job':key}

@app.get('/api/jobs/{key}')
def get_job(key:str):
    cleanup()
    with lock:
        if key not in jobs:raise HTTPException(404,'Задача истекла. Импортируй трек снова.')
        return {k:v for k,v in jobs[key].items() if k!='created'}

@app.get('/media/{key}/audio.mp3')
def media(key:str):
    if not re.fullmatch('[a-f0-9]{32}',key):raise HTTPException(404)
    with lock:
        if jobs.get(key,{}).get('state')!='done':raise HTTPException(404)
    path=DATA/key/'source.mp3'
    if not path.is_file():raise HTTPException(404)
    return FileResponse(path,media_type='audio/mpeg',filename='afterglow-import.mp3',headers={'Cache-Control':'no-store'})

app.mount('/',StaticFiles(directory=ROOT/'public',html=True),name='studio')
