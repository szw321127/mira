# 小红书内容来源与连接器分析

分析日期：2026-06-12

参考仓库：

- https://github.com/cv-cat/Spider_XHS
- https://github.com/cv-cat/XHS_ALL_IN_ONE

## 结论

`Spider_XHS` 是底层小红书 SDK。它不使用官方开放 API，而是通过已登录 Cookie、浏览器请求头、签名参数和一组本地 JS 脚本来模拟小红书 Web 端、创作者平台、蒲公英和千帆的网页请求。

`XHS_ALL_IN_ONE` 是产品化封装。它没有重写采集算法，而是在 FastAPI 后台里把 `Spider_XHS` 相关能力包装成账号管理、Cookie 加密、采集任务、内容库、素材处理和发布中心。

对本项目来说，最合适的接入方式不是把 Python SDK 直接塞进 NestJS `backend`，而是独立做一个“小红书连接器服务”，再通过当前后台已有的 `内容来源` 配置以 `custom` provider 方式接入。

## Spider_XHS 怎么做

### 定位

`Spider_XHS` 是低层 SDK，覆盖：

- PC 端采集：搜索笔记、获取笔记详情、获取评论、获取用户主页、获取用户笔记、获取主页推荐。
- PC 登录：二维码登录、手机号验证码登录、Cookie 登录态生成与校验。
- 创作者平台：查话题、查地点、上传图片/视频、发布图文或视频、获取已发布作品。
- 蒲公英/千帆：KOL 数据、粉丝画像、合作邀请、分销商和商品相关数据。

它的 README 明确提到小红书没有开放完整运营接口，因此项目通过还原 PC 端与创作者平台的签名参数来请求私有接口。

### 采集链路

典型采集流程：

1. 用户提供已登录小红书 Cookie。
2. SDK 从 Cookie 中读取 `a1` 等关键值。
3. Python 组装 API path、query、body。
4. 本地 JS 生成签名类请求头。
5. 使用浏览器风格 headers 请求小红书接口。
6. 返回原始 JSON。
7. 上层 spider 将结果整理、下载媒体、保存 Excel。

常见能力：

- `get_note_info(url, cookies)`：通过笔记 URL 获取详情。
- `search_note(keyword, page, cookies)`：搜索笔记。
- `search_some_note(keyword, require_num, cookies)`：分页搜索并截取指定数量。
- `get_user_all_notes(user_url, cookies)`：分页获取用户发布笔记。
- `get_note_all_comment(url, cookies)`：分页获取评论与子评论。

### 签名与请求参数

项目通过 `execjs` 调用 `static/` 下的 JS 文件生成请求参数，例如：

- `x-s`
- `x-t`
- `x-s-common`
- `x-b3-traceid`
- `x-xray-traceid`
- `x-rap-param`
- `search_id`
- `request_id`

这说明它依赖小红书网页端私有协议和签名逻辑，平台一旦改动，SDK 就可能需要维护。

### 登录态

PC 登录模块会生成初始化 Cookie，并通过小红书相关接口获取安全参数和登录态。它支持：

- 二维码登录。
- 手机号验证码登录。
- 使用已有浏览器 Cookie。
- 获取当前用户信息验证 Cookie 是否可用。

实际业务里最稳妥的产品形态是“用户授权导入 Cookie / 授权扫码登录”，而不是系统默认批量抓取任意账号。

### 创作者发布

创作者平台发布流程大致是：

1. 使用 Creator Cookie。
2. 查地点、查话题。
3. 获取上传凭证。
4. 上传图片或视频素材。
5. 视频需要轮询转码状态。
6. 组装发布 payload。
7. 调用创作者平台发布接口。

它支持图文和视频，但这部分对登录态、素材格式、转码状态、话题和地点匹配都比较敏感，建议在本项目里后置实现。

## XHS_ALL_IN_ONE 怎么做

### 定位

`XHS_ALL_IN_ONE` 是一个完整产品，而不是单纯 SDK。它包括：

- FastAPI 后台。
- React 前端。
- 账号矩阵。
- 笔记发现。
- 内容库。
- 草稿工坊。
- 图片优化。
- 发布中心。
- 自动运营。
- 数据洞察。
- 竞品监控。

它把 `Spider_XHS` 的 SDK 作为底层能力，然后在业务层做权限、账号、任务、存储和 UI。

