#!/bin/bash
DATE=$(date +"%Y%m%d_%H%M")
mkdir -p backups
tar -czvf "backups/agendabot_backup_${DATE}.tar.gz" credentials/ auth_info_baileys/ public/uploads/
echo "Backup gerado em backups/agendabot_backup_${DATE}.tar.gz"
