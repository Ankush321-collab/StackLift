FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

COPY index.js ./
COPY ca.pem ./
COPY ca.pem ./prisma/ca.pem

EXPOSE 8000

CMD ["node", "index.js"]
