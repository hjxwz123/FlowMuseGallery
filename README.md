# FlowMuse

FlowMuse 是一个本地优先的 AI 图片与视频创作工作台。它把提示词灵感、图片生成、视频生成、对话式创作、项目素材管理、任务追踪和画板草稿整合在同一个应用里，适合在自己的电脑或服务器上长期沉淀创作资产。

项目支持两种运行方式：

- 浏览器访问：启动后端和前端服务，通过浏览器使用。
- 桌面应用：使用 Electron 打包为 macOS / Windows 桌面应用。

## 功能亮点

- **本地优先**：数据默认写入 SQLite，生成结果和上传资源默认写入本地 `uploads/`，方便备份、迁移和长期保存。
- **打开即用**：没有账号注册流程，进入应用后在左下角设置里填入自己的 API 地址和密钥即可开始创作。
- **图片与视频统一入口**：同一个创作页支持图片创作、视频创作、参考素材输入、项目上下文引用和提示词优化。
- **固定媒体模型库**：内置图片 / 视频模型清单和渠道类型，用户只需要为对应渠道填写 `Base URL` 和 `API Key`。
- **对话式工作流**：支持聊天模型、文件上传、项目上下文导入、图片创作 Agent、视频分镜规划和自动化创作流程。
- **项目化沉淀**：项目可以保存描述、素材、文档、灵感、项目级提示词和历史生成作品，后续创作可直接复用。
- **任务可追踪**：图片和视频任务集中展示状态、结果、失败原因，并支持重试、删除、下载和部分模型的后续操作。
- **内置提示词库**：图片与视频提示词从本地 JSON 加载，不依赖运行时远程抓取，支持搜索、筛选和一键套用。
- **可选对象存储**：默认本地保存；如果配置腾讯云 COS，生成结果和项目上传资源可写入 COS，便于需要公网素材 URL 的视频工作流。
- **浏览器和桌面双端**：同一套代码既能部署成 Web 服务，也能打包为 `dmg` / `exe` 桌面应用。

## 核心功能

### 首页

- 展示 FlowMuse 的入口和创作引导。
- 如果已经有本地生成作品，首页 Hero 会轮播本地图片 / 视频结果。
- 如果还没有作品，使用内置展示素材作为默认视觉内容。
- 顶部提供 GitHub 入口、语言切换和快速导航。

### 画廊

- 以瀑布流展示本地已经完成的图片和视频作品。
- 画廊只作为作品总览，不进入公开详情页。
- 空状态会引导进入创作工作台生成第一份作品。

### 快速模式

快速模式是图片和视频生成的统一入口。

图片创作支持：

- 文生图。
- 图生图 / 参考图输入。
- 多模型选择。
- 画幅、尺寸、分辨率等模型能力相关参数。
- 从项目素材中选择参考图。
- 从本地上传参考素材。
- 使用内置网络提示词快速填充提示词。
- 使用 AI 将简短描述优化为多个提示词版本。

视频创作支持：

- 文生视频。
- 图生视频。
- 参考图片、参考视频、音频等素材输入。
- Seedance、万相等视频模型的参数适配。
- 从项目素材中选择可复用素材。
- 使用本地视频提示词库快速开始。
- 对本地视频参考素材进行公网可用性检查：需要公网视频 URL 的模型会在未配置 COS 时给出明确提示。

### 创作工作流

工作流模式以聊天为入口，适合把一个创意逐步推进为可执行的图片或视频任务。

支持能力：

- 多轮对话。
- 会话历史。
- 聊天模型选择。
- 导入项目上下文。
- 上传图片作为视觉参考。
- 上传文档作为上下文材料。
- 让 AI 基于项目描述、素材、文档和历史灵感生成更完整的创作方案。
- 在聊天中直接发起图片任务。
- 在聊天中规划视频分镜并提交视频任务。

文件上传规则：

- 单条消息最多上传 `5` 个文件。
- 单文件大小上限 `20MB`。
- 支持扩展名：`txt`、`md`、`csv`、`json`、`html`、`pdf`、`docx`、`pptx`、`xlsx`。
- 文档解析后会作为聊天上下文参与回答。

