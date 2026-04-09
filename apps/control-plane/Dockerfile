# syntax=docker/dockerfile:1.7
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

ARG GEOHELPER_BUILD_SHA=dev
ARG GEOHELPER_BUILD_TIME=unknown
ENV NODE_ENV=production \
    GEOHELPER_BUILD_SHA=${GEOHELPER_BUILD_SHA} \
    GEOHELPER_BUILD_TIME=${GEOHELPER_BUILD_TIME}

COPY . .

RUN pnpm install --frozen-lockfile --filter @geohelper/control-plane...

EXPOSE 4310

CMD ["pnpm", "--filter", "@geohelper/control-plane", "start"]
