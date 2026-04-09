FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

COPY . .

RUN pnpm install --frozen-lockfile --filter @geohelper/control-plane...

EXPOSE 4310

CMD ["pnpm", "--filter", "@geohelper/control-plane", "start"]
