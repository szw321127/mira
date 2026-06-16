# RedNote XHS Connector

独立的小红书连接器服务，供 `packages/backend` 通过内部 HTTP API 调用。

## 安装依赖

```bash
cd packages/xhs-connector
python3 -m pip install -r requirements.txt
```

## 启动

先在本地 `.env` 或系统环境变量中配置：

```env
XHS_CONNECTOR_API_KEY=rednote-local-xhs-connector-key
```

```bash
pnpm dev
```

默认端口是 `8800`，后端对应配置：

```env
XHS_CONNECTOR_BASE_URL=http://localhost:8800
XHS_CONNECTOR_API_KEY=rednote-local-xhs-connector-key
```

## Spider_XHS 适配

运行真实搜索前，需要把 `Spider_XHS` 克隆到本地，并配置路径：

```env
SPIDER_XHS_PATH=/absolute/path/to/Spider_XHS
```

connector 不保存用户 Cookie。后端解密 Cookie 后只在本次请求中传给
connector。

## 接口

- `GET /health`
- `POST /xhs/auth/validate`
- `POST /xhs/posts/search`

所有业务接口都需要：

```http
Authorization: Bearer <XHS_CONNECTOR_API_KEY>
```
