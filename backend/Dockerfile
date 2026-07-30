FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
# Cloud Run injeta PORT automaticamente (padrão 8080); config/env.js já lê process.env.PORT.
EXPOSE 8080

CMD ["npm", "start"]
