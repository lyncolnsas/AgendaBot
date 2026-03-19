#!/bin/bash
# AgendaBot - Script de Limpeza Completa para Instalação Limpa

echo "---------------------------------------------------"
echo "🧹 Iniciando limpeza completa do ambiente..."
echo "---------------------------------------------------"

# 1. Parar e remover tudo relacionado ao Docker
echo "🐳 Parando containers e removendo imagens do AgendaBot..."
docker compose down --rmi all --volumes --remove-orphans 2>/dev/null || echo "Nenhum container ativo encontrado."

# 2. Remover pastas de dependências e build
echo "🗑️ Removendo node_modules, dist e arquivos temporários..."
rm -rf node_modules
rm -rf dist
rm -rf staging_deploy

# 3. Remover logs
echo "📜 Limpando arquivos de log..."
rm -f system.log*
rm -f *.log
rm -f errors.txt
rm -f temp_errors.txt

# 4. Perguntas críticas (Sessão e Credenciais)
echo "---------------------------------------------------"
echo "⚠️ ATENÇÃO: As ações abaixo são irreversíveis."
echo "---------------------------------------------------"

read -p "Deseja APAGAR a sessão do WhatsApp (exigirá novo login)? [s/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🗑️ Removendo auth_info_baileys..."
    rm -rf auth_info_baileys
fi

read -p "Deseja APAGAR as credenciais do Google? [s/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🗑️ Removendo pasta credentials..."
    rm -rf credentials
fi

read -p "Deseja APAGAR as fotos e uploads? [s/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🗑️ Removendo public/uploads..."
    rm -rf public/uploads
fi

echo "---------------------------------------------------"
echo "✨ Limpeza finalizada!"
echo "Para reinstalar do zero, execute: bash scripts/install.sh"
echo "---------------------------------------------------"
