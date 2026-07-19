# MagicAngle Dashboard

本项目是一个本地只读的 MagicAngle 数据看板：FastAPI 使用你本人账号的授权信息请求上游接口，React 负责展示排行榜、推荐方案、发起人主页、订单和跟单记录。

浏览器只访问本机 `/api/v1/*`，不会直接拿到上游 Token。认证信息只保存在被 Git 忽略的 `.env` 中，不会进入前端代码、API 响应或应用日志。

> 仅抓取和使用你本人拥有或明确获准访问的账号流量。Token 等同于登录凭据，不要发送给他人，不要上传 Charles 会话文件或包含完整请求头的截图。

## 一、首次安装

要求：

- macOS、Linux 或 Windows WSL。
- Python 3.11 或更高版本。
- Node.js 20 或更高版本。
- Charles 仅在需要获取本人账号认证信息时使用。

```bash
cd magicangle-dashboard

python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .

npm install
cp .env.example .env
```

先不要启动服务。按照下面的 Charles 流程取得 `token` 和本人 `userid`，写入 `.env` 后再运行。

## 二、使用 Charles 获取 Token 和用户 ID

### 2.1 Charles 基础设置

1. 安装并打开 Charles。
2. 打开 `Proxy -> Proxy Settings`，确认 HTTP Proxy 端口为 `8888`。
3. 打开 `Proxy -> SSL Proxying Settings`。
4. 勾选 `Enable SSL Proxying`。
5. 在 Include 中添加以下主机，端口均为 `443`：

```text
*.magicangle.cn
hfive.cfgsdok.com
```

当前代码实际请求的上游主机主要是：

```text
usergw.magicangle.cn
userapi.magicangle.cn
```

只添加需要检查的域名，不建议把 `*:*` 作为长期配置。

### 2.2 抓取 Mac 浏览器中的 H5 请求

如果你直接在 Mac 的浏览器中打开 MagicAngle H5：

1. 在 Charles 中勾选 `Proxy -> macOS Proxy`。
2. 选择 `Help -> SSL Proxying -> Install Charles Root Certificate`。
3. 打开“钥匙串访问”，找到 `Charles Proxy CA` 证书。
4. 双击证书，在“信任”中将“使用此证书时”设为“始终信任”。
5. 完全退出并重新打开浏览器，然后登录你自己的 MagicAngle 账号。

### 2.3 抓取 iPhone 中的 App/H5 请求

Mac 和 iPhone 必须连接同一个局域网。

1. 在 Charles 中打开 `Help -> Local IP Address`，记下 Mac 的局域网 IP，例如 `192.168.1.20`。
2. iPhone 打开 `设置 -> 无线局域网 -> 当前 Wi-Fi -> 配置代理`。
3. 选择“手动”，服务器填写 Mac IP，端口填写 `8888`，认证保持关闭。
4. iPhone 第一次产生请求时，Charles 会弹出连接确认，选择 `Allow`。
5. iPhone Safari 打开 `https://chls.pro/ssl`，下载 Charles 根证书描述文件。
6. 打开 `设置 -> 通用 -> VPN 与设备管理`，安装该描述文件。
7. 打开 `设置 -> 通用 -> 关于本机 -> 证书信任设置`，为 Charles 根证书开启完全信任。
8. 完全关闭并重新打开 MagicAngle App 或 H5 页面，然后重新登录本人账号。

如果 Charles 只能看到 `CONNECT`、看不到请求头和 JSON，请检查根证书是否受信任，以及 `SSL Proxying Settings` 是否包含目标域名。

如果 App 开启了证书固定（certificate pinning），安装 Charles 证书后可能仍无法解密，甚至会提示网络错误。本项目不提供绕过证书固定的方法；请改用可正常抓取的官方 H5 页面，或使用有授权的调试环境。

### 2.4 触发需要的请求

登录后依次打开以下页面，让客户端产生请求：

- 跟单大厅或推荐列表。
- 任意发起人主页。
- 任意方案详情。
- 跟单用户列表。

在 Charles 左侧 Structure 或 Sequence 中筛选 `magicangle.cn`，重点检查 `POST` 请求。可优先寻找这些路径：

```text
/store/api/prescient-hall/order/recommend/list
/lottery_ranking_list/api/starter/findstarter
/lottery-store/api/prescientOrder/getPrescientMilitaryList
/lottery-store/api/prescient-hall/order/info
```

选中请求后查看：

- `Contents -> Request -> Headers`
- `Contents -> Request -> JSON Text` 或 `Body`

### 2.5 找到 `MAGICANGLE_TOKEN`

Token 通常同时出现在以下位置之一：

