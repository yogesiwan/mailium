FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN chmod 666 /dev/null && npm ci

COPY . .
RUN chmod 666 /dev/null && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
