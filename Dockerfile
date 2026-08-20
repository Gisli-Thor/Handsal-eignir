# Production image (cloud-agnostic, EU hosting). Requires DATABASE_URL etc.
# at runtime — see .env.example for the full list.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is generated code, not committed — generate before build.
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy secrets so `next build` can evaluate config; real values come at runtime.
RUN AUTH_SECRET=build-placeholder DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migrations + CLI so the container can run `npx prisma migrate deploy`.
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
