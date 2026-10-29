import {attachMediaSession,requestPlaybackSession} from './media-session.js?v=7';
import {LiveEngine} from './live-engine.js?v=7';
import {attachScrubber} from './scrubber.js';
import {impulse,mix,bassStage} from './audio-effects.js';
import {importFromServer} from './import-client.js';
const $=id=>document.getElementById(id);
const controls=[['speed','Скорость',.25,2,.01,.85,'×','0.25×','2.00×'],['pitch','Высота тона',-24,12,.1,-2.8,'st','−24 полутона','+12 полутонов'],['reverb','Реверберация',0,100,1,30,'%','Сухой звук','В пространстве'],['room','Размер пространства',.2,8,.1,2.4,'s','Комната','Большой зал'],['bass','Усиление баса',-12,18,.5,0,'dB','−12 dB','+18 dB']];
let current=null,buffer=null,items=[],busy=false,previewBuffer=null,previewKey='',db,ctx,live,looping=false,scrubbing=false,scrubPosition=0;
function position(){return live?.linked?live.native.current():live?.position||0;}
function seek(seconds){live?.seek(seconds);mediaSession.update(true);}
const mediaSession=attachMediaSession({
 getState:()=>current&&buffer&&live?.native?{...live.native.s,title:current.title,playing:!!live.playing,position:position()}:null,
 play:()=>{if(!live?.playing)$('play').click();},pause:()=>{live?.pause();playbackUI();},seek
});
// Never stop audio on visibilitychange: Safari owns the playback audio session.
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&live?.playing&&ctx?.state==='interrupted')ctx.resume().catch(()=>notice('Safari приостановил звук. Нажми паузу и ▶ для продолжения.',true));
 mediaSession.update(true);
});
let settings=Object.fromEntries(controls.map(c=>[c[0],c[5]]));
try{settings={...settings,...JSON.parse(localStorage.getItem('afterglow-defaults')||'{}')};if(localStorage.getItem('afterglow-theme')==='light')document.body.classList.add('light');}catch{}
const presets={
slowed:{speed:.85,pitch:-2.8,reverb:30,room:2.4,bass:0},
nightcore:{speed:1.25,pitch:3.8,reverb:12,room:1.3,bass:1},
daycore:{speed:.75,pitch:-5,reverb:22,room:3,bass:4},
original:{speed:1,pitch:0,reverb:0,room:2,bass:0},
deep:{speed:.9,pitch:-2,reverb:8,room:.6,bass:10},
dream:{speed:.95,pitch:2,reverb:60,room:5,bass:-3},
dry:{speed:.8,pitch:0,reverb:0,room:.2,bass:0},
hall:{speed:1,pitch:0,reverb:45,room:6,bass:0},
warm:{speed:.96,pitch:-1,reverb:15,room:.7,bass:5},
hyper:{speed:1.5,pitch:5,reverb:0,room:.2,bass:3},
underwater:{speed:.65,pitch:-9,reverb:35,room:3.5,bass:8},
floating:{speed:1,pitch:7,reverb:50,room:4,bass:-6}
};
for(const [id,preset] of Object.entries(presets)){preset.linked=!['dry','dream','floating'].includes(id);if(preset.linked)preset.pitch=12*Math.log2(preset.speed);}
settings.linked??=true;if(settings.linked)settings.pitch=12*Math.log2(settings.speed);
const presetLabels=[['slowed','Slowed + Reverb','мягко и атмосферно'],['nightcore','Nightcore','ярче и быстрее'],['daycore','Daycore','глубже и темнее'],['original','Original','чистый звук'],['deep','Deep Bass','плотный низ · +10 dB'],['dream','Dreamscape','воздушный · большой хвост'],['dry','Slow Motion','медленнее · прежний тон'],['hall','Concert Hall','большой зал · без ускорения'],['warm','Warm Tape','тёплый · небольшая комната'],['hyper','Hyperpop','1.5× · высокий тон'],['underwater','Underwater','очень низко · очень медленно'],['floating','Floating','высокий тон · лёгкий бас']];
const presetsRoot=document.querySelector('.presets');presetsRoot.innerHTML=presetLabels.map(([id,title,caption],i)=>`<button data-preset="${id}" class="preset ${id==='slowed'?'selected':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${title}</strong><small>${caption}</small></button>`).join('');
$('morePresets').onclick=()=>{const expanded=presetsRoot.classList.toggle('expanded');$('morePresets').setAttribute('aria-expanded',expanded);$('morePresets').textContent=expanded?'Свернуть пресеты ↑':'Ещё 8 пресетов ↓';};
$('soundJump').onclick=()=>$('soundDesign').scrollIntoView({behavior:'smooth',block:'start'});

