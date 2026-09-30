# yuque-ai-mcp — 语雀全功能 MCP Server
# 构建阶段：安装依赖并编译 TypeScript
FROM node:20-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# 运行阶段：仅保留 dist 与生产依赖
FROM node:20-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/package.json /app/server/package-lock.json ./
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY config/config.example.json /app/config/config.json
# 占位 token 仅用于保证容器能启动并响应 MCP introspection（Glama 健康检查用）。
# 真实使用请挂载真实配置：
#   docker run -v $(pwd)/config.json:/app/config/config.json -i yehuoshun/yuque-ai-mcp
RUN sed -i 's/在此填入语雀 API Token/docker-placeholder-token/' /app/config/config.json
CMD ["node", "dist/index.js"]
