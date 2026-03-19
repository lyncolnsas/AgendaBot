# deploy_remote.ps1
$serverIp = "10.11.85.184"
$user = "hotspot"
$remotePath = "/home/hotspot/AgendaBot"
$zipFile = "deploy_package.zip"

# 1. Zip files
Write-Host "Zipping files..." -ForegroundColor Cyan
if (Test-Path $zipFile) { Remove-Item $zipFile }

# List of files/folders to include
$includeList = @(
    "src",
    "public",
    "credentials",
    "auth_info_baileys",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".env",
    "Dockerfile",
    "docker-compose.yml",
    "ecosystem.config.cjs",
    "calendar_id.txt",
    "notification.json"
)

# Filter out non-existent files
$filteredList = $includeList | Where-Object { Test-Path $_ }

Compress-Archive -Path $filteredList -DestinationPath $zipFile -Force

# 2. Upload zip
Write-Host "Uploading to $serverIp..." -ForegroundColor Cyan
scp $zipFile "$($user)@$($serverIp):/tmp/"

# 3. Remote extraction and Docker start
# Note: This requires SSH access. The user will be prompted for password twice (scp and ssh).
Write-Host "Extracting and starting services on remote..." -ForegroundColor Cyan
$sshCmd = "mkdir -p $remotePath && unzip -o /tmp/$zipFile -d $remotePath && cd $remotePath && docker-compose up -d --build"
ssh "$($user)@$($serverIp)" $sshCmd

Write-Host "Deployment completed! Dashboard should be available at http://$($serverIp):3001" -ForegroundColor Green
