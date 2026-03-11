# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

FROM base AS deps
COPY --from=repo /package.json ./package.json
COPY --from=repo /pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=repo /pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=repo /tsconfig.base.json ./tsconfig.base.json
COPY package.json ./apps/gateway/package.json
COPY tsconfig.json ./apps/gateway/tsconfig.json
COPY --from=repo /packages/protocol/package.json ./packages/protocol/package.json
COPY --from=repo /packages/protocol/tsconfig.json ./packages/protocol/tsconfig.json
RUN pnpm install --frozen-lockfile --filter @geohelper/gateway...

FROM base AS runner
ARG GEOHELPER_BUILD_SHA=dev
ARG GEOHELPER_BUILD_TIME=unknown
ENV NODE_ENV=production \
    GEOHELPER_BUILD_SHA=${GEOHELPER_BUILD_SHA} \
    GEOHELPER_BUILD_TIME=${GEOHELPER_BUILD_TIME}
COPY --from=deps /app /app
COPY src ./apps/gateway/src
COPY --from=repo /packages/protocol/src ./packages/protocol/src
EXPOSE 8787
CMD ["pnpm", "--filter", "@geohelper/gateway", "start"]
