FROM node:20-alpine

# Definir fuso horário de Brasília (-3) padrão para Raspberry Pi
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime && \
    echo "America/Sao_Paulo" > /etc/timezone

# Instalar pm2 globalmente para uso dentro do container
RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Compila o typescript para a pasta ./dist/
RUN npm run build

# O volume de logs do pm2 e do sistema, e de fotos/uploads publicos sera definido fora

EXPOSE 3001

# Rodando via pm2-runtime para não desmontar o container
CMD ["pm2-runtime", "ecosystem.config.cjs"]
