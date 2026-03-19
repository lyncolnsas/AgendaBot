#!/bin/bash
# Raspberry Pi - Reset Total do Ambiente (Standard "Format")
# Remove todos os containers, imagens Docker e limpa caches do sistema.

echo "---------------------------------------------------"
echo "☢️  AVISO DE LIMPEZA PROFUNDA (PI-CLEAN)"
echo "---------------------------------------------------"
echo "Este script irá:"
echo "1. Parar e DELETAR TODOS os containers Docker (mesmo de outros projetos)"
echo "2. Deletar todas as imagens, volumes e redes Docker"
echo "3. Limpar logs do sistema e caches de pacotes"
echo "4. Preparar o Pi para uma instalação virgem"
echo "---------------------------------------------------"

read -p "VOCÊ TEM CERTEZA? Isso pode afetar outros projetos. [s/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Operação cancelada."
    exit 1
fi

echo "🕒 Iniciando em 3 segundos..."
sleep 3

# 1. Wipe Docker
echo "🐳 Limpando ecossistema Docker..."
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker rmi $(docker images -q) -f 2>/dev/null || true
docker system prune -a --volumes -f

# 2. Limpeza de Logs e Caches
echo "📜 Limpando logs e caches do Linux..."
sudo find /var/log -type f -regex '.*\.log\.[0-9].*' -delete
sudo find /var/log -type f -name "*.gz" -delete
sudo truncate -s 0 /var/log/*.log 2>/dev/null || true
sudo apt-get autoremove -y
sudo apt-get clean -y

# 3. Limpeza do Projeto Atual (Opcional, mas útil para instalação limpa)
echo "📁 Deseja remover também as pastas de 'node_modules' e 'dist' deste projeto? [s/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    rm -rf node_modules dist auth_info_baileys
fi

echo "---------------------------------------------------"
echo "✨ Raspberry Pi limpa como nova (estado de formatada)!"
echo "Agora você pode rodar: bash scripts/install.sh"
echo "---------------------------------------------------"
