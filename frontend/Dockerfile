FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# The "production service mesh" (docker-compose) previously ran the Vite dev
# server in this container instead of a real build — serve the static output
# with a real web server instead.
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.container.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
