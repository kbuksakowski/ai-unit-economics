# Built from the repository root: docker build -f apps/dashboard/Dockerfile .
FROM node:24-slim AS build
RUN npm install --global pnpm@11.24.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@ai-unit-economics/dashboard..." build

# Next's standalone output carries only the files the server needs.
FROM node:24-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]
