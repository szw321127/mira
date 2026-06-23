# GitHub Actions CI/CD 配置指南

本项目使用 GitHub Actions 自动构建 Docker 镜像并部署到服务器。

## Workflow 文件说明

### 1. build-backend.yml
- **功能**: 构建并推送后端 Docker 镜像
- **触发条件**:
  - `packages/backend/` 目录有变化时
  - 可手动触发
- **镜像名称**: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_backend`

### 2. build-frontend.yml
- **功能**: 构建并推送前端 Docker 镜像
- **触发条件**:
  - `packages/web-frontend/` 目录有变化时
  - 可手动触发
- **镜像名称**: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_frontend`

### 3. deploy.yml
- **功能**: 构建前后端镜像并部署到服务器
- **触发条件**:
  - 推送到 main/master 分支时
  - 可手动触发
- **流程**:
  1. 并行构建前端和后端镜像
  2. 推送镜像到阿里云 Container Registry
  3. 通过 SSH 部署到服务器，拉取后端镜像、worker 服务和前端镜像
  4. 启动后端、图像 worker、前端和 Caddy，PostgreSQL、Redis 作为依赖保持运行
  5. 后端容器启动时执行 `prisma migrate deploy`，再启动 NestJS 服务
  6. 图像 worker 复用 `rednote_backend` 镜像，只运行 `node dist/image-worker-runner.js`，不重复执行数据库迁移

服务器部署时会从阿里云 ACR 拉取 `rednote_backend`、`rednote_frontend`、
`rednote_postgres`、`rednote_redis` 和 `rednote_caddy`，避免服务器直接访问 Docker Hub。
日常部署只更新业务镜像；部署前会检查 PostgreSQL、Redis、Caddy 基础镜像是否已在 ACR，
缺失时自动同步。手动运行 `deploy.yml` 时勾选 `mirror_service_images` 可以强制重新同步。

## 配置步骤

### 1. 配置阿里云 ACR

1. 在阿里云容器镜像服务中创建命名空间，例如 `szw321127`
2. 创建或允许创建以下镜像仓库：
   - `rednote_backend`
   - `rednote_frontend`
   - `rednote_postgres`
   - `rednote_redis`
   - `rednote_caddy`
3. 记录 ACR 登录地址，例如 `registry.cn-hangzhou.aliyuncs.com`

### 2. 配置 GitHub Secrets

进入仓库的 `Settings` > `Secrets and variables` > `Actions`，添加以下 secrets：

#### 服务器部署相关（仅 deploy.yml 需要）
- `SERVER_HOST`: 服务器 IP 地址或域名
- `SERVER_USER`: SSH 登录用户名
- `DEPLOY_KEY`: SSH 私钥（用于无密码登录）
- `TARGET_DIR`: 服务器上的目标部署目录（例如：`/home/user/app`）
- `ACR_USERNAME`: 阿里云 ACR 登录用户名
- `ACR_PASSWORD`: 阿里云 ACR 登录密码

#### 应用配置相关（仅 deploy.yml 需要）
- `DB_PASSWORD`: PostgreSQL 密码（建议使用强随机字符串）
- `SESSION_SECRET`: 会话密钥（建议使用强随机字符串）

#### GitHub Variables（非敏感配置）
- `ACR_REGISTRY`: 阿里云 ACR 登录地址，例如 `registry.cn-hangzhou.aliyuncs.com`
- `ACR_NAMESPACE`: 阿里云 ACR 命名空间，例如 `szw321127`

模型 API Key、模型 Base URL、模型名称和 Tavily 搜索 Key 不再放在 GitHub
Secrets 或 `.env` 中。部署完成后登录 `/admin`，在 Key 配置里填写；这些值由
后端保存到 PostgreSQL。

### 3. 生成 SSH 密钥（用于部署）

如果还没有 SSH 密钥对，在本地生成：

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions
```

将公钥添加到服务器：

```bash
ssh-copy-id -i ~/.ssh/github_actions.pub user@your-server
```

将私钥内容添加到 GitHub Secrets 的 `DEPLOY_KEY` 中：

```bash
cat ~/.ssh/github_actions
```

### 4. 准备服务器环境

在服务器上安装 Docker 和 Docker Compose：

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 安装 Docker Compose V2
sudo apt-get update
sudo apt-get install docker-compose-plugin

# 将当前用户添加到 docker 组
sudo usermod -aG docker $USER

# 创建部署目录
mkdir -p /home/user/app
```

## 使用方法

### 自动触发

