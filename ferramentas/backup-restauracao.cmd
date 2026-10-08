@echo off
rem Dois cliques aqui fazem a cópia de restauração agora (o mesmo que a tarefa agendada de segunda-feira).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup-restauracao.ps1"
echo.
pause
