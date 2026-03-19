@echo off
set timestamp=%date:~10,4%%date:~7,2%%date:~4,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set timestamp=%timestamp: =0%
set backupDir=backups\backup_%timestamp%
echo Criando backup em %backupDir%...
mkdir %backupDir%
xcopy . %backupDir% /E /I /H /Y /EXCLUDE:exclude_backup.txt
echo Backup finalizado.
