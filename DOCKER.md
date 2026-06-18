# RedNote AI Studio - Docker 部署指南

本指南说明如何使用 Docker 和 Docker Compose 部署 RedNote AI Studio 项目（包含前端和后端）。

## 项目结构

```
rednote/
├── docker-compose.yml           # Docker Compose 配置文件
├── .env.example                 # 环境变量示例文件
├── packages/
│   ├── web-frontend/            # 前端项目
│   │   └── Dockerfile           # 前端 Docker 镜像
│   └── backend/                 # 后端项目
│       └── Dockerfile           # 后端 Docker 镜像
├── packages/agent/              # Agent 库包
└── .dockerignore                # Docker 忽略文件
```

## 前置要求

- Docker Engine 20.10+
- Docker Compose 2.0+

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 到 `.env` 并填入部署基础配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# PostgreSQL
DB_PASSWORD=your_strong_database_password
DATABASE_URL=postgresql://rednote:your_strong_database_password@localhost:5432/rednote?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# Session Secret (在生产环境中修改这个值)
SESSION_SECRET=your_production_secret_key
```

模型 Base URL、模型名称、模型 API Key 和 Tavily 搜索 Key 不再写入 `.env`。
服务启动后登录 `/admin`，在 Key 配置里填写；后端会保存到 PostgreSQL。

### 2. 构建并启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 或者先构建，再启动
docker-compose build
docker-compose up -d
```

### 3. 访问应用

- **前端**: http://localhost
- **后端 API**: http://localhost:3000
- **健康检查**: http://localhost:3000/health

### 4. 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f frontend
docker-compose logs -f backend
```

### 5. 停止服务

```bash
# 停止服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 停止并删除容器、网络和数据卷
docker-compose down -v
```

## 服务说明

### 前端服务 (rednote-frontend)

- **基础镜像**: node:22-slim
- **端口**: 3000（由 Compose 映射到宿主机 80）
- **构建方式**: 多阶段构建，先构建 Next.js 应用，再用 `next start` 提供页面和 `/api/*` 路由
- **特性**:
  - Next.js App Router
  - 服务端 `/api/*` 代理路由
  - 静态页面和动态路由统一托管

### 后端服务 (rednote-backend)

- **基础镜像**: node:22-slim
- **端口**: 3000
- **构建方式**: 多阶段构建，先构建 NestJS 应用，再运行生产版本
- **环境变量**:
  - `NODE_ENV=production`
  - `PORT=3000`
  - `DATABASE_URL`: PostgreSQL 连接串
  - `REDIS_URL`: Redis 连接串
  - `SESSION_SECRET`: 会话密钥
  - `CORS_ORIGINS`: 跨域配置

### PostgreSQL 服务 (rednote-postgres)

- **镜像**: postgres:16-alpine
- **数据库**: `rednote`
- **用户**: `rednote`
- **数据卷**: `postgres-data`

后端使用 Prisma 访问 PostgreSQL。部署时需要在启动 NestJS 服务前执行：

```bash
pnpm --filter @rednote/backend prisma:migrate:deploy
```

### Redis 服务 (rednote-redis)

- **镜像**: redis:7-alpine
- **用途**: 登录会话、短期缓存、后续 agent 运行热状态
- **数据卷**: `redis-data`

## 健康检查

两个服务都配置了健康检查：

- **前端**: 每 30 秒检查一次 HTTP 响应
- **后端**: 每 30 秒检查一次 `/health` 端点，返回数据库和 Redis 状态

查看健康状态：

```bash
docker-compose ps
```

## 网络

服务之间通过 `rednote-network` 桥接网络通信。前端可以通过服务名 `backend` 访问后端。

## 生产部署建议

1. **修改默认密钥**: 确保修改 `.env` 中的 `SESSION_SECRET`
2. **使用 HTTPS**: 在生产环境中配置 SSL 证书
3. **环境变量安全**: 不要将 `.env` 文件提交到版本控制
4. **资源限制**: 为容器设置 CPU 和内存限制
5. **日志管理**: 配置日志轮转和集中日志收集
6. **定期更新**: 定期更新基础镜像以获取安全补丁

## 故障排除

### 端口冲突

如果端口 80 或 3000 已被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "8080:3000"  # 前端改为 8080
  - "3001:3000"  # 后端改为 3001
```

### 构建失败

清理 Docker 缓存后重新构建：

```bash
docker-compose build --no-cache
```

### 查看容器详情

```bash
docker-compose ps
docker inspect rednote-frontend
docker inspect rednote-backend
```

## 开发模式

如果需要在 Docker 中运行开发模式，可以创建 `docker-compose.dev.yml`：

```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
      target: builder
    command: npm run start:dev
    volumes:
      - ./packages/backend/src:/app/src
    ports:
      - "3000:3000"

  frontend:
    build:
      context: .
      dockerfile: packages/web-frontend/Dockerfile
      target: builder
    command: npm run dev
    volumes:
      - ./packages/web-frontend/src:/app/src
    ports:
      - "5173:5173"
```

运行开发模式：

```bash
docker-compose -f docker-compose.dev.yml up
```

## 许可证

请参考项目主 README 中的许可证信息。
