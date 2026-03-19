FROM node:20-bookworm-slim

# Definir fuso horário de Brasília (-3) padrão para Raspberry Pi e dependências essenciais
RUN apt-get update && apt-get install -y tzdata python3 make g++ gcc && \
    cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && \
    echo "America/Sao_Paulo" > /etc/timezone && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Instalar pm2 globalmente para uso dentro do container
RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./
# Instalamos tudo primeiro para garantir o build
RUN npm install

# Se a pasta dist ja existir (enviada via install.ps1), o COPY apenas a usa.
# Se nao existir, o comando de build abaixo ira cria-la.
COPY . .

# Build condicional: Se a pasta dist não existe, compila.
# No Raspberry Pi, isso pode exigir SWAP ativado para não dar OOM.
RUN if [ ! -d "dist" ]; then \
    echo "Compilando TypeScript (Build Manual no Pi)..." && \
    node --max-old-space-size=512 node_modules/.bin/tsc; \
    else echo "Usando build pré-compilado encontrado."; \
    fi

# O volume de logs do pm2 e do sistema, e de fotos/uploads publicos sera definido fora

EXPOSE 3001

# Rodando via pm2-runtime para não desmontar o container
CMD ["pm2-runtime", "ecosystem.config.cjs"]
