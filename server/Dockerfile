FROM node:18-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código-fonte
COPY . .

# Build do projeto
RUN npm run build

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]