const time=s=>`${Math.floor((s||0)/60)}:${String(Math.floor((s||0)%60)).padStart(2,'0')}`;
function notice(msg,error=false){$('notice').textContent=msg;$('notice').className=error?'error':busy?'busy':'';}
function lock(value){busy=value;for(const id of ['export','batch'])$(id).disabled=value||!current;$('files').disabled=value;$('urlForm').querySelector('button').disabled=value;$('demo').disabled=value;document.querySelectorAll('.library-row button').forEach(b=>b.disabled=value);}
async function action(fn){if(busy)return;lock(true);try{await fn();}catch(e){notice(e.message||'Что-то пошло не так. Попробуйте другой файл.',true);}finally{lock(false);}}
function context(){requestPlaybackSession();return ctx ||= new AudioContext({sampleRate:44100});}
function makeControls(){ $('independent').checked=!settings.linked;$('modeHint').textContent=settings.linked?'Плавное замедление: скорость и тон связаны, как у пластинки.':'Независимый тон: на очень низкой скорости возможны артефакты растяжения.'; $('controls').innerHTML='';for(const [key,label,min,max,step,,unit,left,right] of controls){const box=document.createElement('div');box.className='control';box.innerHTML=`<div class="control-top"><label for="${key}">${label}</label><div class="value"><input id="${key}Number" aria-label="${label}: точное значение" type="number" min="${min}" max="${max}" step="${step}" value="${Number(settings[key].toFixed(2))}"><small>${unit}</small></div></div><input id="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${Number(settings[key].toFixed(2))}"><div class="range-labels"><span>${left}</span><span>${right}</span></div>`;$('controls').append(box);for(const id of [key,key+'Number'])$(id).addEventListener('input',()=>{const value=Number($(id).value);if(!Number.isFinite(value))return;settings[key]=Math.max(min,Math.min(max,value));if(settings.linked){if(key==='speed'){settings.pitch=12*Math.log2(settings.speed);$('pitch').value=settings.pitch;$('pitchNumber').value=settings.pitch.toFixed(1);}if(key==='pitch'){settings.speed=2**(settings.pitch/12);$('speed').value=settings.speed;$('speedNumber').value=settings.speed.toFixed(2);}}$(id===key?key+'Number':key).value=settings[key];invalidate();document.querySelectorAll('.preset').forEach(b=>b.classList.remove('selected'));});}}
function invalidate(){previewBuffer=null;previewKey='';if(current){try{live?.settings(getSettings());$('playMode').textContent=`LIVE / ${settings.speed.toFixed(2)}x`;mediaSession.update(true);if(!busy)notice('Эффекты меняются сразу. Твой звук — твои правила.');}catch(e){notice(e.message,true);}}draw();}
$('independent').onchange=()=>{settings.linked=!$('independent').checked;if(settings.linked)settings.pitch=12*Math.log2(settings.speed);makeControls();invalidate();};
function getSettings(){const s={...settings,start:Number($('start').value)||0,end:$('end').value===''?buffer.duration:Number($('end').value),fadein:Number($('fadein').value)||0,fadeout:Number($('fadeout').value)||0,normalize:$('normalize').checked};if(s.start<0||s.end>buffer.duration+.01||s.start>=s.end)throw Error('Проверь обрезку: начало должно быть раньше конца и внутри трека.');if(s.fadein<0||s.fadeout<0||s.fadein>10||s.fadeout>10)throw Error('Переходы — от 0 до 10 секунд.');return s;}
for(const id of ['start','end','fadein','fadeout','normalize'])$(id).addEventListener('input',invalidate);
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('afterglow-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('tracks',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Браузер не разрешил хранение библиотеки.'));});}
async function put(item){const transaction=db.transaction('tracks','readwrite');transaction.objectStore('tracks').put(item);await new Promise((r,j)=>{transaction.oncomplete=r;transaction.onerror=()=>j(Error('Не хватает места в браузере. Скачай ремиксы и освободи место.'));});items.unshift(item);renderLibrary();}
function all(){return new Promise((r,j)=>{const req=db.transaction('tracks').objectStore('tracks').getAll();req.onsuccess=()=>r(req.result.sort((a,b)=>b.created-a.created));req.onerror=j;});}
function renderLibrary(){$('count').textContent=items.length;if(!items.length)return;$('library').replaceChildren();for(const item of items){const row=document.createElement('div');row.className='library-row';const check=document.createElement('input');check.type='checkbox';check.value=item.id;check.setAttribute('aria-label','Выбрать '+item.title);const name=document.createElement('button');name.className='name';name.textContent=(item.kind==='remix'?'✦  ':'♫  ')+item.title;name.title=item.title;name.disabled=busy;name.onclick=()=>action(()=>select(item));const length=document.createElement('small');length.textContent=time(item.duration);const download=document.createElement('a');download.textContent='↓';download.title='Скачать';download.href='#';download.onclick=e=>{e.preventDefault();downloadBlob(item.blob,item.title+'.'+item.format);};row.append(check,name,length,download);$('library').append(row);}}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function playbackUI(event){const playing=!!live?.playing;$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'Пауза':'Воспроизвести');document.body.classList.toggle('playing',playing);$('elapsed').textContent=time(scrubbing?scrubPosition:position());if(event?.error)notice(event.error,true);mediaSession.update();draw();}
async function select(item,decodedBuffer=null){notice('Читаю аудио…');live?.pause();const decoded=decodedBuffer||await context().decodeAudioData(await item.blob.arrayBuffer());if(!live){live=new LiveEngine(context(),playbackUI);await live.init();}current=item;buffer=decoded;previewBuffer=null;previewKey='';$('trackTitle').textContent=item.title;$('trackMeta').textContent=`${time(decoded.duration)} / ${(decoded.sampleRate/1000).toFixed(1)} kHz / ${item.format.toUpperCase()}`;$('trackBadge').textContent=item.kind==='remix'?'REMIX':'ORIGINAL';$('start').value=0;$('end').value=decoded.duration.toFixed(3);$('end').max=decoded.duration;$('emptyWave').hidden=true;$('duration').textContent=time(decoded.duration);live.load(decoded);applyVolume();live.loop(looping);live.settings(getSettings());$('play').disabled=false;$('playMode').textContent=`LIVE · ${settings.speed.toFixed(2)}×`;playbackUI();notice('Нажми ▶. Все регуляторы меняют звук прямо во время воспроизведения.');}
async function addFile(file){if(file.size>150*1024*1024)throw Error('Для браузерной версии выбери файл до 150 МБ.');notice('Читаю '+file.name+'…');let decoded;try{decoded=await context().decodeAudioData(await file.arrayBuffer());}catch{throw Error('Не удалось прочитать '+file.name+'. Попробуй MP3, WAV или M4A.');}if(decoded.duration>1200)throw Error('Для браузерной версии выбери трек до 20 минут.');const item={id:crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,''),duration:decoded.duration,blob:file,format:file.name.split('.').pop().toLowerCase(),kind:'original',created:Date.now()};await put(item);await select(item,decoded);}
// No accept filter: iOS WebKit can disable MP3/WAV when audio/* is used.
// Decode the selected content in addFile instead; reset immediately to allow retries.
$('files').onchange=()=>{const selected=[...$('files').files];$('files').value='';if(selected.length)action(async()=>{for(const file of selected)await addFile(file);});};
document.addEventListener('dragover',e=>{e.preventDefault();document.body.classList.add('dragging');});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('dragging');});document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('dragging');action(async()=>{for(const f of e.dataTransfer.files)await addFile(f);});});
function worker(data){return new Promise((resolve,reject)=>{const w=new Worker('audio-worker.js');w.onmessage=e=>{w.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data);};w.onerror=e=>{w.terminate();reject(Error(e.message));};w.postMessage(data);});}
async function processAudio(input,s){
 const sr=44100,start=Math.floor(s.start*input.sampleRate),end=Math.floor(s.end*input.sampleRate);
 let trimmed=new AudioBuffer({length:end-start,numberOfChannels:2,sampleRate:input.sampleRate});
 for(let c=0;c<2;c++)trimmed.copyToChannel(input.getChannelData(Math.min(c,input.numberOfChannels-1)).slice(start,end),c);
 if(trimmed.sampleRate!==sr){const resample=new OfflineAudioContext(2,Math.ceil(trimmed.duration*sr),sr),source=resample.createBufferSource();source.buffer=trimmed;source.connect(resample.destination);source.start();trimmed=await resample.startRendering();}
 notice('Обрабатываю звук со всеми эффектами…');
 let sourceBuffer=trimmed;
 if(!s.linked){const shifted=await worker({type:'stretch',channels:[trimmed.getChannelData(0),trimmed.getChannelData(1)],speed:s.speed,pitch:s.pitch});sourceBuffer=new AudioBuffer({length:shifted.channels[0].length,numberOfChannels:2,sampleRate:sr});shifted.channels.forEach((channel,i)=>sourceBuffer.copyToChannel(channel,i));}
 const dryDuration=trimmed.duration/s.speed,tail=s.reverb>0?s.room:0,offline=new OfflineAudioContext(2,Math.ceil((dryDuration+tail)*sr),sr);
 const source=offline.createBufferSource();source.buffer=sourceBuffer;source.playbackRate.value=s.linked?s.speed:1;
 const bass=bassStage(offline);bass.set(s.bass,false);source.connect(bass.input);
 const master=offline.createGain(),dry=offline.createGain(),gains=mix(s.reverb/100);master.connect(offline.destination);dry.gain.value=gains.dry;bass.output.connect(dry);dry.connect(master);
 if(s.reverb>0){const conv=offline.createConvolver(),wet=offline.createGain();conv.buffer=impulse(offline,s.room);wet.gain.value=gains.wet;bass.output.connect(conv);conv.connect(wet);wet.connect(master);}
 if(s.fadein){master.gain.setValueAtTime(0,0);master.gain.linearRampToValueAtTime(1,Math.min(s.fadein,dryDuration));}
 if(s.fadeout){master.gain.setValueAtTime(1,Math.max(0,dryDuration-s.fadeout));master.gain.linearRampToValueAtTime(0,dryDuration);}
 source.start();const result=await offline.startRendering();let peak=0;
 for(let c=0;c<2;c++){const ch=result.getChannelData(c);for(let i=0;i<ch.length;i++)peak=Math.max(peak,Math.abs(ch[i]));}
 const gain=peak>0?(s.normalize?.89125/peak:Math.min(1,.99/peak)):1;
 for(let c=0;c<2;c++){const ch=result.getChannelData(c);for(let i=0;i<ch.length;i++)ch[i]*=gain;}
 return result;
}

