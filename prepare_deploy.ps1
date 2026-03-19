# prepare_deploy.ps1
$stagingDir = "staging_deploy"
$zipFile = "deploy_package.zip"

if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
New-Item -ItemType Directory -Path $stagingDir -Force

$filesToCopy = @(
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".env",
    "Dockerfile",
    "docker-compose.yml",
    "ecosystem.config.cjs",
    "calendar_id.txt"
)

$foldersToCopy = @(
    "src",
    "public",
    "credentials",
    "auth_info_baileys",
    "scripts"
)

Write-Host "Copying folders..."
foreach ($folder in $foldersToCopy) {
    if (Test-Path $folder) {
        # Using xcopy with /C to continue on error (locked files)
        xcopy $folder "$stagingDir\$folder" /E /I /H /Y /C
    }
}

Write-Host "Copying files..."
foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file "$stagingDir\" -Force
    }
}

Write-Host "Zipping..."
if (Test-Path $zipFile) { Remove-Item $zipFile }
Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipFile -Force

Write-Host "Done! deploy_package.zip is ready."
