#!/bin/bash
set -e

# AgendaBot - Script de Instalação Completa
# Alvo: Linux / Raspberry Pi (Docker)

echo "---------------------------------------------------"
echo "🚀 Iniciando instalação do AgendaBot..."
echo "---------------------------------------------------"

# 1. Verificar dependências essenciais
echo "🔍 Verificando dependências..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado. Por favor, instale o Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Nota: Docker Compose V2 é acessado via 'docker compose'
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose não encontrado ou versão antiga. Atualize o Docker para incluir o plugin compose."
    exit 1
fi

# 2. Preparar ambiente local
echo "📁 Preparando diretórios e arquivos base..."
mkdir -p credentials auth_info_baileys public/uploads

# Arquivo .env base
if [ ! -f .env ]; then
    echo "📝 Criando .env padrão..."
    cat <<EOT > .env
NODE_ENV=production
PORT=3001
EOT
fi

# Arquivo notification.json base
if [ ! -f notification.json ]; then
    echo "📝 Criando notification.json padrão..."
    cat <<EOT > notification.json
{
  "whatsappNumber": "SEU_NUMERO_AQUI@s.whatsapp.net"
}
EOT
fi

# Arquivo calendar_id.txt base
if [ ! -f calendar_id.txt ]; then
    echo "📝 Criando calendar_id.txt vazio..."
    touch calendar_id.txt
fi

# 3. Limpeza de builds anteriores (opcional mas recomendado)
echo "🧹 Limpando restos de builds anteriores..."
rm -rf dist

# 4. Build e Start via Docker Compose
echo "📦 Construindo imagem Docker (pode demorar no Raspberry Pi)..."
docker compose build --no-cache

echo "⚡ Iniciando o serviço em modo detached..."
docker compose down > /dev/null 2>&1
docker compose up -d

# 5. Finalização
echo "---------------------------------------------------"
echo "✅ Instalação concluída com sucesso!"
echo "---------------------------------------------------"
echo "👉 Painel Web: http://localhost:3001"
echo "👉 Para ler o QR Code do WhatsApp, execute:"
echo "   docker logs -f agendabot_pi"
echo "---------------------------------------------------"
