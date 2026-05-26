# LifeFlow 部署说明

## 推荐：Render Web Service

1. 把项目推到 GitHub。
2. 登录 Render，选择 `New` -> `Web Service`。
3. 连接 GitHub 仓库，选择 LifeFlow 项目。
4. 配置：
   - Runtime: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
5. 添加环境变量：
   - `NODE_ENV=production`
   - `QWEN_API_KEY=你的通义千问/DashScope API Key`
   - `QWEN_MODEL=qwen-plus`
   - 可选：`LIFEFLOW_DATA_DIR=/var/data`
6. 部署完成后，Render 会生成一个公网地址。

如果使用 Render Persistent Disk，可以把挂载路径设置为 `/var/data`，并配置 `LIFEFLOW_DATA_DIR=/var/data`。不配置也能演示，但免费实例重启后本地 SQLite 数据可能丢失。

## 本地生产模式测试

```powershell
npm run build
$env:QWEN_API_KEY="你的key"
$env:NODE_ENV="production"
npm start
```

打开 `http://127.0.0.1:8787`。

## 注意

- 不要把 API Key 写进前端代码、GitHub 仓库或截图里。
- SQLite 数据库默认写在 `data/lifeflow.sqlite`。Render 免费实例文件系统可能不是长期持久化，面试演示够用；如果要长期上线，可以再配置持久磁盘或换云数据库。