```text
请求头: token: xxxxxxxxx
JSON 请求体: "token": "xxxxxxxxx"
```

优先使用请求头 `token` 的完整值。复制时不要包含字段名、冒号、引号、首尾空格或换行。

写入 `.env`：

```dotenv
MAGICANGLE_TOKEN=完整token值
```

### 2.6 找到本人的 `MAGICANGLE_USER_ID`

本人用户 ID 通常出现在：

```text
请求头: userid: 123456...
JSON 请求体: "loginUserId": "123456..."
JSON 请求体: "currentUserId": "123456..."
```

优先级建议：

1. 请求头 `userid`。
2. 同一请求中的 `loginUserId`。
3. 同一请求中的 `currentUserId`。

这三个值在同一个登录会话中应当一致。写入：

```dotenv
MAGICANGLE_USER_ID=本人用户ID
```

不要误用以下字段：

| 字段 | 实际含义 |
| --- | --- |
| `starterId` | 被查看的发起人 ID，不一定是当前登录用户 |
| 军事详情请求中的 `userId` | 目标发起人 ID，不一定是本人 ID |
| `adminId` | 排行榜或店铺关联 ID |
| `storeId` | 店铺 ID，常见格式为 `ds...` |
| `prescientId` | 方案/订单 ID，常见格式以 `P` 开头 |

最稳妥的判断方式是：选择一个请求头同时包含 `token` 和 `userid` 的请求，直接使用该请求头中的 `userid`。

### 2.7 可选：获取 Store ID 和客户端参数

如果抓到的请求体包含与你账号相关的 `storeId`，可以配置：

```dotenv
MAGICANGLE_STORE_ID=ds123456
```

没有明确值时保持为空，不要使用别人的店铺 ID。

正常情况下其他客户端参数使用默认值即可。如果上游返回 403 或业务参数错误，可以对照 Charles 请求更新以下字段：

```dotenv
MAGICANGLE_CHANNEL_NO=web
MAGICANGLE_APP_VERSION=1.0.0-web
MAGICANGLE_CLIENT_TYPE=web
MAGICANGLE_ORIGIN=https://hfive.cfgsdok.com
MAGICANGLE_REFERER=https://hfive.cfgsdok.com/
MAGICANGLE_USER_AGENT=Charles中该请求的完整User-Agent
```

## 三、配置 `.env`

最小可用配置：

```dotenv
MAGICANGLE_USER_ID=本人用户ID
MAGICANGLE_TOKEN=本人当前登录Token
MAGICANGLE_STORE_ID=
```

完整参数说明：

| 参数 | 是否必需 | 含义 |
| --- | --- | --- |
| `MAGICANGLE_USER_ID` | 是 | 当前登录账号 ID；发送为 `userid` 请求头，并用于 `loginUserId`、`currentUserId` |
| `MAGICANGLE_TOKEN` | 是 | 当前登录会话 Token；发送为 `token` 请求头和请求体字段 |
| `MAGICANGLE_STORE_ID` | 否 | 本人店铺 ID；没有可靠抓包值时留空 |
| `MAGICANGLE_CHANNEL_NO` | 否 | 上游渠道标识，默认 `web` |
| `MAGICANGLE_APP_VERSION` | 否 | 上游客户端版本，默认 `1.0.0-web` |
| `MAGICANGLE_CLIENT_TYPE` | 否 | 上游客户端类型，默认 `web` |
| `MAGICANGLE_ORIGIN` | 否 | 上游要求的 Origin，默认 `https://hfive.cfgsdok.com` |
| `MAGICANGLE_REFERER` | 否 | 上游要求的 Referer，默认 `https://hfive.cfgsdok.com/` |
| `MAGICANGLE_USER_AGENT` | 否 | 模拟客户端 User-Agent；上游校验变化时按抓包值更新 |
| `UPSTREAM_TIMEOUT_SECONDS` | 否 | 单次上游请求超时秒数，默认 `15` |
| `CORS_ORIGINS` | 否 | 允许调用本地 API 的前端来源，逗号分隔 |

注意：

- `.env` 已被 `.gitignore` 忽略，不要强制提交。
- 修改 `.env` 后必须重启 FastAPI，配置才会重新加载。
- Token 可能在退出登录、重新登录或会话过期后失效；失效后重新抓取即可。
- 不要在终端命令、Issue、聊天消息或截图中直接粘贴真实 Token。

## 四、启动和验证

确保 Python 虚拟环境已激活：

```bash
source .venv/bin/activate
./run.sh
```

`run.sh` 会先构建 React 前端，再启动 FastAPI。打开：

