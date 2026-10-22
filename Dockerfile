FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
# Build the app and a pre-seeded template database. The entrypoint copies the
# template into the data volume on first boot, so the runtime image needs no Prisma CLI.
ENV DATABASE_URL="file:/app/seed/demo.db"
RUN mkdir -p /app/seed && npx prisma generate && npx prisma db push --skip-generate && npx tsx prisma/seed.ts && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# The image's built-in `node` user is uid 1000, matching the host user that owns the bind-mounted ./data directory.
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/seed/demo.db ./seed/demo.db
COPY deploy/entrypoint.sh ./entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["sh", "./entrypoint.sh"]