function wav(buf){const bytes=new ArrayBuffer(44+buf.length*4),v=new DataView(bytes);const str=(o,t)=>[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,buf.sampleRate,true);v.setUint32(28,buf.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,buf.length*4,true);const l=buf.getChannelData(0),r=buf.getChannelData(1);for(let i=0;i<buf.length;i++){v.setInt16(44+i*4,Math.max(-1,Math.min(1,l[i]))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,r[i]))*32767,true);}return new Blob([bytes],{type:'audio/wav'});}
async function processed(){const s=getSettings(),key=JSON.stringify(s)+current.id;if(previewBuffer&&key===previewKey)return previewBuffer;const result=await processAudio(buffer,s);previewBuffer=result;previewKey=key;return result;}
async function exportCurrent(){const source=current,s=getSettings(),result=await processed(),format=$('format').value;notice(format==='mp3'?'Кодирую MP3 320 kbps…':'Сохраняю WAV…');const blob=format==='mp3'?(await worker({type:'mp3',sampleRate:result.sampleRate,channels:[result.getChannelData(0),result.getChannelData(1)]})).blob:wav(result);const item={id:crypto.randomUUID(),title:source.title+' · '+s.speed+'x remix',blob,format,duration:result.duration,kind:'remix',created:Date.now(),settings:s};await put(item);notice('Ремикс сохранён в библиотеке. Нажми ↓ рядом с ним, чтобы скачать.');return item;}
$('export').onclick=()=>action(async()=>{const item=await exportCurrent();downloadBlob(item.blob,item.title+'.'+item.format);});
$('batch').onclick=()=>action(async()=>{const ids=[...$('library').querySelectorAll('input:checked')].map(x=>x.value);if(!ids.length)throw Error('Отметь треки галочками в библиотеке.');const s={...settings};for(let i=0;i<ids.length;i++){await select(items.find(x=>x.id===ids[i]));settings={...s};notice(`Обработка ${i+1} из ${ids.length}…`);await exportCurrent();}notice(`Готово: ${ids.length} ремиксов в библиотеке. Скачай их кнопкой ↓.`);});
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{settings={...presets[b.dataset.preset]};makeControls();document.querySelectorAll('.preset').forEach(x=>x.classList.toggle('selected',x===b));invalidate();});
$('reset').onclick=()=>{settings={...presets.original};makeControls();$('start').value=0;$('end').value=buffer?buffer.duration.toFixed(3):'';$('fadein').value=$('fadeout').value=0;$('normalize').checked=true;document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('selected',b.dataset.preset==='original'));invalidate();};
$('saveDefaults').onclick=()=>{try{localStorage.setItem('afterglow-defaults',JSON.stringify(settings));notice('Настройки сохранены для следующих запусков.');}catch{notice('Браузер запретил сохранение настроек.',true);}};
$('play').onclick=async()=>{try{if(!live)return;if(live.playing)live.pause();else{requestPlaybackSession();live.settings(getSettings());await live.play();}playbackUI();}catch(e){notice(e.message,true);}};
$('restart').onclick=()=>{seek(Number($('start').value)||0);playbackUI();};$('loop').onclick=()=>{looping=!looping;live?.loop(looping);$('loop').setAttribute('aria-pressed',looping);};$('volume').oninput=applyVolume;
// A squared taper gives fine control near silence while keeping unity at maximum.
function applyVolume(){const level=Math.max(0,Math.min(1,Number($('volume').value)));live?.volume(level*level);$('volume').setAttribute('aria-valuetext',level===0?'Без звука':(40*Math.log10(level)).toFixed(1)+' дБ');}
attachScrubber($('wave'),{
 duration:()=>buffer?.duration||0,
 bounds:()=>[Number($('start').value)||0,$('end').value===''?(buffer?.duration||0):Number($('end').value)],
 position:()=>position(),
 start:()=>{scrubbing=true;},
 preview:seconds=>{scrubPosition=seconds;$('elapsed').textContent=time(seconds);draw();},
 commit:seconds=>seek(seconds),
 end:seconds=>{scrubbing=false;if(live)live.position=seconds;playbackUI();}
});

