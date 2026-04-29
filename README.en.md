<p align="center">
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="frontend/public/icons/icon-192x192.png" width="96" height="96" alt="FlowMuse logo" />
</p>

<h1 align="center">FlowMuse</h1>

<p align="center">
  A local-first AI image and video creation workspace that brings prompts, generation tasks, project assets, chat workflows, and a desktop app into one place.
</p>

<p align="center">
  <a href="https://github.com/hjxwz123/FlowMuseGallery">
    <img alt="GitHub Repo" src="https://img.shields.io/badge/GitHub-FlowMuseGallery-181717?style=flat-square&logo=github" />
  </a>
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=fff" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-local-003B57?style=flat-square&logo=sqlite" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-ready-47848F?style=flat-square&logo=electron&logoColor=fff" />
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a>
  ·
  <a href="#-screenshots">Screenshots</a>
  ·
  <a href="#-features">Features</a>
  ·
  <a href="#-core-modules">Core Modules</a>
  ·
  <a href="#-desktop-app">Desktop App</a>
  ·
  <a href="#-project-structure">Project Structure</a>
</p>

---

## 🖼️ Screenshots

FlowMuse is centered around a creation workspace. It connects the home entry, quick generation, conversational workflows, an online canvas, and task tracking into a local-first creative pipeline.

![FlowMuse Home](image/index.jpg)

## ✨ Features

| Capability | Description |
| --- | --- |
| Local-first | SQLite stores data, local `uploads/` stores generated outputs and uploaded assets, and the desktop app writes into the system user data directory. |
| Browser and desktop | The same codebase runs as a browser service or as a packaged Electron app for macOS / Windows. |
| Unified creation entry | Image creation, video creation, references, project context, and prompt optimization live in one workspace. |
| Conversational workflows | Supports chat models, file uploads, project imports, image agents, video storyboard planning, and automated creation flows. |
| Project asset memory | Projects can store descriptions, assets, documents, inspirations, project-level prompts, and historical outputs. |
| Trackable tasks | Image / video tasks are managed together with status, results, failure reasons, retry, delete, and download actions. |
| Built-in prompt library | Image and video prompts are loaded from local JSON files, with search, filtering, and one-click application. |
| Optional COS storage | Local storage is the default; Tencent Cloud COS can be configured when public asset URLs are needed. |

## 🧭 App Navigation

| Page | Purpose |
| --- | --- |
| Home | Shows FlowMuse entry points and a local artwork hero carousel. |
| Gallery | Browse completed local image and video works in a masonry layout. |
| Quick Mode | Start image or video generation tasks directly. |
| Workflow Mode | Use conversation to drive image agents, video storyboards, and automated creation. |
| Online Canvas | Sketch, annotate, compose layouts, export PNGs, or save results to a project. |
| Projects | Manage project descriptions, assets, documents, inspirations, and project-level prompts. |
| Task Center | Review task status, failure reasons, results, and follow-up actions. |
| Settings | Configure chat models, media providers, and optional COS storage. |

## 🧩 Core Modules

### Quick Mode

![Quick Mode](image/fasemode.jpg)

- Image creation: text-to-image, image-to-image, reference images, multiple models, aspect ratio, and size parameters.
- Video creation: text-to-video, image-to-video, reference image / video / audio inputs, and model-specific parameters.
- Project context: reuse assets from projects to keep creations consistent within the same theme.
- Prompt optimization: expand short descriptions into richer visual prompts.
- Prompt library: search, filter, and apply prompts from local JSON data.

### Creative Workflow

![Chat Creation](image/chat.jpg)

- Multi-turn chat and conversation history.
- Chat model selection and ordering.
- Project context import.
- Image uploads as visual references.
- Document uploads as contextual material.
- Create image tasks directly inside chat.
- Plan video storyboards and submit video tasks inside chat.
- Automated video flows organize task parameters based on storyboard planning, previous shots, tail-frame images, and model capabilities.

![Automated Workflow](image/automode.jpg)

### Projects

- Create, edit, and delete projects.
- Upload image, video, and document assets.
- Import historical generated works.
- Search and filter project assets.
- Generate project descriptions with AI.
- Manage project inspirations and video storyboard prompts.
- Maintain project-level image / video prompts for more stable style consistency.

### Online Canvas

![Online Canvas](image/canvas.jpg)

- Freehand brush, eraser, rectangle, circle, line, text, and image import.
- Select, drag, scale, rotate, undo, and redo.
- Export PNG.
- Import / export canvas JSON.
- Save canvas results as project image assets.

### Task Center

![Task Center](image/task.jpg)

- Unified image and video task list.
- Filter by all, pending, generating, completed, and failed.
- Failed tasks show clear failure reasons.
- Cancel, retry, delete, and download actions.
- Midjourney tasks support upscale, variation, reroll, inpainting, and other follow-up actions.

## 🤖 Models and Providers

FlowMuse has fixed built-in media providers. Users only need to enter each provider's `Base URL` and `API Key` in settings.

| Provider | Purpose |
| --- | --- |
| NanoBanana | Image generation and editing |
| Midjourney | Image generation and follow-up actions |
| GPT Image | Image generation |
| Volcengine Doubao | Image / video generation |
| Tongyi Qianwen | Image generation |
| Tongyi Wanxiang | Video generation |

