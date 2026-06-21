FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

COPY package*.json ./
RUN chmod 666 /dev/null && npm ci --omit=dev && npm cache clean --force

COPY src ./src
RUN chmod 666 /dev/null && mkdir -p uploads

EXPOSE 5001

CMD ["sh", "-c", "chmod 666 /dev/null 2>/tmp/dev-null-fix.log || true; node src/index.js"]
