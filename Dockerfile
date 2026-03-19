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
RUN npm install --omit=dev

# Copia os arquivos compilados e os arquivos estáticos necessários
COPY dist ./dist
COPY public ./public
COPY credentials ./credentials
COPY auth_info_baileys ./auth_info_baileys
COPY scripts ./scripts
COPY calendar_id.txt ./
COPY ecosystem.config.cjs ./

# O volume de logs do pm2 e do sistema, e de fotos/uploads publicos sera definido fora

EXPOSE 3001

# Rodando via pm2-runtime para não desmontar o container
CMD ["pm2-runtime", "ecosystem.config.cjs"]