### Adapter 层

它用 adapter 隔离 SDK，例如：

- `XhsPcApiAdapter`：封装搜索、详情、评论、用户笔记、自身信息。
- `XhsPcLoginAdapter`：封装 PC 端二维码登录、手机号登录、用户信息验证。
- `XhsCreatorLoginAdapter`：封装 Creator 账号登录、Cookie 兑换和校验。
- `XhsCreatorApiAdapter`：封装话题、地点、素材上传、发布。

这个结构值得我们借鉴：业务系统不直接依赖 SDK 内部函数，而是依赖稳定的 adapter / connector contract。

### 账号和 Cookie 管理

它有独立账号模型：

- `PlatformAccount`：平台账号，区分 `platform=xhs` 和 `sub_type=pc|creator`。
- `AccountCookieVersion`：保存加密后的 Cookie 版本。

账号导入时会：

1. 接收 Cookie。
2. 调用小红书接口验证 Cookie。
3. 读取账号信息。
4. 加密保存 Cookie。
5. 支持后续健康检查。

这部分是自建小红书内容来源必须补齐的基础设施。

### 数据采集 API

它把底层 SDK 包装成业务 API：

- `POST /xhs/pc/search/notes`
- `POST /xhs/pc/notes/detail`
- `POST /xhs/pc/notes/comments`
- `POST /xhs/crawl/search-notes`
- `POST /xhs/crawl/note-urls`
- `POST /xhs/crawl/user-notes`
- `POST /xhs/crawl/data`

采集 API 会将原始小红书 payload 标准化成：

- `note_id`
- `note_url`
- `title`
- `content`
- `author_id`
- `author_name`
- `author_avatar`
- `cover_url`
- `image_urls`
- `video_url`
- `likes`
- `collects`
- `comments`
- `shares`
- `tags`
- `raw`

### 任务和内容库

它会把采集动作建成任务，记录：

- task type
- running / completed / failed
- progress
- payload
- error

采集结果可以保存到内容库，图片和视频也可以下载到本地存储。

这个方向适合中长期建设，但我们第一阶段可以先只返回标准化数据，不急着做完整内容库。

## 对本项目的映射

本项目已经有后台内容来源配置，类型包括：

- `tikhub`
- `custom`

当前 `backend` 的小红书导入逻辑期望内容来源提供类似接口：

- `POST {baseUrl}/xhs/posts/import`
- `POST {baseUrl}/xhs/accounts/import`

并且请求时会带上后台配置的 `apiKey`。因此，自建连接器只要实现这两个 endpoint，就能被现有 `custom` provider 接入。

### 推荐服务边界

不要让 NestJS `backend` 直接依赖 Python + Node + execjs 的 SDK。推荐拆成：

```text
rednote backend
  -> custom content provider
    -> xhs-connector service
      -> account/cookie manager
      -> Spider_XHS SDK adapter
      -> normalizer
      -> rate limiter
      -> XHS private web requests
```

这样可以避免：

- NestJS 运行时混入 Python 依赖。
- monorepo dev/start 变复杂。
- SDK 签名逻辑变动影响主业务。
- Cookie 和小红书请求细节污染主后端。

## 建议的连接器接口

### 鉴权

连接器由本项目后台配置：

- `baseUrl`：自建 connector 地址，例如 `http://localhost:8800`。
- `apiKey`：我们自己生成的内部访问密钥，不是小红书提供的 key。

请求头：

```http
Authorization: Bearer <apiKey>
```

### 导入单篇笔记

```http
POST /xhs/posts/import
```

请求：

```json
{
  "url": "https://www.xiaohongshu.com/explore/xxx",
  "noteId": "optional"
}
```

响应建议：

```json
{
  "data": {
    "note": {
      "note_id": "xxx",
      "note_url": "https://www.xiaohongshu.com/explore/xxx",
      "title": "标题",
      "content": "正文",
      "author_name": "作者",
      "author_id": "user-id",
      "cover_url": "https://...",
      "image_urls": ["https://..."],
      "video_url": "",
      "likes": 0,
      "collects": 0,
      "comments": 0,
      "shares": 0,
      "tags": [],
      "raw": {}
    }
  }
}
```

### 导入账号

```http
POST /xhs/accounts/import
```

请求：

```json
{
  "url": "https://www.xiaohongshu.com/user/profile/xxx",
  "userId": "optional",
  "limit": 20
}
```

