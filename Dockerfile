# Usa uma imagem Node muito magra (Alpine) baseada em ARM/x64 (compatível com Raspberry Pi)
FROM node:20-alpine

# Cria o diretório de trabalho
WORKDIR /app

# Instala variáveis importantes para dependências nativas (se houver) no Alpine
RUN apk add --no-cache \
    python3 \
    make \
    g++ 

# Copia os arquivos de configuração
COPY package*.json ./
COPY tsconfig.json ./

# Instala todas as dependências (produção + desenvolvimento)
RUN npm install

# Copia o código fonte
COPY src ./src

# Compila o TypeScript para JavaScript (dist)
RUN npm run build

# Remove dependências de dev (TypeScript etc) para deixar o contêiner leve para Raspberry Pi
RUN npm prune --production

# Expõe a porta principal da API
EXPOSE 3001

# Comando para iniciar em produção
CMD ["npm", "start"]
