# FlowMuse Personal

FlowMuse Personal 是本项目裁剪后的本地个人版：不需要登录、注册、邮件服务、Redis 队列、对象存储或商业支付系统。应用在个人电脑上运行，数据写入 SQLite，生成结果和上传资源写入本机 `uploads/` 目录。

## 当前形态

- 前端：React + Vite
- 后端：NestJS
- 数据库：SQLite，本地文件
- 文件存储：本地 `uploads/`
- 任务执行：后端进程内本地任务执行器
- API Key：通过左下角设置弹窗保存，渠道固定为 `nanobanana`、`mj`、`gptimage`、`doubao`、`qwen`、`wanx`

## 已移除的外部依赖

- Redis / BullMQ：图片和视频任务改为本地执行器。
- 腾讯云 COS：所有生成图片、视频、缩略图和上传文件都保存到本地。
- SMTP / 邮件：个人版不需要注册、找回密码、邮箱验证或邮件发送。
- MySQL：个人版使用 SQLite。
- 商业功能：支付、套餐、会员、积分、兑换码、邀请奖励等模块不再作为个人版运行路径。

## 本地开发

### 1. 安装依赖

```bash
npm install
cd frontend && npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env`，默认配置即可本地运行：

```bash
cp .env.example .env
```

关键配置：

```env
DATABASE_URL="file:./data/flowmuse.sqlite"
APP_PUBLIC_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5173"
APP_ENCRYPTION_KEY="change-me-32-bytes-minimum-length"
```

说明：`DATABASE_URL` 的相对路径以 `prisma/schema.prisma` 所在目录为基准，因此默认数据库文件会位于 `prisma/data/flowmuse.sqlite`。

### 3. 初始化数据库

个人版当前使用手写 SQLite 初始 SQL。不要使用 `prisma migrate dev` 初始化数据库；Prisma 5.22 对 SQLite `BigInt` 自增主键存在 schema engine 空错误。

```bash
npm run prisma:generate
npm run prisma:init
```

如果之前已经执行过旧的 `prisma migrate dev`，并在 seed 时遇到 `Null constraint violation on the fields: (id)`，先删除旧的本地 SQLite 文件后重新初始化：

```bash
rm -f prisma/data/flowmuse.sqlite prisma/data/flowmuse.sqlite-journal
npm run prisma:init
```

### 4. 启动开发服务

```bash
npm run dev:all
```

默认地址：

- 后端 API：`http://localhost:3000/api`
- 前端页面：`http://localhost:5173`
- 本地资源：`http://localhost:3000/uploads/...`

## Docker 本地部署

```bash
docker compose up -d --build
```

持久化目录：

- `./data/sqlite`：SQLite 数据库目录
- `./data/uploads`：本地生成资源和上传文件

默认端口：

- 后端：`3000`
- 前端：`3001`

可通过环境变量覆盖：

```bash
BACKEND_PORT=6000 FRONTEND_PORT=6001 docker compose up -d --build
```

## 个人版使用方式

1. 打开前端页面。
2. 不需要登录，系统使用固定本地用户。
3. 点击左下角设置按钮，在固定渠道中填写自己的 Base URL 和 API Key，再添加模型。
4. 创建项目、聊天或发起图片/视频生成任务。
5. 结果保存到 SQLite 和本地 `uploads/`。

## 常用命令

```bash
npm run prisma:generate
npm run prisma:init
npm run build
cd frontend && npm run type-check
```

## 目录说明

```text
prisma/                 SQLite schema 与迁移
src/                    NestJS 后端
src/local-runner/       本地图片/视频任务执行器
src/storage/            本地 uploads 存储服务
frontend/               React + Vite 前端
uploads/                本地运行时资源目录
data/                   Docker 持久化数据目录
```
