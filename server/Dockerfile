FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p uploads

EXPOSE 5001

CMD ["node", "src/index.js"]