### 自动视频流程

自动视频流程用于把主题、项目设定和素材组织成连续镜头。

支持能力：

- 根据主题生成分镜剧本。
- 根据目标时长拆分镜头。
- 为每个镜头生成视频提示词。
- 根据模型能力处理参考图片、上一镜视频和上一镜尾帧。
- 对万相类视频模型处理首镜参考图、后续镜头参考视频和尾帧衔接。
- 任务提交失败时在对话中展示明确错误，而不是静默关闭流程。

### 项目管理

项目用于长期保存同一主题下的创作资产。

项目可保存：

- 项目名称。
- 主题 / 灵感。
- 项目描述。
- 图片素材。
- 视频素材。
- 文档素材。
- 从任务导入的生成作品。
- 灵感条目。
- 项目级图片提示词。
- 项目级视频提示词。

项目工作区支持：

- 新建、编辑、删除项目。
- 上传本地图片、视频和文档。
- 导入历史生成作品。
- 筛选图片、视频、文档。
- 搜索素材名称、描述和提示词。
- 使用 AI 生成项目描述。
- 使用 AI 生成灵感对应的视频分镜提示词。
- 维护项目主风格提示词，供后续图片生成复用。

### 在线画板

画板适合快速整理构图、草图和标注。

支持能力：

- 自由画笔。
- 橡皮擦。
- 矩形、圆形、直线。
- 文本对象。
- 图片导入。
- 选中、拖动、缩放、旋转。
- 撤销 / 重做。
- 导出 PNG。
- 导出和导入画板 JSON。
- 将画板成品保存为项目图片素材。

### 任务中心

任务中心统一管理图片和视频生成任务。

支持能力：

- 按状态筛选：全部、等待中、生成中、已完成、失败。
- 展示任务类型、模型、提示词、创建时间、完成时间。
- 失败任务展示具体失败原因。
- 支持取消、重试、删除、下载。
- 对 Midjourney 任务展示可用的后续操作，例如放大、变体、重新生成、局部重绘等。
- 局部重绘支持在图片上涂抹蒙版并重新提交编辑任务。

### 系统设置

系统设置位于左下角设置按钮内，不使用单独设置页面。

可配置内容：

- 对话模型 API 基地址。
- 对话模型 API Key。
- 提示词优化模型名。
- 对话模型新增、编辑、删除和排序。
- 固定媒体渠道的 `Base URL` 和 `API Key`。
- 腾讯云 COS 配置。

媒体渠道固定为：

- `NanoBanana`
- `Midjourney`
- `GPT Image`
- `火山豆包`
- `通义千问`
- `通义万相`

内置媒体模型包括：

- `NanoBanana`
- `Nano Banana Pro`
- `NanoBanana 2`
- `GPT Image 2`
- `Midjourney`
- `Seedream 4.5`
- `Seedream 5.0 Lite`
- `Qwen Image 2.0 Pro`
- `万相 2.7 Image`
- `Seedance 2.0`
- `Seedance 2.0 Fast`
- `万相2.7 Video`
- `万相2.7 文生视频`
- `万相2.7-图生视频`

## 技术栈

- 前端：React、Vite、TypeScript、Tailwind CSS。
- 后端：NestJS、TypeScript。
- 数据库：SQLite、Prisma。
- 文件处理：Sharp、Multer、PDF / DOCX / PPTX / XLSX 解析。
- 桌面端：Electron、electron-builder。
- 本地任务执行：后端进程内任务执行器。

## 数据目录

### 浏览器服务模式

默认数据位置：

- SQLite：`prisma/data/flowmuse.sqlite`
- 本地资源：`uploads/`

`DATABASE_URL` 的相对路径以 `prisma/schema.prisma` 所在目录为基准。

### 桌面应用模式

桌面应用会写入系统用户数据目录：

- macOS：`~/Library/Application Support/FlowMuse/`
- Windows：`%APPDATA%/FlowMuse/`
- Linux：`~/.config/FlowMuse/`

