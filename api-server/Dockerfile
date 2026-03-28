FROM node:20-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
        pkg-config \
        libssl-dev \
        libsasl2-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY generated ./generated
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY service.key ./
COPY service.cert ./
COPY kafka.pem ./

EXPOSE 9000 9001

CMD ["node", "index.js"]
