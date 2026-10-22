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
# uid 1000 matches the host user that owns the bind-mounted ./data directory
RUN addgroup -g 1000 -S app && adduser -u 1000 -S app -G app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/seed/demo.db ./seed/demo.db
COPY deploy/entrypoint.sh ./entrypoint.sh
USER app
EXPOSE 3000
ENTRYPOINT ["sh", "./entrypoint.sh"]
