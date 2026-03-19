#!/bin/bash
# AgendaBot - "Formatação" Total do Raspberry Pi
# Este script limpa TODO o ecossistema Docker e deleta todos os dados do projeto.

echo "=============================================="
echo "☢️  AVISO: FORMATAÇÃO TOTAL DO AGENDABOT     "
echo "=============================================="
echo "Isso irá apagar:"
echo "1. TODOS os containers, imagens e volumes Docker."
echo "2. Banco de dados local (SQLite)."
echo "3. Sessão do WhatsApp e Credenciais do Google."
echo "4. Todas as fotos e uploads."
echo "=============================================="

# Em um script não-interativo, poderíamos remover o read, 
# mas em um script de "formatação", é melhor ter a trava.
read -p "VOCÊ TEM ABSOLUTA CERTEZA? [s/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo "Operação cancelada."
    exit 1
fi

echo "🕒 Iniciando limpeza em 3 segundos... Pressione Ctrl+C para desistir."
sleep 3

echo "🐳 [1/4] Limpando Docker (Imagens, Containers, Volumes)..."
# Tenta parar e remover todos os containers
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
# Remove todas as imagens
docker rmi $(docker images -q) -f 2>/dev/null || true
# Limpeza pesada de sistema (inclui volumes e redes não usadas)
docker system prune -a --volumes -f

echo "📁 [2/4] Removendo pastas de dados e dependências..."
# Remove pastas críticas
rm -rf node_modules dist auth_info_baileys credentials data public/uploads staging_deploy system.log* 2>/dev/null || true

echo "📜 [3/4] Limpando logs do sistema Linux..."
sudo find /var/log -type f -regex '.*\.log\.[0-9].*' -delete
sudo find /var/log -type f -name "*.gz" -delete
sudo truncate -s 0 /var/log/*.log 2>/dev/null || true

echo "📦 [4/4] Limpando caches de pacotes (apt)..."
sudo apt-get autoremove -y
sudo apt-get clean -y

echo "=============================================="
echo "✨ Raspberry Pi 'Formatada'!"
echo "O ambiente está limpo e pronto para uma nova instalação."
echo "Dica: Use './install.ps1' no seu Windows para reinstalar."
echo "=============================================="