function draw(){const canvas=$('wave'),rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;const g=canvas.getContext('2d');g.scale(dpr,dpr);const width=rect.width,height=rect.height,data=buffer?.getChannelData(0),progress=((scrubbing?scrubPosition:position())/buffer?.duration)||0;$('wave').setAttribute('aria-valuemax',String(Math.round(buffer?.duration||0)));$('wave').setAttribute('aria-valuenow',String(Math.round(scrubbing?scrubPosition:position()||0)));$('wave').setAttribute('aria-valuetext',time(scrubbing?scrubPosition:position()));g.strokeStyle='#ffffff08';for(let y=0;y<height;y+=20){g.beginPath();g.moveTo(0,y);g.lineTo(width,y);g.stroke();}for(let x=0;x<width;x+=4){let peak=.04;if(data){const start=Math.floor(x/width*data.length),end=Math.floor((x+4)/width*data.length),step=Math.max(1,Math.floor((end-start)/60));for(let i=start;i<end;i+=step)peak=Math.max(peak,Math.abs(data[i]));}else peak=.03+Math.abs(Math.sin(x*.08)*Math.sin(x*.023))*.42;const h=Math.max(3,peak*height*.9);g.fillStyle=data?(x/width<progress?'#d4cadc':'#a09baa'):'#51505b';g.fillRect(x,(height-h)/2,2,h);}if(data){const start=(Number($('start').value)||0)/buffer.duration,end=($('end').value===''?buffer.duration:Number($('end').value))/buffer.duration;g.fillStyle='#0b0b0b99';g.fillRect(0,0,width*start,height);g.fillRect(width*end,0,width*(1-end),height);g.fillStyle='#e1ecc4';g.fillRect(progress*width,0,2,height);g.beginPath();g.arc(Math.max(6,Math.min(width-6,progress*width)),6,5,0,Math.PI*2);g.fill();}}
window.addEventListener('resize',draw);
const meterData=new Uint8Array(128),meterBars=[...document.querySelectorAll('.signal-bars i')];
function animateMeter(){let level=0;if(live?.analyser&&live.playing){live.analyser.getByteTimeDomainData(meterData);let sum=0;for(const value of meterData)sum+=((value-128)/128)**2;level=Math.min(20,Math.sqrt(sum/meterData.length)*70);}meterBars.forEach((bar,i)=>bar.style.opacity=i<level?'1':'.18');requestAnimationFrame(animateMeter);}animateMeter();
$('demo').onclick=()=>action(async()=>{notice('Создаю демо…');const sr=44100,length=sr*12,b=context().createBuffer(2,length,sr);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<length;i++){const t=i/sr,chord=[130.81,164.81,196,246.94][Math.floor(t/3)%4],beat=t%.6;d[i]=(.11*Math.sin(2*Math.PI*chord*t)+.06*Math.sin(2*Math.PI*chord*1.5*t+c*.3))*(.5+.5*Math.sin(Math.PI*(t%3)/3))+.13*Math.sin(2*Math.PI*55*t)*Math.exp(-beat*20);d[i]*=Math.min(1,t*3,(12-t)*3);}}const item={id:crypto.randomUUID(),title:'Midnight Tape — demo',blob:wav(b),format:'wav',duration:12,kind:'original',created:Date.now()};await put(item);await select(item);});
let importApi='';
try{importApi=localStorage.getItem('afterglow-import-api')||'';const config=await(await fetch('config.json',{cache:'no-store'})).json();importApi=importApi||config.importApi||'';}catch{}
$('apiUrl').value=importApi;
$('saveApi').onclick=async()=>{try{const raw=$('apiUrl').value.trim();if(!raw){importApi='';localStorage.removeItem('afterglow-import-api');notice('Адрес сервера удалён.');return;}const parsed=new URL(raw);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Укажи HTTPS-адрес сервера без пароля в ссылке.');const base=parsed.origin;const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Сервер пока не готов. Подожди минуту и повтори.');const info=await response.json();if(info.service!=='afterglow-import')throw Error('Это не сервер импорта Afterglow.');importApi=base;localStorage.setItem('afterglow-import-api',base);$('helpDialog').close();notice('Сервер подключён. Теперь можно вставлять YouTube и SoundCloud.');}catch(e){$('apiStatus').textContent=e.message;}};
$('urlForm').onsubmit=e=>{e.preventDefault();action(async()=>{
 const url=$('url').value.trim(),parsed=new URL(url),host=parsed.hostname;
 if(!['https:','http:'].includes(parsed.protocol))throw Error('Нужна HTTP(S)-ссылка.');
 const platform=/(^|\.)(youtube\.com|youtu\.be|soundcloud\.com|on\.soundcloud\.com)$/.test(host);
 const local=['127.0.0.1','localhost'].includes(location.hostname),cloud=location.hostname.endsWith('.onrender.com');
 if(platform||local){
  if(platform&&!local&&!cloud&&!importApi){$('helpDialog').showModal();throw Error('Облачный сервер ещё не подключён. Нужен один бесплатный запуск Render — инструкция в справке.');}
  const file=await importFromServer(local||cloud?'':importApi,url,notice);await addFile(file);
 }else{
  let response;try{response=await fetch(url,{signal:AbortSignal.timeout(60000)});}catch{throw Error('Ссылка не разрешает загрузку (CORS) или недоступна. Сохрани аудиофайл и выбери его на сайте.');}
  if(!response.ok)throw Error('Ссылка вернула ошибку '+response.status);
  const blob=await response.blob();await addFile(new File([blob],decodeURIComponent(parsed.pathname.split('/').pop())||'Imported.mp3',{type:blob.type}));
 }
 $('url').value='';
});};

