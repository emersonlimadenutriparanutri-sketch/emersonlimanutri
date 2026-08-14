# Imagem do servico OpenWA: Node + Chromium do sistema.
# O puppeteer que vem com o @open-wa/wa-automate NAO baixa o proprio Chromium
# aqui; usamos o pacote do Debian, que ja tem as libs certas para container.
FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      dumb-init \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libatk-bridge2.0-0 \
      libgbm1 \
      libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# A sessao do WhatsApp (tokens do navegador) vive aqui e precisa de volume.
RUN mkdir -p /app/data/sessions && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
