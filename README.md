# LifeFlow 语音个人规划助手

LifeFlow 是一个移动端优先的语音个人规划工具。它希望把记账、报销、行程、备忘、灵感记录和自然语言查询统一到一个入口里：用户不用填写复杂表单，只需要说一句话或输入一句话，就能把生活信息转成可管理、可查询的数据。

## 产品定位

很多人不是不需要记账和管理行程，而是不愿意维护复杂系统。LifeFlow 的核心思路是降低输入成本：把“我刚刚用微信买咖啡花了18元”“这周五下午有面试”“昨天打车32元已经报销了”这样的自然表达，转成结构化记录。

## 核心功能

- 手机号验证码注册与登录
- 可选密码登录，未设置密码时提示使用其他方式登录
- 用户名设置、密码设置、退出登录、注销账号
- 语音 / 文字输入
- 智能解析账单、收入、行程、备忘、灵感和查询
- 信息不足时通过确认卡片补充字段
- 支出、收入、待报销、日账单、年度统计
- 今日 / 本周 / 本月行程视图
- 备忘与灵感记录
- 待报销事项标记为已报销
- CSV 数据导出，Excel 可直接打开
- localStorage 模拟业务数据持久化
- SQLite 管理账号、手机号、密码和验证码

## 技术栈

- React
- TypeScript
- Tailwind CSS
- Vite
- Node.js
- SQLite
- 通义千问 / DashScope 兼容接口
- 腾讯云短信接口预留

## 项目结构

```text
lifeflow/
  src/              # 前端应用
  server/           # Node 后端与 SQLite 账号接口
  scripts/          # 开发启动脚本
  data/             # 本地 SQLite 数据库，已忽略
  DEPLOY.md         # 部署说明
```

## 本地运行

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

访问：

```text
http://127.0.0.1:5173/
```

后端默认端口：

```text
http://127.0.0.1:8787/
```

## 环境变量

项目不会提交真实密钥。请参考 `.env.example` 在本地创建 `.env`：

```env
QWEN_API_KEY=你的通义千问APIKey
QWEN_MODEL=qwen3.7-plus

TENCENT_SECRET_ID=你的腾讯云SecretId
TENCENT_SECRET_KEY=你的腾讯云SecretKey
TENCENT_SMS_APP_ID=短信应用SDKAppID
TENCENT_SMS_SIGN_NAME=短信签名
TENCENT_SMS_TEMPLATE_ID=短信模板ID
```

检查智能解析配置：

```text
http://127.0.0.1:8787/api/ai/status
```

如果返回 `configured: true`，说明后端已经读取到模型密钥。

## 数据说明

当前版本为了便于演示和快速迭代，采用混合存储：

- 账号数据：SQLite
- 账单、行程、备忘、设置：浏览器 localStorage

如果正式上线，可以继续扩展为完整后端数据表，例如账单表、行程表、备忘表、用户设置表和用户 API Key 配置表。

## 安全说明

- `.env`、日志、数据库文件和构建产物不会提交到 GitHub
- API Key 只应放在本地环境变量或服务器环境变量中
- 前端不展示具体模型服务商名称，只展示“智能解析”
- 当前短信验证码在缺少腾讯云短信配置时会进入本地测试模式

## 产品理念

LifeFlow 不是让用户适应系统，而是让系统适应用户的表达方式。它把自然语言变成结构化生活数据，让用户用最轻的方式记录账单、行程和想法。