1. **只构建镜像**：修改对应目录的代码并推送
   - 修改 `packages/backend/` → 触发 `build-backend.yml`
   - 修改 `packages/web-frontend/` → 触发 `build-frontend.yml`

2. **构建并部署**：推送到 main/master 分支
   - 触发 `deploy.yml`
   - 自动构建前后端镜像并部署到服务器

### 手动触发

1. 进入 GitHub 仓库的 `Actions` 页面
2. 选择要运行的 workflow
3. 点击 `Run workflow` 按钮
4. 选择分支并点击 `Run workflow`
5. 需要强制刷新 PostgreSQL、Redis、Caddy 基础镜像时，勾选 `mirror_service_images`

## 图像工作台真实烟测

`deploy.yml` 里内置的是匿名页面和后端健康检查。图像生成、编辑、对象存储、
下载等功能需要登录态和真实 Provider，因此用本地脚本手动跑。这个脚本会创建图像
任务，可能产生模型调用和对象存储费用。

前置条件：

- 已部署包含 `/image-workspace` 的最新前端镜像
- `/admin` 中已经配置图像 Provider 和图像存储 Key
- 已经用普通用户登录 Mira
- 本地准备一张 PNG/JPEG/WebP 测试图，建议小于 5MB

获取 `MIRA_USER_COOKIE`：

1. 在浏览器打开生产站点并登录
2. 打开开发者工具的 Network 面板
3. 刷新 `/image-workspace`
4. 选中任意同域请求，例如 `/api/auth/session`
5. 复制 Request Headers 里的完整 `cookie` 值

运行：

```bash
APP_ORIGIN="https://mira.autos" \
MIRA_USER_COOKIE="<完整 cookie 请求头值>" \
MIRA_SMOKE_SOURCE_IMAGE="/absolute/path/to/source.png" \
node scripts/image-workspace-smoke.mjs
```

可选参数：

```bash
MIRA_SMOKE_MASK_IMAGE="/absolute/path/to/mask.png"
MIRA_SMOKE_PROMPT="A clean product image on a white desk"
MIRA_SMOKE_TASK_TIMEOUT_MS=240000
MIRA_SMOKE_TASK_POLL_MS=2000
```

期望输出包含：

```json
{
  "ok": true,
  "workspaceId": "...",
  "sourceAssetId": "...",
  "finalAssetId": "...",
  "taskCount": 5,
  "assetCount": 2
}
```

该脚本会验证：

- 创建图像工作台
- 上传源图
- 预览和下载源图
- 文生图任务完成
- 上传 mask
- edit、variation、upscale、remove-background 任务完成
- 最终资产预览和下载可用

脚本不会打印 Cookie、Provider Key、对象存储 Key、`storageKey`、`maskKey` 或原始
Provider 响应。

## 镜像标签说明

每次构建会生成以下标签：

- `latest`: 最新的 main/master 分支构建
- `main` 或 `master`: 对应分支的最新构建
- `main-sha-xxxxxxx`: 包含 git commit SHA 的标签

## 查看镜像

构建的镜像会存储在阿里云 ACR：

- 后端: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_backend`
- 前端: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_frontend`
- PostgreSQL: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_postgres`
- Redis: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_redis`
- Caddy: `<ACR_REGISTRY>/<ACR_NAMESPACE>/rednote_caddy`

## 服务器上查看部署状态

SSH 登录到服务器后：

```bash
cd /home/user/app  # 或你的 TARGET_DIR

# 查看运行中的容器
docker compose ps

# 查看日志
docker compose logs -f

# 查看后端日志
docker compose logs -f backend

# 查看前端日志
docker compose logs -f frontend
```

## 故障排除

### 构建失败

1. 检查 Actions 日志查看具体错误
2. 确认 Dockerfile 语法正确
3. 确认依赖安装正常

### 部署失败

1. 检查 SSH 密钥配置是否正确
2. 确认服务器上 Docker 已安装并运行
3. 检查 Secrets 配置是否完整
4. 查看服务器上的 Docker 日志

### 权限问题

如果遇到 "permission denied" 错误：

```bash
# 在服务器上执行
sudo usermod -aG docker $USER
# 退出并重新登录
```

## 本地测试

在推送到 GitHub 之前，可以本地测试构建：

```bash
# 测试后端构建
docker build -f packages/backend/Dockerfile -t test-backend .

# 测试前端构建
docker build -f packages/web-frontend/Dockerfile -t test-frontend .

# 测试 docker-compose
docker-compose up
```
