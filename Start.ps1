$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try { Invoke-WebRequest 'http://127.0.0.1:8765/api/library' -UseBasicParsing | Out-Null; Start-Process 'http://127.0.0.1:8765'; exit } catch {}
python -m pip install -r requirements.txt
Start-Process python -ArgumentList 'server.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process 'http://127.0.0.1:8765'
