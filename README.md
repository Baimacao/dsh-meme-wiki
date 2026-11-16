# dsh-meme-wiki · 梗wiki

给 DeepSeek Harness 的**梗查询**。数据来自 [梗wiki（cnmeme.wiki）](https://cnmeme.wiki/)，6932 条中文网络梗。

**解决的问题**：智能体不知道出处时，要么不敢用梗，要么用错了丢人。
现在有地方查。

---

## 两个工具

```
meme_lookup(query)   搜索梗
meme_lookup(slug)    看全文（出处 / 用法 / 例子）
meme_random()        随机一条
```

**查不到时会明说**：「梗wiki 里没查到，不知道出处就不用——别编一个出来。」

---

## 为什么单独成插件

一开始写进了 `dsh-pipem`，但那是错的位置：

- pipem 的定位是「把犯过的错记成 guard」
- 梗知识是**外界资料**，不是智能体犯的错
- 两者零依赖关系，只是恰好都装在一个包里

分出来之后各管各的，pipem 保持专注。

---

## 安装

```bash
dsh plugin --profile <你的profile> add dsh-meme-wiki
```

---

## 设置

| 项 | 默认 | 作用 |
|---|---|---|
| `enabled` | true | 总开关 |
| `cacheHours` | 24 | 缓存多久过期，0 = 不缓存 |
| `defaultLimit` | 5 | 搜索默认返回几条 |
| `timeoutMs` | 15000 | 单次请求超时 |

---

## 数据与缓存

**数据源**：[梗wiki](https://cnmeme.wiki/)，公共只读 API，不需要登录。

```
GET /api/v1/wiki/entries?q=<词>&limit=N&offset=N   搜索
GET /api/v1/wiki/entries/<slug>                    详情
GET /api/v1/wiki/entries/random                    随机
```

**缓存**：`<DSH_HOME>/heart/meme-cache/<sha1>.json`，存的是 API 原始返回。
随机结果**不缓存**——缓存了就固定了，失去随机的意义。

---

## 一条设计原则

渲染结果时带这句：

> （内容来自 cnmeme.wiki，不是我的知识。用之前看清用法，对不上就别硬套。）

**查到不等于该用。** 库里有出处，但用法对不对还得自己判断。

---

## License

MIT
