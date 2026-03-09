@echo off
echo Encerrando processos do AgendaBot...
taskkill /f /im node.exe /t
echo.
echo Todos os processos Node (servidor e WhatsApp) foram parados.
pause
