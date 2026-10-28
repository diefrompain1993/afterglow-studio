from unittest.mock import patch
from fastapi.testclient import TestClient
import cloud

client=TestClient(cloud.app)
assert client.get('/api/health').json()['service']=='afterglow-import'
for url in ['http://youtube.com/watch?v=abc','https://127.0.0.1/test','https://example.com/test','https://youtube.com.evil.test/watch?v=x','https://user:pass@youtube.com/watch?v=x','https://youtube.com:8080/watch?v=x','https://youtube.com/playlist?list=x']:
    assert client.post('/api/import',json={'url':url}).status_code==400,url
with patch.object(cloud.pool,'submit') as submit:
    response=client.post('/api/import',json={'url':'https://www.youtube.com/watch?v=jNQXAC9IVRw'},headers={'Origin':'https://diefrompain1993.github.io'})
    assert response.status_code==200
    assert response.headers['access-control-allow-origin']=='https://diefrompain1993.github.io'
    assert submit.called
    key=response.json()['job']
    assert client.get('/api/jobs/'+key).json()['state']=='working'
    assert client.get('/media/'+key+'/audio.mp3').status_code==404
assert client.get('/api/jobs/missing').status_code==404
assert client.get('/api/health',headers={'Origin':'https://unrelated.example'}).headers.get('access-control-allow-origin') is None
assert client.get('/').status_code==200
print('PASS: health, URL allowlist, no private targets, CORS, job creation/polling, protected file lookup, frontend.')
