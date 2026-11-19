# Scenly production image: Node 22, ffmpeg (video tools) and Chromium (PDF designer).
# Build:  docker build -t scenly .
# Run:    docker run -p 3000:3000 --env-file .env -v polymind-data:/app/data scenly   (volume name kept so existing data stays attached)
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg chromium tini ca-certificates \
      fonts-liberation fonts-dejavu-core fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    TMPDIR=/app/data/tmp \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    TRUST_CLOUDFLARE=1 \
    DB_SAVE_MS=5000

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node seed ./seed

# Files, the database and temporary work all live in /app/data: mount a volume there so they survive deploys.
RUN mkdir -p /app/data/tmp && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
