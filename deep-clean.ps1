# deep-clean.ps1
Write-Host "Iniciando limpeza profunda no diretório raiz..." -ForegroundColor Cyan

$foldersToRemove = @("dist", "node_modules", "staging_deploy", "auth_info_baileys/baileys_store.json")
foreach ($folder in $foldersToRemove) {
    if (Test-Path $folder) {
        Write-Host "Removendo $folder..."
        Remove-Item -Recurse -Force $folder
    }
}

$filesToRemove = @("deploy_package.zip", "system.log*")
foreach ($file in $filesToRemove) {
    try {
        Get-ChildItem -Path . -Filter $file -ErrorAction SilentlyContinue | Remove-Item -Force
    } catch {}
}

Write-Host "Limpeza concluída!" -ForegroundColor Green