- 看板：`http://127.0.0.1:8081/`
- OpenAPI：`http://127.0.0.1:8081/docs`
- 健康检查：`http://127.0.0.1:8081/health`

检查配置是否被读取：

```bash
curl -s http://127.0.0.1:8081/health | python3 -m json.tool
```

正确配置后应看到：

```json
{
  "status": "ok",
  "tokenConfigured": true,
  "userIdConfigured": true,
  "storeIdConfigured": false
}
```

这里仅显示是否配置，不返回真实 Token 或用户 ID。

测试首页聚合接口：

```bash
curl -sS -X POST http://127.0.0.1:8081/api/v1/home \
  -H 'Content-Type: application/json' \
  -d '{"payload":{}}' | python3 -m json.tool
```

## 五、前端开发模式

终端一：

```bash
source .venv/bin/activate
python3 -m uvicorn app.main:app --reload --port 8081
```

终端二：

```bash
npm run dev
```

打开 `http://127.0.0.1:4173/`。Vite 会把 `/api` 代理到 `http://127.0.0.1:8081`。

## 六、本地 API 路由

| 本地路由 | 上游路由 | 用途 |
| --- | --- | --- |
| `POST /api/v1/home` | 三个 `/lottery_ranking_list/api/rank/*` 接口和推荐列表 | 首页聚合数据 |
| `POST /api/v1/recommendations` | `usergw.../order/recommend/list` | 推荐列表 |
| `POST /api/v1/starters/search` | `usergw.../starter/findstarter` | 发起人昵称搜索 |
| `POST /api/v1/buyers` | `userapi.../order/info/buyer/list` | 买家列表 |
| `POST /api/v1/starters/{starter_id}/military` | `userapi.../getPrescientMilitaryDetail` | 发起人累计奖金与近 7 日战绩 |
| `POST /api/v1/starters/{starter_id}/orders` | `userapi.../getPrescientMilitaryList` | 发起人近 30 日订单与近 5 场战绩 |
| `POST /api/v1/orders/{prescient_id}` | `userapi.../order/info` | 单笔订单详情 |
| `POST /api/v1/orders/batch` | 多次 `userapi.../order/info` | 批量订单详情，最多 10 条 |

各列表路由接受 `{"payload": {...}}`。认证信息始终从服务端 `.env` 读取，前端不会提交 Token。

响应会保留 `raw` 上游响应，并额外给出 `orders` 统一视图。已确认的编码会被解码，例如 `502` 总进球、`J00004|11` 比分 `1:1`、`J00003|4` 半全场 `平_平`。没有规则依据的编码会保留原始代码。

## 七、常见问题

### Charles 中没有手机请求

- 确认 Mac 和手机在同一个局域网。
- 确认手机代理服务器是 Mac 的局域网 IP，不是 `127.0.0.1`。
- 确认 Charles 已允许该设备连接。
- 临时关闭会改变路由的 VPN、代理或 iCloud Private Relay 后重试。
- 检查 macOS 防火墙是否允许 Charles 接收连接。

### 能看到请求，但看不到 Header 和 JSON

- 目标域名没有加入 SSL Proxying Include。
- Charles 根证书未安装或未设为完全信任。
- App 使用证书固定，无法通过普通 Charles 根证书解密。

### 页面或本地接口返回 502

依次检查：

1. `/health` 中 `tokenConfigured` 和 `userIdConfigured` 是否为 `true`。
2. Token 是否已经过期；重新登录后重新抓取。
3. `userid` 是否误填成了 `starterId`、`storeId` 或订单 ID。
4. Charles 中当前成功请求的 `channelNo`、`appVersion`、`clientType`、`Origin`、`Referer`、`User-Agent` 是否与 `.env` 一致。
5. 上游路径或响应结构是否已经变化。

### 修改 `.env` 后仍使用旧 Token

`.env` 在 FastAPI 启动时读取。停止进程后重新运行 `./run.sh`，仅刷新浏览器不会重新加载 Token。

### 抓包完成后的清理

1. 把 iPhone Wi-Fi 的“配置代理”恢复为“关闭”。
2. 在 Charles 中取消 `Proxy -> macOS Proxy`。
3. 不再使用时删除手机上的 Charles 描述文件和根证书信任。
4. 删除不再需要的 Charles Session 文件，尤其是包含登录请求的会话。

## 八、测试

```bash
source .venv/bin/activate
python3 -m unittest discover -s tests -v
npm run build
```

## 赏点小钱

```text
EVM 地址：0xd158387440cc9907008c6f7d3fee1c458e635009
```

![](aa1ab3b5ea9e03fc9945600b36915a96.jpg)
