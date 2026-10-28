export async function importFromServer(base,url,onStatus){
  async function json(path,options={}){
    let response;try{response=await fetch(base+path,{...options,signal:AbortSignal.timeout(90000)});}catch{throw Error('Сервер импорта не ответил. Бесплатный сервер может просыпаться около минуты; попробуй ещё раз.');}
    let data;try{data=await response.json();}catch{throw Error('Сервер запускается или адрес указан неверно. Подожди минуту и повтори.');}
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:(data.error||'Ошибка сервера '+response.status));return data;
  }
  onStatus('Подключаюсь к серверу импорта… Первый запрос может занять около минуты.');
  const first=await json('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
  if(!first.job)throw Error('Сервер вернул некорректный ответ.');
  const deadline=Date.now()+300000;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,1800));const job=await json('/api/jobs/'+encodeURIComponent(first.job));
    if(job.state==='error')throw Error(job.error);
    if(job.state==='done'){
      onStatus('Скачиваю аудио на устройство…');const format=job.result.format||'wav';
      const response=await fetch(base+'/media/'+encodeURIComponent(job.result.id)+'/audio.'+format,{signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw Error('Не удалось забрать аудиофайл. Повтори импорт.');
      return new File([await response.blob()],job.result.title+'.'+format,{type:format==='mp3'?'audio/mpeg':'audio/wav'});
    }
    onStatus('Сервер получает трек… Не закрывай вкладку.');
  }
  throw Error('Время ожидания истекло. Попробуй ещё раз позже.');
}
