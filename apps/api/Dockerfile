# Built from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24-slim AS build
RUN npm install --global pnpm@11.24.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# The API and the workspace packages it depends on, then a self-contained production copy.
RUN pnpm --filter "@ai-unit-economics/api..." build
RUN pnpm --filter @ai-unit-economics/api deploy --legacy --prod /prod/api

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
