#!/bin/bash
set -e

# AgendaBot - Script de Instalação 100% Automatizada
# Alvo: Linux / Raspberry Pi

echo "---------------------------------------------------"
echo "🚀 Iniciando Instalador Automático do AgendaBot"
echo "---------------------------------------------------"

# 0. Verificação de Repositório (Auto-Clone se necessário)
if [ ! -f "Dockerfile" ]; then
    echo "📂 Repositório não detectado localmente."
    echo "📥 Clonando AgendaBot de https://github.com/lyncolnsas/AgendaBot.git ..."
    
    if ! command -v git &> /dev/null; then
        echo "🔧 Instalando git..."
        sudo apt-get update && sudo apt-get install -y git
    fi
    
    # Clonar na pasta atual se estiver vazia, ou criar subpasta
    if [ -z "$(ls -A .)" ]; then
        git clone https://github.com/lyncolnsas/AgendaBot.git .
    else
        git clone https://github.com/lyncolnsas/AgendaBot.git agendabot
        cd agendabot
    fi
fi

# 1. Auto-instalação de dependências do sistema
echo "🔍 Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker não encontrado. Instalando automaticamente..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "✅ Docker instalado."
fi

if ! docker compose version &> /dev/null; then
    echo "⚠️ Docker Compose não encontrado. Instalando plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-v2
fi

# 2. Configuração Silenciosa de Pastas e Arquivos
echo "📁 Preparando ambiente..."
mkdir -p credentials auth_info_baileys public/uploads

[ ! -f .env ] && echo -e "NODE_ENV=production\nPORT=3001" > .env
[ ! -f notification.json ] && echo '{"whatsappNumber": "55000000000@s.whatsapp.net"}' > notification.json
[ ! -f calendar_id.txt ] && touch calendar_id.txt

# 3. Build e Start
echo "📦 Construindo containers (Processo Silencioso)..."
echo "⚠️ NOTA: Se você está no Raspberry Pi, isso pode demorar."
echo "💡 Dica: Se o build falhar (OOM), tente rodar './install.ps1' no seu Windows."

docker compose down --remove-orphans > /dev/null 2>&1
docker compose up -d --build

# 4. Finalização e Pronto para Uso
echo "---------------------------------------------------"
echo "✅ AgendaBot está 100% INSTALADO e RODANDO!"
echo "---------------------------------------------------"
echo "🔗 URL Local: http://localhost:3001"
echo "📸 PRÓXIMO PASSO: Escaneie o QR Code do WhatsApp abaixo:"
echo "---------------------------------------------------"
echo "Executando logs para exibir QR Code... (aperte Ctrl+C para sair quando conectar)"
sleep 3
docker logs -f agendabot_pi