响应建议：

```json
{
  "data": {
    "account": {
      "user_id": "xxx",
      "profile_url": "https://www.xiaohongshu.com/user/profile/xxx",
      "name": "账号名",
      "description": "简介",
      "followers": 0,
      "following": 0,
      "likes": 0,
      "posts": [
        {
          "note_id": "xxx",
          "title": "标题",
          "content": "正文",
          "image_urls": [],
          "likes": 0,
          "collects": 0,
          "comments": 0
        }
      ],
      "raw": {}
    }
  }
}
```

本项目的 provider 解析逻辑可以解包 `data` 或 `result`，所以响应外层可以保持 `{ data: ... }`。

## 自建连接器需要补的模块

### 1. 账号授权模块

至少支持：

- 导入 PC Cookie。
- 校验 Cookie 是否有效。
- 加密保存 Cookie。
- 标记 Cookie 状态：active / expired / invalid。

后续再考虑：

- 二维码登录。
- 手机验证码登录。
- Creator 账号授权。

### 2. Cookie 安全

必须做：

- 服务端加密保存。
- 不在接口响应里返回完整 Cookie。
- 日志脱敏。
- 支持删除账号授权。
- 支持过期提示。

### 3. 采集适配层

建议封装：

- `importPost(url | noteId)`
- `importAccount(url | userId, limit)`
- `searchNotes(keyword, page)`
- `getComments(noteUrl)`

第一阶段只需要前两个。

### 4. 标准化层

把 SDK 返回的原始 payload 固定成业务字段，避免主后端依赖小红书 raw 结构。

标准字段建议和 `XHS_ALL_IN_ONE` 接近：

- 笔记 ID、URL、标题、正文、作者、封面、图片、视频。
- 点赞、收藏、评论、分享。
- 标签。
- 原始数据 raw。

### 5. 限流和失败处理

需要：

- 单账号请求频率限制。
- 请求间隔。
- 超时。
- 失败重试。
- Cookie 失效识别。
- 429 / 频繁访问识别。

不要做高强度批量抓取，也不要把代理池、绕风控能力作为产品默认能力。

## 风险和边界

这类方案不是官方稳定 API，风险包括：

- 小红书页面协议变化导致签名失效。
- Cookie 过期或触发安全校验。
- 账号风控。
- 数据字段变化。
- 合规和平台条款风险。
- 长期维护成本。

产品上建议明确限定为：

- 用户授权导入。
- 自有账号内容导入。
- 用户手动提供的笔记 URL 导入。
- 合规提示与使用边界展示。

不建议默认做：

- 批量采集竞品内容。
- 大规模关键词爬取。
- 自动化账号行为。
- 规避风控的功能承诺。

## 推荐落地路线

### 第一阶段：最小闭环

1. 搭建独立 `xhs-connector` 服务。
2. 支持内部 `apiKey` 鉴权。
3. 支持导入 PC Cookie 并校验。
4. 实现 `POST /xhs/posts/import`。
5. 实现 `POST /xhs/accounts/import`。
6. 在 admin 的 `内容来源` 中配置 `custom` 的 `baseUrl` 和 `apiKey`。
7. 用 web 前端导入笔记/账号，验证能进入分析和生成链路。

### 第二阶段：可运营

1. 加账号列表和 Cookie 状态。
2. 加健康检查。
3. 加请求限流。
4. 加错误分类。
5. 加采集记录。
6. 加素材缓存。

### 第三阶段：发布能力

1. 支持 Creator 账号。
2. 支持图片上传。
3. 支持图文发布。
4. 支持发布前校验。
5. 支持发布记录和失败重试。

发布能力依赖更强的账号授权与素材处理，不建议第一阶段就接。

## 本项目下一步建议

如果要继续推进，建议新建一个独立包或独立服务：

```text
packages/xhs-connector
```

技术选型可以是：

- Python FastAPI：最贴近 `Spider_XHS`，复用成本最低。
- Node/NestJS 子服务：和 monorepo 更统一，但复用 Python SDK 成本高。

当前更推荐 Python FastAPI，因为底层 SDK 已经是 Python，并且依赖 `execjs` 调用本地 JS。

第一版只需要让它满足本项目 `custom` 内容来源 contract，不需要照搬 `XHS_ALL_IN_ONE` 的完整后台。
