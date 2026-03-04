FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS runner
COPY . .
ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@geohelper/gateway", "start"]