$('theme').onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('afterglow-theme',document.body.classList.contains('light')?'light':'dark');}catch{};draw();};$('help').onclick=()=>$('helpDialog').showModal();$('helpDialog').querySelector('.close').onclick=()=>$('helpDialog').close();$('libraryNav').onclick=()=>$('libraryAnchor').scrollIntoView({behavior:'smooth'});$('studioNav').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)&&!$('helpDialog').open){e.preventDefault();if(current)$('play').click();}});
document.querySelector('.upload').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('files').click();}});
makeControls();draw();try{db=await database();items=await all();renderLibrary();}catch(e){notice(e.message,true);}

const animationsButton=$('animations');
function motionState(paused){document.body.classList.toggle('still',paused);animationsButton.setAttribute('aria-pressed',String(paused));animationsButton.textContent=paused?'GIF: OFF':'GIF: ON';document.querySelectorAll('.stamp img').forEach(img=>img.src=img.dataset.base+(paused?'.png':'.gif'));}
let motionPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
try{motionPaused=localStorage.getItem('afterglow-still')==='true'||motionPaused;}catch{}
motionState(motionPaused);
animationsButton.onclick=()=>{motionPaused=!motionPaused;motionState(motionPaused);try{localStorage.setItem('afterglow-still',motionPaused);}catch{}};