目录内容：

- `data/flowmuse.sqlite`：SQLite 数据库。
- `uploads/`：本地生成结果和上传资源。
- `security/encryption-key`：用于加密本机 API Key 的密钥。

## 环境要求

- Node.js `20.19+`。
- npm。
- macOS / Windows / Linux 均可运行浏览器服务模式。
- 打包桌面应用时建议在目标系统上打包对应安装包。

## 安装依赖

```bash
npm install
cd frontend && npm install
cd ..
```

## 环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

常用配置：

```env
DATABASE_URL="file:./data/flowmuse.sqlite"
PORT=3000
FRONTEND_PORT=3001
BACKEND_URL="http://127.0.0.1:3000"
APP_PUBLIC_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5173"
APP_ENCRYPTION_KEY="change-me-32-bytes-minimum-length"
```

说明：

- `DATABASE_URL` 控制 SQLite 文件位置。
- `APP_PUBLIC_URL` 用于生成本地 `/uploads/...` 资源 URL。
- `APP_ENCRYPTION_KEY` 用于加密保存 API Key，首次运行前请改成自己的长随机字符串。

## 初始化数据库

```bash
npm run prisma:generate
npm run prisma:init
```

初始化会创建 SQLite 表结构，并写入固定的渠道、模型和本地用户数据。

如果需要重置本地数据库：

```bash
rm -f prisma/data/flowmuse.sqlite prisma/data/flowmuse.sqlite-journal prisma/data/flowmuse.sqlite-wal prisma/data/flowmuse.sqlite-shm
npm run prisma:init
```

## 浏览器运行

开发模式：

```bash
npm run dev:all
```

默认地址：

- 前端页面：`http://localhost:5173`
- 后端 API：`http://localhost:3000/api`
- 本地资源：`http://localhost:3000/uploads/...`

生产构建：

```bash
npm run build:all
```

生产运行：

```bash
npm run start:all
```

默认生产前端地址：

- `http://localhost:3001`

## 桌面应用

开发运行：

```bash
npm run desktop:dev
```

生成未压缩应用目录：

```bash
npm run desktop:pack
```

生成安装包：

```bash
npm run desktop:dist
```

输出目录：

- `release/`

当前配置：

- macOS：生成 `dmg`。
- Windows：生成 `nsis` 安装包。

## Docker 运行

```bash
docker compose up -d --build
```

默认端口：

- 后端：`3000`
- 前端：`3001`

持久化目录：

- `./data/sqlite`
- `./data/uploads`

覆盖端口示例：

```bash
BACKEND_PORT=6000 FRONTEND_PORT=6001 docker compose up -d --build
```

## 常用命令

```bash
npm run prisma:generate
npm run prisma:init
npm run dev:all
npm run build:all
npm run start:all
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist
cd frontend && npm run type-check
```

## 目录结构

```text
electron/               Electron 桌面端入口
frontend/               React + Vite 前端
frontend/public/json/   本地提示词数据
frontend/public/icons/  应用图标
frontend/public/model-icons/ 模型图标
prisma/                 Prisma schema、SQLite 初始化 SQL、默认模型配置
scripts/                初始化脚本
src/                    NestJS 后端
src/adapters/           模型适配器
src/chat/               对话、文件解析、自动工作流
src/images/             图片任务
src/videos/             视频任务
src/projects/           项目与素材管理
src/storage/            本地与 COS 存储
src/local-runner/       本地任务执行器
uploads/                浏览器服务模式下的本地资源目录
release/                桌面打包产物
```

## 提示词数据

图片提示词位于：

```text
frontend/public/json/prompts.json
```

视频提示词位于：

```text
frontend/public/json/prompts-videos.json
```

图片提示词来源标注：

```text
https://github.com/glidea/banana-prompt-quicker
```

运行时直接读取本地 JSON 文件，不需要远程拉取提示词数据。

## 仓库

```text
https://github.com/hjxwz123/FlowMuseGallery
```
