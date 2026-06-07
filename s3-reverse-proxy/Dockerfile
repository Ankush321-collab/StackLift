FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client for Linux container runtime
RUN npx prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 8000

CMD ["node", "index.js"]
