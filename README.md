# MagicAngle API

本项目是一个独立的全栈应用：FastAPI 提供本地 API，并在构建后直接托管 React 前端。浏览器只访问本项目的 `/api/v1/*`，不会直接请求上游服务。它不会绕过上游访问控制；令牌只保存在被 Git 忽略的本地 `.env`，不会进入源码、浏览器响应或应用日志。

## 运行

```bash
cd /Users/xuan.ai/Documents/develop/lumao/magicangle-dashboard
cp .env.example .env
./run.sh
```

OpenAPI 文档：`http://127.0.0.1:8081/docs`

开发前端热更新时，先运行 `python3 -m uvicorn app.main:app --reload --port 8081`，再运行 `npm run dev`。Vite 已将 `/api` 代理到本地后端。

## 路由

| 本地路由 | 上游路由 | 用途 |
| --- | --- | --- |
| `POST /api/v1/home` | 三个 `/lottery_ranking_list/api/rank/*` 排行榜接口 + 推荐列表 | 首页聚合数据 |
| `POST /api/v1/recommendations` | `usergw.../order/recommend/list` | 推荐列表 |
| `POST /api/v1/starters/search` | `usergw.../starter/findstarter` | 发起人昵称搜索 |
| `POST /api/v1/buyers` | `userapi.../order/info/buyer/list` | 买家列表 |
| `POST /api/v1/starters/{starter_id}/military` | `userapi.../getPrescientMilitaryDetail` | 发起人累计奖金与近 7 日战绩 |
| `POST /api/v1/starters/{starter_id}/orders` | `userapi.../getPrescientMilitaryList` | 发起人近 30 日订单与近 5 场战绩 |
| `POST /api/v1/orders/{prescient_id}` | `userapi.../order/info` | 单笔订单详情 |

各列表路由接受 `{"payload": {...}}`，其中 `payload` 只传上游接口要求的分页、筛选等公开参数。认证信息始终从 `.env` 读取。页面不保存接口响应，刷新后会重新查询。

响应会保留 `raw` 上游响应，并额外给出 `orders` 统一视图。已确认的编码会被解码：`502` 总进球、`J00004|11` 比分 `1:1`、`J00003|4` 半全场 `平_平`。没有规则依据的编码会保留为原始代码。

## 测试

```bash
python3 -m unittest discover -s tests -v
```
