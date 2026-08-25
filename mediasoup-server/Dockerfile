FROM node:20-alpine3.19

WORKDIR /app

# System deps needed to build mediasoup native bindings
RUN apk add --no-cache \
    python3 \
    py3-pip \
    meson \
    ninja \
    make \
    g++ \
    linux-headers \
    openssl \
    openssl-dev

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install ALL dependencies inside the image (no host bind mount override)
RUN npm ci --include=optional

# Copy source code AFTER installing deps
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
