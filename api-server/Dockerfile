FROM node:20-bookworm-slim

WORKDIR /app

# node-rdkafka requires librdkafka and build toolchain during install
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        python3 \
        make \
        g++ \
        pkg-config \
        librdkafka-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma client for the Linux container runtime
RUN npx prisma generate --schema=prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 9000 9001

CMD ["node", "index.js"]
