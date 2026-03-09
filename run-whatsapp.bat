@echo off
title AgendaBot - Servidor
echo ===========================================
echo    SISTEMA AGENDABOT - INICIANDO...
echo ===========================================

REM Iniciar o Painel no Navegador
echo [INFO] Abrindo painel em http://localhost:3001
start http://localhost:3001

REM Rodar o servidor
echo [OK] Servidor iniciado! Mantenha esta janela aberta.
echo.
npm run dev
pause
