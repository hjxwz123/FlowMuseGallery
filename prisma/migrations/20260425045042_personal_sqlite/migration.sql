-- CreateTable
-- SQLite autoincrement only works for INTEGER PRIMARY KEY. The Prisma schema uses BigInt
-- for compatibility with existing backend code, so initial migration uses INTEGER rowid
-- primary keys while Prisma still exposes ids as BigInt.
CREATE TABLE IF NOT EXISTS "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "status" TEXT NOT NULL DEFAULT 'active',
    "ban_reason" TEXT,
    "ban_expire_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "api_channels" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT,
    "api_secret" TEXT,
    "extra_headers" TEXT,
    "timeout" INTEGER NOT NULL DEFAULT 300000,
    "max_retry" INTEGER NOT NULL DEFAULT 3,
    "rate_limit" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_models" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "model_key" TEXT NOT NULL,
    "icon" TEXT,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "default_params" TEXT,
    "param_constraints" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "supports_image_input" BOOLEAN,
    "supports_resolution_select" BOOLEAN,
    "supports_size_select" BOOLEAN,
    "supports_quick_mode" BOOLEAN,
    "supports_agent_mode" BOOLEAN,
    "supports_auto_mode" BOOLEAN,
    "max_context_rounds" INTEGER,
    "system_prompt" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ai_models_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "api_channels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "model_providers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "adapter_class" TEXT NOT NULL,
    "icon" TEXT,
    "support_types" TEXT NOT NULL,
    "default_params" TEXT,
    "param_schema" TEXT,
    "webhook_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "image_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "model_id" BIGINT NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "project_id" BIGINT,
    "task_no" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_task_id" TEXT,
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "parameters" TEXT,
    "provider_data" TEXT,
    "status" TEXT NOT NULL,
    "result_url" TEXT,
    "thumbnail_url" TEXT,
    "storage_key" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "image_tasks_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "image_tasks_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "api_channels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "image_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "video_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "model_id" BIGINT NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "project_id" BIGINT,
    "task_no" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_task_id" TEXT,
    "prompt" TEXT NOT NULL,
    "parameters" TEXT,
    "provider_data" TEXT,
    "auto_project_shot_id" TEXT,
    "auto_project_workflow_stage" TEXT,
    "auto_project_final_storyboard" BOOLEAN,
    "status" TEXT NOT NULL,
    "result_url" TEXT,
    "thumbnail_url" TEXT,
    "storage_key" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "video_tasks_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "video_tasks_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "api_channels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "video_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "concept" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_assets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_prompt" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "storage_key" TEXT,
    "image_task_id" BIGINT,
    "video_task_id" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_assets_image_task_id_fkey" FOREIGN KEY ("image_task_id") REFERENCES "image_tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "project_assets_video_task_id_fkey" FOREIGN KEY ("video_task_id") REFERENCES "video_tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_inspirations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "episode_number" INTEGER,
    "idea_text" TEXT NOT NULL,
    "context_text" TEXT,
    "plot_text" TEXT,
    "generated_prompt" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_inspirations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "project_inspirations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "project_prompts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "project_prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "system_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "description" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_conversations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "model_id" BIGINT NOT NULL,
    "project_context_id" BIGINT,
    "title" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "composer_mode" TEXT,
    "last_message_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "chat_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_conversations_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chat_conversations_project_context_id_fkey" FOREIGN KEY ("project_context_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversation_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT,
    "files" TEXT,
    "provider_data" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_files" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" BIGINT NOT NULL,
    "conversation_id" BIGINT,
    "project_asset_id" BIGINT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "extension" TEXT NOT NULL,
    "extracted_text" TEXT NOT NULL,
    "text_length" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "chat_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_files_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_files_project_asset_id_fkey" FOREIGN KEY ("project_asset_id") REFERENCES "project_assets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "api_channel_idx_provider_status" ON "api_channels"("provider", "status", "priority");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_model_idx_type_active" ON "ai_models"("type", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_model_idx_type_provider_active" ON "ai_models"("type", "provider", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_model_idx_provider" ON "ai_models"("provider");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "model_providers_provider_key" ON "model_providers"("provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "model_provider_idx_active" ON "model_providers"("is_active", "sort_order");

INSERT INTO "model_providers" (
    "id",
    "provider",
    "display_name",
    "adapter_class",
    "icon",
    "support_types",
    "default_params",
    "param_schema",
    "webhook_required",
    "is_active",
    "sort_order",
    "updated_at"
) VALUES
    (1, 'nanobanana', 'NanoBanana', 'NanobananaImageAdapter', NULL, '["image"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP),
    (2, 'mj', 'midjourney', 'MidjourneyImageAdapter', NULL, '["image"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP),
    (3, 'gptimage', 'GPT- IMAGE', 'GptImageAdapter', NULL, '["image"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP),
    (4, 'doubao', '火山豆包', 'DoubaoImageAdapter', NULL, '["image","video"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP),
    (11, 'qwen', '通义千问', 'QianwenImageAdapter', NULL, '["image"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP),
    (12, 'wanx', '通义万相', 'WanxVideoAdapter', NULL, '["video"]', NULL, NULL, false, true, 100, CURRENT_TIMESTAMP)
ON CONFLICT("provider") DO UPDATE SET
    "display_name" = excluded."display_name",
    "adapter_class" = excluded."adapter_class",
    "icon" = excluded."icon",
    "support_types" = excluded."support_types",
    "default_params" = excluded."default_params",
    "param_schema" = excluded."param_schema",
    "webhook_required" = excluded."webhook_required",
    "is_active" = excluded."is_active",
    "sort_order" = excluded."sort_order",
    "updated_at" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "image_tasks_task_no_key" ON "image_tasks"("task_no");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_user_time" ON "image_tasks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_user_deleted_created" ON "image_tasks"("user_id", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_provider_task" ON "image_tasks"("provider", "provider_task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_project_time" ON "image_tasks"("project_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_status" ON "image_tasks"("status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_user_status_created" ON "image_tasks"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_user_status_deleted_completed" ON "image_tasks"("user_id", "status", "deleted_at", "completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_channel_status_completed" ON "image_tasks"("channel_id", "status", "completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "image_task_idx_status_completed" ON "image_tasks"("status", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "video_tasks_task_no_key" ON "video_tasks"("task_no");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_user_time" ON "video_tasks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_provider_task" ON "video_tasks"("provider", "provider_task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_project_time" ON "video_tasks"("project_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_project_storyboard_lookup" ON "video_tasks"("project_id", "auto_project_final_storyboard", "auto_project_shot_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_project_auto_stage_time" ON "video_tasks"("project_id", "auto_project_workflow_stage", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_status" ON "video_tasks"("status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_user_status_created" ON "video_tasks"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_user_status_completed_created" ON "video_tasks"("user_id", "status", "completed_at", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_channel_status_completed" ON "video_tasks"("channel_id", "status", "completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "video_task_idx_status_completed" ON "video_tasks"("status", "completed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_idx_user_time" ON "projects"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_asset_idx_project_time" ON "project_assets"("project_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_asset_idx_project_kind_time" ON "project_assets"("project_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_asset_idx_user_time" ON "project_assets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_asset_idx_user_kind_time" ON "project_assets"("user_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "project_assets_project_id_image_task_id_key" ON "project_assets"("project_id", "image_task_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "project_assets_project_id_video_task_id_key" ON "project_assets"("project_id", "video_task_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_inspiration_idx_project_time" ON "project_inspirations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_inspiration_idx_user_time" ON "project_inspirations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_inspiration_idx_project_episode" ON "project_inspirations"("project_id", "episode_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_prompt_idx_project_time" ON "project_prompts"("project_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_prompt_idx_user_time" ON "project_prompts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "project_prompt_idx_project_type" ON "project_prompts"("project_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_conv_idx_user_updated" ON "chat_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_conv_idx_user_last_message" ON "chat_conversations"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_conv_idx_user_pin_updated" ON "chat_conversations"("user_id", "is_pinned", "updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_conv_idx_model" ON "chat_conversations"("model_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_conv_idx_project_context" ON "chat_conversations"("project_context_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_msg_idx_conv_time" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_msg_idx_conv_role_time" ON "chat_messages"("conversation_id", "role", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_msg_idx_user_time" ON "chat_messages"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_msg_idx_user_role_time" ON "chat_messages"("user_id", "role", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "chat_files_project_asset_id_key" ON "chat_files"("project_asset_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_file_idx_conv_time" ON "chat_files"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_file_idx_user_time" ON "chat_files"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_file_idx_user_status_time" ON "chat_files"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_file_idx_project_asset_time" ON "chat_files"("project_asset_id", "created_at");