Built-in media models:

| Type | Models |
| --- | --- |
| Image | NanoBanana, Nano Banana Pro, NanoBanana 2, GPT Image 2, Midjourney, Seedream 4.5, Seedream 5.0 Lite, Qwen Image 2.0 Pro, Wanxiang 2.7 Image |
| Video | HappyHorse 1.0, Seedance 2.0, Seedance 2.0 Fast, Wanxiang 2.7 Video, Wanxiang 2.7 Text-to-Video, Wanxiang 2.7 Image-to-Video |

## 💬 Chat File Uploads

| Limit | Value |
| --- | --- |
| Max files per message | `5` |
| Max file size | `20MB` |
| Supported extensions | `txt`, `md`, `csv`, `json`, `html`, `pdf`, `docx`, `pptx`, `xlsx` |

Uploaded documents are parsed into text and used as chat context.

## 🏗️ Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS |
| Backend | NestJS 10, TypeScript |
| Database | SQLite, Prisma |
| Desktop | Electron, electron-builder |
| File processing | Sharp, Multer, PDF / DOCX / PPTX / XLSX parsing |
| Task execution | Backend in-process local task runner |

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
cd frontend && npm install
cd ..
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Common configuration:

```env
DATABASE_URL="file:./data/flowmuse.sqlite"
PORT=3000
FRONTEND_PORT=3001
BACKEND_URL="http://127.0.0.1:3000"
APP_PUBLIC_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:5173"
APP_ENCRYPTION_KEY="change-me-32-bytes-minimum-length"
```

> `APP_ENCRYPTION_KEY` encrypts stored API keys. Replace it with your own long random string before first launch.

### 3. Initialize the database

```bash
npm run prisma:generate
npm run prisma:init
```

Initialization creates the SQLite schema and writes fixed providers, built-in models, and local user data.

### 4. Start browser mode

```bash
npm run dev:all
```

Default addresses:

| Service | Address |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3000/api` |
| Local assets | `http://localhost:3000/uploads/...` |

## 📦 Production

Build:

```bash
npm run build:all
```

Start:

```bash
npm run start:all
```

Default production frontend address:

```text
http://localhost:3001
```

## 🖥️ Desktop App

Run in development:

```bash
npm run desktop:dev
```

Generate an unpacked app directory:

```bash
npm run desktop:pack
```

Generate installers:

```bash
npm run desktop:dist
```

Output directory:

```text
release/
```

Current desktop packaging targets:

| System | Artifact |
| --- | --- |
| macOS | `dmg` |
| Windows | `nsis` installer |

## 🐳 Docker

```bash
docker compose up -d --build
```

Default ports:

| Service | Port |
| --- | --- |
| Backend | `3000` |
| Frontend | `3001` |

Persistent directories:

| Directory | Contents |
| --- | --- |
| `./data/sqlite` | SQLite database |
| `./data/uploads` | Generated outputs and uploaded assets |

Override ports:

```bash
BACKEND_PORT=6000 FRONTEND_PORT=6001 docker compose up -d --build
```

## 💾 Data Directories

### Browser Service Mode

| Content | Default Location |
| --- | --- |
| SQLite | `prisma/data/flowmuse.sqlite` |
| Local assets | `uploads/` |

Relative paths in `DATABASE_URL` are resolved from the directory that contains `prisma/schema.prisma`.

### Desktop App Mode

| System | User Data Directory |
| --- | --- |
| macOS | `~/Library/Application Support/FlowMuse/` |
| Windows | `%APPDATA%/FlowMuse/` |
| Linux | `~/.config/FlowMuse/` |

Desktop data directory contents:

| Path | Contents |
| --- | --- |
| `data/flowmuse.sqlite` | SQLite database |
| `uploads/` | Local generated outputs and uploaded assets |
| `security/encryption-key` | API key encryption key |

## 📁 Project Structure

```text
electron/                       Electron desktop entry
frontend/                       React + Vite frontend
frontend/public/json/           Local prompt data
frontend/public/icons/          App icons
frontend/public/model-icons/    Model icons
image/                          README screenshots
prisma/                         Prisma schema, SQLite init SQL, default model configuration
scripts/                        Initialization scripts
src/                            NestJS backend
src/adapters/                   Model adapters
src/chat/                       Chat, file parsing, automated workflows
src/images/                     Image tasks
src/videos/                     Video tasks
src/projects/                   Projects and asset management
src/storage/                    Local and COS storage
src/local-runner/               Local task runner
uploads/                        Local assets directory for browser service mode
release/                        Desktop packaging output
```

## 🧠 Prompt Data

| Type | Path |
| --- | --- |
| Image prompts | `frontend/public/json/prompts.json` |

Image prompt source:

```text
https://github.com/glidea/banana-prompt-quicker
```

Prompt data is read directly from the local JSON file at runtime. No remote prompt fetch is required.

## 🧰 Common Commands

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

## 🔗 Repository

```text
https://github.com/hjxwz123/FlowMuseGallery
```

## 📄 License

FlowMuse is licensed under the MIT License. See [LICENSE](LICENSE) for details.
