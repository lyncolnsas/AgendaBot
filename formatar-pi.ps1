# formatar-pi.ps1
# Script para disparar a formatação remota do Raspberry Pi via Windows.

$serverIp = "10.11.85.184"
$user = "hotspot"
$remotePath = "/home/hotspot/AgendaBot"

Write-Host "==============================================" -ForegroundColor Red
Write-Host "   ☢️  AVISO: FORMATAÇÃO REMOTA DO RASPBERRY  " -ForegroundColor Red
Write-Host "==============================================" -ForegroundColor Red
Write-Host "Isso apagará TODOS os dados, imagens e containers em $serverIp."
Write-Host ""

$confirmation = Read-Host "Você tem ABSOLUTA certeza que deseja formatar o Raspberry? (S/N)"
if ($confirmation -ne "S") {
    Write-Host "Operação abortada." -ForegroundColor Yellow
    exit
}

Write-Host "Conectando ao Raspberry para formatar..." -ForegroundColor Cyan
# Envia o comando SSH para rodar o script de formatação que já existe lá ou será enviado no próximo deploy
ssh "$($user)@$($serverIp)" "cd $remotePath && if [ -f scripts/formatar.sh ]; then chmod +x scripts/formatar.sh && ./scripts/formatar.sh; else echo 'Erro: script formatar.sh não encontrado no servidor.'; fi"

Write-Host ""
Write-Host "Se o processo terminou sem erros, o Raspberry está limpo." -ForegroundColor Green
Write-Host "Para reinstalar, execute: ./install.ps1" -ForegroundColor Gray
