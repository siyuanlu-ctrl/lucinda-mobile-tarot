# Lucinda 的移动塔罗牌

一个适配手机网页的塔罗抽牌项目，基于 `Vite + React + TypeScript`，并提供一次性微信分享链接能力。

## 功能

- 同一次占卜内抽出的牌不会重复
- 使用标准 78 张塔罗牌加 1 张空白牌
- 点击抽牌时按系统秒数判定正逆位
- 展示牌名、正位/逆位、抽牌次序
- 支持牌背预览和全部牌面列表页
- 预留多牌组导入能力
- 支持管理员生成一次性分享链接
- 第一次成功打开后自动核销 token，再次访问失效
- 仅允许微信内访问受保护内容
- 访问许可默认仅保留 10 分钟，并绑定首次打开设备
- 牌面图片也通过后端实时校验与代理
- 管理页可查看最近访问日志

## 启动

```bash
npm install
npm run server:watch
npm run dev
```

前端开发地址默认是本机开发地址，后端接口默认是 `http://127.0.0.1:8787`，Vite 已经代理 `/api` 到后端。

## 一次性分享链接

1. 复制 `.env.example` 为 `.env`
2. 设置 `SHARE_ADMIN_KEY`
3. 打开 `/manage`
4. 输入管理员口令后生成新链接
5. 把生成的地址分享到微信
6. 对方首次成功打开后，该链接立即失效
7. 当前访问许可默认只保留 10 分钟，超时或换设备后必须重新分享
8. 如果生成的是 `localhost`、`127.0.0.1`、`192.168.*`、`172.16.*`、`10.*` 这类地址，非同一网络用户无法打开

## Render 一键部署

推荐直接部署到 Render 的 `Web Service`。

- Build Command：`npm install && npm run build`
- Start Command：`npm run server`

需要配置的环境变量：

- `SHARE_ADMIN_KEY`
- `PUBLIC_APP_URL=https://你的服务名.onrender.com`
- `ACCESS_TTL_MINUTES=10`
- `REDIS_URL`

说明：

- 生产环境优先使用标准 `REDIS_URL`，适配 Render Key Value / Valkey
- 如果没有 `REDIS_URL`，也兼容 `UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`
- 本地开发仍可使用文件存储
- 受保护内容仅允许微信内访问，且图片也通过后端代理校验

## 最短上线步骤

1. 把项目上传到 GitHub
2. 登录 Render
3. New -> Web Service
4. 连接这个 GitHub 仓库
5. Build Command 填：`npm install && npm run build`
6. Start Command 填：`npm run server`
7. 在 Render 新建一个 Key Value 服务，复制 `REDIS_URL`
8. 在 Web Service 的环境变量里填：
   - `SHARE_ADMIN_KEY`
   - `PUBLIC_APP_URL=https://你的服务名.onrender.com`
   - `ACCESS_TTL_MINUTES=10`
   - `REDIS_URL`
9. 部署完成后打开：
   `https://你的服务名.onrender.com/manage`

## 牌组扩展

1. 在 `public/assets/decks/<deck-name>/` 中放置图片资源
2. 推荐命名：
   - `back.jpg`
   - `blank-special.jpg`
   - `major-0.jpg` 到 `major-21.jpg`
   - `wands-ace.jpg`、`cups-2.jpg`、`swords-king.jpg` 等
3. 在 `src/data/decks/` 下新增一个 deck 文件
4. 调用 `createStandardTarotDeck(...)` 生成牌组
5. 在 `src/data/decks/index.ts` 中注册
6. 首页可切换到“牌面列表”检查图片是否已经接入成功
