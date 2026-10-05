# The Elysium website (Next.js, standalone output) for demo.elysium-lifestyle.bd.
# It has no database: everything is read from and written to the brand ERP.
#
#   docker build \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://demo.elysium-lifestyle.bd \
#     --build-arg ERP_MEDIA_ORIGINS=https://erp.elysium-lifestyle.bd \
#     -t elysium-web:demo .
#
# NEXT_PUBLIC_SITE_URL and ERP_MEDIA_ORIGINS are read when the app is built (the
# public URL is inlined into the browser bundle; the image origins become the
# image optimiser's allow-list). Everything else is read at run time from the
# environment (see .env.example and docs/deploy-demo.md).

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ARG NEXT_PUBLIC_SITE_URL=https://demo.elysium-lifestyle.bd
ARG ERP_MEDIA_ORIGINS=https://erp.elysium-lifestyle.bd
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    ERP_MEDIA_ORIGINS=${ERP_MEDIA_ORIGINS} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/check-no-database.mjs && npm run build

FROM ${NODE_IMAGE} AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 \
    PORT=3601
# The standalone server and its traced node_modules, the static assets and public files.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The image optimiser's cache (a volume in compose).
RUN mkdir -p .next/cache && chown -R node:node .next/cache
USER node
EXPOSE 3601
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://' + (process.env.HOSTNAME || '127.0.0.1') + ':' + (process.env.PORT || 3601) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
