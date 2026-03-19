# install.ps1
$serverIp = "10.11.85.184"
$user = "hotspot"
$remotePath = "/home/hotspot/AgendaBot"
$zipFile = "deploy_package.zip"

Write-Host "==============================================" -ForegroundColor Yellow
Write-Host "   AGENDA BOT - INSTALADOR RAIZ (FIX OOM)     " -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Yellow

Write-Host "[1/5] Executando limpeza profunda..." -ForegroundColor Cyan
if (Test-Path ".\deep-clean.ps1") { & ".\deep-clean.ps1" }

Write-Host "[2/5] Compilando LOCALMENTE..." -ForegroundColor Cyan
npm install
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro na compilação local!" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Preparando pacote..." -ForegroundColor Cyan
if (Test-Path $zipFile) { Remove-Item $zipFile }
$includeList = @("dist", "public", "credentials", "auth_info_baileys", "scripts", "package.json", "package-lock.json", "tsconfig.json", ".env", "Dockerfile", "docker-compose.yml", "ecosystem.config.cjs", "calendar_id.txt")
$filteredList = $includeList | Where-Object { Test-Path $_ }
Compress-Archive -Path $filteredList -DestinationPath $zipFile -Force

Write-Host "[4/5] Enviando para Raspberry..." -ForegroundColor Cyan
scp $zipFile "$($user)@$($serverIp):/tmp/"

Write-Host "[5/5] Reiniciando remotamente..." -ForegroundColor Cyan
$sshCmd = "mkdir -p $remotePath && unzip -o /tmp/$zipFile -d $remotePath && cd $remotePath && chmod +x scripts/start.sh && ./scripts/start.sh"
ssh "$($user)@$($serverIp)" $sshCmd

Write-Host "Instalação Finalizada!" -ForegroundColor Green
