FROM node:20-bookworm-slim

WORKDIR /app

# mediasoup compiles a native addon at install time
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3010

CMD ["node", "server.js"]
