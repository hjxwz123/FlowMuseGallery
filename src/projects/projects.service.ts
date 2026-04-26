import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { parseSqliteJson } from '../common/utils/sqlite-json.util';
import { normalizeUploadedFileName } from '../common/utils/upload-filename.util';
import { extractAutoProjectAssetMetadata } from '../common/utils/task-provider-data.util';
import { extractAutoProjectAgentFromProviderData } from '../chat/auto-project-workflow.metadata';
import { ChatFileParserService } from '../chat/chat-file-parser.service';
import { ProjectAssetKind, ProjectAssetSource, ProjectPromptType, TaskStatus } from '../common/prisma-enums';
import { PromptOptimizeService } from '../prompt-optimize/prompt-optimize.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import { StorageService } from '../storage/storage.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectInspirationDto } from './dto/create-project-inspiration.dto';
import { CreateProjectPromptDto } from './dto/create-project-prompt.dto';
import { GenerateProjectDescriptionDto } from './dto/generate-project-description.dto';
import { GenerateProjectInspirationPromptDto } from './dto/generate-project-inspiration-prompt.dto';
import { ImportProjectAssetsDto } from './dto/import-project-assets.dto';
import { ListImportableWorksDto } from './dto/list-importable-works.dto';
import { MergeProjectStoryboardDto } from './dto/merge-project-storyboard.dto';
import { UpdateProjectAssetDto } from './dto/update-project-asset.dto';
import { UpdateProjectInspirationDto } from './dto/update-project-inspiration.dto';
import { UpdateProjectPromptDto } from './dto/update-project-prompt.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PROJECT_MASTER_IMAGE_PROMPT_TITLE } from './project-prompt.constants';

type ProjectDbClient = Prisma.TransactionClient | PrismaService;
type ImportableWorkType = 'image' | 'video';
const PROJECT_UPLOAD_RULES = {
  image: {
    maxFiles: 12,
    maxSizeMb: 20,
    allowedMimePrefixes: ['image/'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.heic', '.heif'],
  },
  video: {
    maxFiles: 6,
    maxSizeMb: 100,
    allowedMimePrefixes: ['video/'],
    allowedExtensions: ['.mp4', '.mov', '.webm', '.m4v'],
  },
  document: {
    maxFiles: 10,
    maxSizeMb: 50,
    allowedMimePrefixes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument',
      'application/msword',
      'text/',
    ],
    allowedExtensions: ['.pdf', '.docx', '.doc', '.txt', '.pptx', '.ppt'],
  },
} as const;

const AUTO_PROJECT_MERGED_STORYBOARD_SENTINEL = '__auto_project_storyboard_merge__';
const STORYBOARD_MERGE_WIDTH = 1280;
const STORYBOARD_MERGE_HEIGHT = 720;
const STORYBOARD_MERGE_FPS = 24;

type CompletedStoryboardVideo = {
  shotId: string;
  title: string | null;
  resultUrl: string;
  thumbnailUrl: string | null;
  sortTimestamp: number;
};

type StoryboardTaskSnapshot = {
  shotId: string;
  title: string | null;
  taskId: string;
  taskNo: string;
  status: string;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
};

type StoryboardTaskHint = {
  shotId: string;
  title: string | null;
  taskId: string;
  taskNo: string | null;
};

type ProjectDescriptionInspirationContext = {
  title: string;
  episodeNumber: number | null;
  ideaText: string;
  contextText: string | null;
  plotText: string | null;
  createdAt: Date;
};

type ProjectDescriptionDocumentContext = {
  label: string;
  extractedText: string;
};

type GeneratedProjectDescriptionBundle = {
  description: string;
  styleSummary: string;
  masterImagePrompt: string;
};

function trimText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripExtension(name: string) {
  const ext = extname(name);
  if (!ext) return name;
  return name.slice(0, -ext.length);
}

function normalizeFileExtension(name: string) {
  const ext = extname(name).trim().toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

function parseOptionalBigInt(value: string | null | undefined, fieldName: string) {
  const normalized = trimText(value);
  if (!normalized) return null;

  try {
    return BigInt(normalized);
  } catch {
    throw new BadRequestException(`${fieldName} is invalid`);
  }
}

function previewPrompt(prompt: string | null | undefined, fallback: string) {
  const text = trimText(prompt);
  if (!text) return fallback;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly promptOptimize: PromptOptimizeService,
    private readonly settings: SystemSettingsService,
    private readonly chatFileParser: ChatFileParserService,
  ) {}

  private serializeProject(
    project: {
      id: bigint;
      name: string;
      concept: string | null;
      description: string | null;
      createdAt: Date;
      updatedAt: Date;
      _count?: { assets: number; inspirations: number; prompts: number };
      assets?: Array<{ kind: string; thumbnailUrl: string | null; url: string }>;
    },
  ) {
    const latestAsset = project.assets?.[0] ?? null;
    const coverKind = latestAsset?.kind ?? null;
    const coverUrl = latestAsset?.url ?? null;
    const coverThumbnailUrl =
      latestAsset?.kind === ProjectAssetKind.video
        ? latestAsset.thumbnailUrl ?? null
        : latestAsset?.thumbnailUrl ?? latestAsset?.url ?? null;

    return {
      id: project.id.toString(),
      name: project.name,
      concept: project.concept ?? '',
      description: project.description ?? '',
      assetCount: project._count?.assets ?? 0,
      inspirationCount: project._count?.inspirations ?? 0,
      promptCount: project._count?.prompts ?? 0,
      coverKind,
      coverUrl,
      coverThumbnailUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private serializeProjectInspiration(inspiration: {
    id: bigint;
    projectId: bigint;
    title: string;
    episodeNumber: number | null;
    ideaText: string;
    contextText: string | null;
    plotText: string | null;
    generatedPrompt: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: inspiration.id.toString(),
      projectId: inspiration.projectId.toString(),
      title: inspiration.title,
      episodeNumber: inspiration.episodeNumber ?? null,
      ideaText: inspiration.ideaText,
      contextText: inspiration.contextText ?? '',
      plotText: inspiration.plotText ?? '',
      generatedPrompt: inspiration.generatedPrompt ?? '',
      createdAt: inspiration.createdAt,
      updatedAt: inspiration.updatedAt,
    };
  }

  private serializeProjectPrompt(prompt: {
    id: bigint;
    projectId: bigint;
    type: string;
    title: string;
    prompt: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: prompt.id.toString(),
      projectId: prompt.projectId.toString(),
      type: prompt.type,
      title: prompt.title,
      prompt: prompt.prompt,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
    };
  }

  private serializeProjectAsset(asset: {
    id: bigint;
    projectId: bigint;
    kind: string;
    source: string;
    title: string;
    description: string | null;
    sourcePrompt: string | null;
    fileName: string | null;
    mimeType: string | null;
    fileSize: number | null;
    url: string;
    thumbnailUrl: string | null;
    storageKey: string | null;
    imageTaskId: bigint | null;
    videoTaskId: bigint | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: asset.id.toString(),
      projectId: asset.projectId.toString(),
      kind: asset.kind,
      source: asset.source,
      title: asset.title,
      description: asset.description ?? null,
      sourcePrompt: asset.sourcePrompt ?? null,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      fileSize: asset.fileSize ?? null,
      url: asset.url,
      thumbnailUrl: asset.thumbnailUrl ?? null,
      storageKey: asset.storageKey ?? null,
      imageTaskId: asset.imageTaskId?.toString() ?? null,
      videoTaskId: asset.videoTaskId?.toString() ?? null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private serializeImportableWork(
    type: ImportableWorkType,
    item: {
      id: bigint;
      prompt: string;
      thumbnailUrl: string | null;
      resultUrl: string | null;
      createdAt: Date;
    },
  ) {
    return {
      id: item.id.toString(),
      type,
      prompt: item.prompt,
      thumbnailUrl: item.thumbnailUrl ?? item.resultUrl ?? null,
      resultUrl: item.resultUrl ?? null,
      createdAt: item.createdAt,
    };
  }

  private async resolveProjectQuotaSummary(
    userId: bigint,
  ) {
    const currentCount = await this.prisma.project.count({
      where: { userId },
    });

    return {
      currentCount,
      maxCount: null,
      remainingCount: null,
      unlimited: true,
      quotaSource: 'unlimited' as const,
    };
  }

  private async ensureOwnedProject(client: ProjectDbClient, userId: bigint, projectId: bigint) {
    const project = await client.project.findFirst({
      where: { id: projectId, userId },
      include: {
        _count: { select: { assets: true, inspirations: true, prompts: true } },
        assets: {
          select: { kind: true, thumbnailUrl: true, url: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async ensureOwnedInspiration(
    client: ProjectDbClient,
    userId: bigint,
    projectId: bigint,
    inspirationId: bigint,
  ) {
    const inspiration = await client.projectInspiration.findFirst({
      where: { id: inspirationId, projectId, userId },
    });
    if (!inspiration) throw new NotFoundException('Project inspiration not found');
    return inspiration;
  }

  private async ensureOwnedAsset(client: ProjectDbClient, userId: bigint, projectId: bigint, assetId: bigint) {
    const asset = await client.projectAsset.findFirst({
      where: { id: assetId, projectId, userId },
    });
    if (!asset) throw new NotFoundException('Project asset not found');
    return asset;
  }

  private async ensureOwnedPrompt(client: ProjectDbClient, userId: bigint, projectId: bigint, promptId: bigint) {
    const prompt = await client.projectPrompt.findFirst({
      where: { id: promptId, projectId, userId },
    });
    if (!prompt) throw new NotFoundException('Project prompt not found');
    return prompt;
  }

  private async touchProject(client: ProjectDbClient, projectId: bigint) {
    await client.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
  }

  private normalizeProjectName(name: string) {
    const normalized = trimText(name);
    if (!normalized) throw new BadRequestException('Project name is required');
    return normalized;
  }

  private normalizeProjectDescription(description: string | null | undefined) {
    const normalized = trimText(description);
    return normalized || null;
  }

  private normalizeProjectConcept(concept: string | null | undefined) {
    const normalized = trimText(concept);
    return normalized || null;
  }

  private normalizeInspirationTitle(title: string) {
    const normalized = trimText(title);
    if (!normalized) throw new BadRequestException('Inspiration title is required');
    return normalized;
  }

  private normalizeProjectPromptTitle(title: string) {
    const normalized = trimText(title);
    if (!normalized) throw new BadRequestException('Project prompt title is required');
    return normalized;
  }

  private normalizeRequiredText(value: string | null | undefined, fieldName: string) {
    const normalized = trimText(value);
    if (!normalized) throw new BadRequestException(`${fieldName} is required`);
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = trimText(value);
    return normalized || null;
  }

  private extractJsonObject(raw: string) {
    const normalized = trimText(raw);
    if (!normalized) return null;

    const candidates = [
      normalized,
      ...Array.from(
        normalized.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
        (match) => trimText(match[1]),
      ),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Keep trying fallbacks.
      }

      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // Ignore malformed candidates.
        }
      }
    }

    return null;
  }

  private deriveStyleSummary(description: string) {
    const normalized = trimText(description);
    if (!normalized) return '';

    const matchedLine = normalized
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^风格摘要[:：]/.test(line));
    if (matchedLine) {
      return matchedLine.replace(/^风格摘要[:：]\s*/i, '').trim();
    }

    const paragraphs = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    return paragraphs[paragraphs.length - 1] ?? normalized;
  }

  private parseGeneratedProjectDescriptionBundle(raw: string): GeneratedProjectDescriptionBundle {
    const parsed = this.extractJsonObject(raw);
    const description = trimText(typeof parsed?.description === 'string' ? parsed.description : raw);
    const styleSummary = trimText(
      typeof parsed?.styleSummary === 'string' ? parsed.styleSummary : this.deriveStyleSummary(description),
    );
    const masterImagePrompt = trimText(
      typeof parsed?.imagePrompt === 'string'
        ? parsed.imagePrompt
        : typeof parsed?.masterImagePrompt === 'string'
          ? parsed.masterImagePrompt
          : '',
    );

    if (!description) {
      throw new BadRequestException('AI 返回的项目描述为空，请重试');
    }
    if (!masterImagePrompt) {
      throw new BadRequestException('AI 未返回可复用的项目插图主提示词，请重试');
    }

    return {
      description,
      styleSummary,
      masterImagePrompt,
    };
  }

  private resolveMasterImagePrompt<T extends { title: string; prompt: string; type?: string }>(
    prompts: T[],
  ) {
    const imagePrompts = prompts.filter((item) =>
      item.type === undefined ? true : item.type === ProjectPromptType.image,
    );

    const exact = imagePrompts.find(
      (item) => trimText(item.title) === PROJECT_MASTER_IMAGE_PROMPT_TITLE && trimText(item.prompt),
    );
    if (exact) {
      return exact;
    }

    return imagePrompts.find((item) => trimText(item.prompt)) ?? null;
  }

  private async upsertProjectMasterImagePrompt(
    client: ProjectDbClient,
    userId: bigint,
    projectId: bigint,
    prompt: string,
  ) {
    const normalizedPrompt = this.normalizeRequiredText(prompt, 'Master image prompt');
    const existing = await client.projectPrompt.findFirst({
      where: {
        userId,
        projectId,
        type: ProjectPromptType.image,
        title: PROJECT_MASTER_IMAGE_PROMPT_TITLE,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    if (existing) {
      return client.projectPrompt.update({
        where: { id: existing.id },
        data: {
          prompt: normalizedPrompt,
        },
      });
    }

    return client.projectPrompt.create({
      data: {
        userId,
        projectId,
        type: ProjectPromptType.image,
        title: PROJECT_MASTER_IMAGE_PROMPT_TITLE,
        prompt: normalizedPrompt,
      },
    });
  }

  private normalizeStoryboardShotIds(shotIds: string[] | string | undefined | null) {
    const rawItems = Array.isArray(shotIds)
      ? shotIds
      : typeof shotIds === 'string'
        ? shotIds.split(',')
        : [];

    return [...new Set(
      rawItems
        .flatMap((item) => item.split(','))
        .map((item) => trimText(item))
        .filter((item) => item.length > 0),
    )];
  }

  private sortStoryboardShotIds(shotIds: Iterable<string>) {
    return [...shotIds].sort((left, right) => {
      const leftNumber = Number(left.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
      const rightNumber = Number(right.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
      return left.localeCompare(right);
    });
  }

  private async collectLatestStoryboardTaskByShotId(userId: bigint, projectId: bigint, shotIds?: string[]) {
    const normalizedShotIds = this.normalizeStoryboardShotIds(shotIds);
    const tasks = await this.prisma.videoTask.findMany({
      where: {
        userId,
        projectId,
        autoProjectFinalStoryboard: true,
        ...(normalizedShotIds.length > 0 ? { autoProjectShotId: { in: normalizedShotIds } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        taskNo: true,
        status: true,
        resultUrl: true,
        thumbnailUrl: true,
        errorMessage: true,
        autoProjectShotId: true,
        providerData: true,
      },
    });

    const latestStoryboardTaskByShotId = new Map<string, StoryboardTaskSnapshot>();

    for (const task of tasks) {
      const shotId = trimText(task.autoProjectShotId);
      if (!shotId) continue;
      if (latestStoryboardTaskByShotId.has(shotId)) continue;

      const metadata = extractAutoProjectAssetMetadata(task.providerData);

      latestStoryboardTaskByShotId.set(shotId, {
        shotId,
        title: trimText(metadata?.title) || null,
        taskId: task.id.toString(),
        taskNo: task.taskNo,
        status: task.status,
        resultUrl: task.resultUrl ?? null,
        thumbnailUrl: task.thumbnailUrl ?? null,
        errorMessage: task.errorMessage ?? null,
      });
    }

    return latestStoryboardTaskByShotId;
  }

  private extractStoryboardTaskHintsFromProviderData(
    providerData: unknown,
    projectId: string,
    allowedShotIds?: Set<string>,
  ) {
    providerData = parseSqliteJson(providerData) ?? providerData;
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return [];
    }

    const autoProjectMetadata = extractAutoProjectAgentFromProviderData(providerData);
    if (!autoProjectMetadata || autoProjectMetadata.projectId !== projectId) {
      return [];
    }

    const shotTitleById = new Map(
      (autoProjectMetadata.workflow?.shots ?? []).map((shot) => [shot.id, trimText(shot.title) || null] as const),
    );
    const source = providerData as Record<string, unknown>;
    if (!Array.isArray(source.taskRefs)) {
      return [];
    }

    const hints: StoryboardTaskHint[] = [];

    for (const item of source.taskRefs) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

      const raw = item as Record<string, unknown>;
      if (raw.kind !== 'video' || raw.finalStoryboard !== true) continue;

      const shotId = trimText(typeof raw.shotId === 'string' ? raw.shotId : '');
      const taskId = trimText(typeof raw.taskId === 'string' ? raw.taskId : '');
      const taskNo = trimText(typeof raw.taskNo === 'string' ? raw.taskNo : '') || null;
      if (!shotId || !taskId) continue;
      if (allowedShotIds && !allowedShotIds.has(shotId)) continue;

      hints.push({
        shotId,
        title: shotTitleById.get(shotId) ?? null,
        taskId,
        taskNo,
      });
    }

    return hints;
  }

  private async collectStoryboardTaskHintsFromMessages(
    userId: bigint,
    projectId: bigint,
    shotIds: string[],
  ) {
    if (shotIds.length === 0) return new Map<string, StoryboardTaskHint>();

    const allowedShotIds = new Set(shotIds);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId,
        role: 'assistant',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
      select: {
        providerData: true,
      },
    });

    const hintsByShotId = new Map<string, StoryboardTaskHint>();
    const projectIdText = projectId.toString();

    for (const row of rows) {
      const hints = this.extractStoryboardTaskHintsFromProviderData(
        row.providerData,
        projectIdText,
        allowedShotIds,
      );

      for (const hint of hints) {
        if (!hintsByShotId.has(hint.shotId)) {
          hintsByShotId.set(hint.shotId, hint);
        }
      }

      if (hintsByShotId.size >= allowedShotIds.size) {
        break;
      }
    }

    return hintsByShotId;
  }

  private async recoverMissingStoryboardTaskByShotId(
    userId: bigint,
    projectId: bigint,
    missingShotIds: string[],
  ) {
    const hintsByShotId = await this.collectStoryboardTaskHintsFromMessages(userId, projectId, missingShotIds);
    if (hintsByShotId.size === 0) {
      return new Map<string, StoryboardTaskSnapshot>();
    }

    const taskIds: bigint[] = [];
    const taskNos: string[] = [];

    for (const hint of hintsByShotId.values()) {
      try {
        taskIds.push(BigInt(hint.taskId));
      } catch {
        taskNos.push(hint.taskId);
      }

      if (hint.taskNo) {
        taskNos.push(hint.taskNo);
      }
    }

    const tasks = await this.prisma.videoTask.findMany({
      where: {
        userId,
        projectId,
        OR: [
          ...(taskIds.length > 0 ? [{ id: { in: taskIds } }] : []),
          ...(taskNos.length > 0 ? [{ taskNo: { in: [...new Set(taskNos)] } }] : []),
        ],
      },
      select: {
        id: true,
        taskNo: true,
        status: true,
        resultUrl: true,
        thumbnailUrl: true,
        errorMessage: true,
        prompt: true,
      },
    });

    const taskByIdentifier = new Map<string, typeof tasks[number]>();
    for (const task of tasks) {
      taskByIdentifier.set(task.id.toString(), task);
      taskByIdentifier.set(task.taskNo, task);
    }

    const recovered = new Map<string, StoryboardTaskSnapshot>();
    for (const shotId of missingShotIds) {
      const hint = hintsByShotId.get(shotId);
      if (!hint) continue;

      const task = taskByIdentifier.get(hint.taskId) ?? (hint.taskNo ? taskByIdentifier.get(hint.taskNo) : undefined);
      if (!task) continue;

      recovered.set(shotId, {
        shotId,
        title: hint.title ?? previewPrompt(task.prompt, shotId),
        taskId: task.id.toString(),
        taskNo: task.taskNo,
        status: task.status,
        resultUrl: task.resultUrl ?? null,
        thumbnailUrl: task.thumbnailUrl ?? null,
        errorMessage: task.errorMessage ?? null,
      });
    }

    return recovered;
  }

  private async collectLatestCompletedStoryboardByShotId(userId: bigint, projectId: bigint, shotIds?: string[]) {
    const normalizedShotIds = this.normalizeStoryboardShotIds(shotIds);
    const [completedTasks, syncedStoryboardAssets] = await Promise.all([
      this.prisma.videoTask.findMany({
        where: {
          userId,
          projectId,
          autoProjectFinalStoryboard: true,
          status: TaskStatus.completed,
          resultUrl: { not: null },
          ...(normalizedShotIds.length > 0 ? { autoProjectShotId: { in: normalizedShotIds } } : {}),
        },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        select: {
          resultUrl: true,
          thumbnailUrl: true,
          autoProjectShotId: true,
          providerData: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.projectAsset.findMany({
        where: {
          userId,
          projectId,
          kind: ProjectAssetKind.video,
          ...(normalizedShotIds.length > 0
            ? { videoTask: { autoProjectShotId: { in: normalizedShotIds } } }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          title: true,
          url: true,
          thumbnailUrl: true,
          updatedAt: true,
          createdAt: true,
          videoTask: {
            select: {
              autoProjectShotId: true,
              autoProjectFinalStoryboard: true,
              providerData: true,
            },
          },
        },
      }),
    ]);

    const latestStoryboardByShotId = new Map<string, CompletedStoryboardVideo>();
    const upsertStoryboard = (candidate: CompletedStoryboardVideo) => {
      const existing = latestStoryboardByShotId.get(candidate.shotId);
      if (!existing || candidate.sortTimestamp >= existing.sortTimestamp) {
        latestStoryboardByShotId.set(candidate.shotId, candidate);
      }
    };

    for (const task of completedTasks) {
      if (!task.resultUrl) continue;

      const metadata = extractAutoProjectAssetMetadata(task.providerData);
      const shotId = trimText(task.autoProjectShotId) || trimText(metadata?.shotId);
      if (!shotId) continue;

      upsertStoryboard({
        shotId,
        title: trimText(metadata?.title) || null,
        resultUrl: task.resultUrl,
        thumbnailUrl: task.thumbnailUrl ?? null,
        sortTimestamp: new Date(task.completedAt ?? task.createdAt).getTime(),
      });
    }

    for (const asset of syncedStoryboardAssets) {
      const metadata = extractAutoProjectAssetMetadata(asset.videoTask?.providerData ?? null);
      const shotId =
        trimText(asset.videoTask?.autoProjectShotId) ||
        trimText(metadata?.shotId);
      if (!shotId) continue;
      if (asset.videoTask?.autoProjectFinalStoryboard === false) continue;

      upsertStoryboard({
        shotId,
        title: trimText(asset.title) || trimText(metadata?.title) || null,
        resultUrl: asset.url,
        thumbnailUrl: asset.thumbnailUrl ?? null,
        sortTimestamp: new Date(asset.updatedAt ?? asset.createdAt).getTime(),
      });
    }

    return latestStoryboardByShotId;
  }

  private buildMergedStoryboardTitle(projectName: string) {
    return trimText(projectName) ? `${projectName} 最终成片` : '最终成片';
  }

  private buildMergedStoryboardDescription(shotCount: number, hasAudio: boolean) {
    return hasAudio
      ? `Auto Project 合并成片，共 ${shotCount} 镜，输出为 ${STORYBOARD_MERGE_HEIGHT}p ${STORYBOARD_MERGE_FPS}fps，并保留原分镜音轨。`
      : `Auto Project 合并成片，共 ${shotCount} 镜，输出为 ${STORYBOARD_MERGE_HEIGHT}p ${STORYBOARD_MERGE_FPS}fps 无声视频。`;
  }

  private buildMergedStoryboardSourcePrompt(shotIds: string[]) {
    return `${AUTO_PROJECT_MERGED_STORYBOARD_SENTINEL}\n${shotIds.join(',')}`;
  }

  async getProjectStoryboardStatus(
    userId: bigint,
    projectId: bigint,
    shotIds?: string[] | string,
  ) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const requestedShotIds = this.normalizeStoryboardShotIds(shotIds);
    const latestStoryboardTaskByShotId = await this.collectLatestStoryboardTaskByShotId(userId, projectId, requestedShotIds);
    const missingRequestedShotIds =
      requestedShotIds.length > 0
        ? requestedShotIds.filter((shotId) => !latestStoryboardTaskByShotId.has(shotId))
        : [];

    if (missingRequestedShotIds.length > 0) {
      const recoveredStoryboardTaskByShotId = await this.recoverMissingStoryboardTaskByShotId(
        userId,
        projectId,
        missingRequestedShotIds,
      );
      for (const [shotId, task] of recoveredStoryboardTaskByShotId.entries()) {
        if (!latestStoryboardTaskByShotId.has(shotId)) {
          latestStoryboardTaskByShotId.set(shotId, task);
        }
      }
    }
    const orderedShotIds =
      requestedShotIds.length > 0
        ? requestedShotIds
        : this.sortStoryboardShotIds(latestStoryboardTaskByShotId.keys());

    return orderedShotIds.map((shotId) => {
      const latest = latestStoryboardTaskByShotId.get(shotId) ?? null;
      return {
        shotId,
        title: latest?.title ?? null,
        taskId: latest?.taskId ?? null,
        taskNo: latest?.taskNo ?? null,
        status: latest?.status ?? null,
        completed: latest?.status === TaskStatus.completed && Boolean(latest?.resultUrl),
        resultUrl: latest?.resultUrl ?? null,
        thumbnailUrl: latest?.thumbnailUrl ?? null,
        errorMessage: latest?.errorMessage ?? null,
      };
    });
  }

  private async downloadUrlToFile(url: string, outputPath: string) {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120_000,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300 || !response.data) {
      throw new BadRequestException(`Failed to download storyboard clip (${response.status})`);
    }

    await pipeline(response.data, createWriteStream(outputPath));
  }

  private async runFfmpeg(args: string[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, {
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new BadRequestException('FFmpeg is not installed on the server yet'));
          return;
        }
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        const message = stderr.trim() || `ffmpeg exited with code ${code ?? 'unknown'}`;
        reject(new BadRequestException(`Failed to merge storyboard videos: ${message}`));
      });
    });
  }

  private async runFfprobe(args: string[]) {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('ffprobe', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          reject(new BadRequestException('FFmpeg/FFprobe is not installed on the server yet'));
          return;
        }
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }

        const message = stderr.trim() || `ffprobe exited with code ${code ?? 'unknown'}`;
        reject(new BadRequestException(`Failed to inspect storyboard video: ${message}`));
      });
    });
  }

  private async probeStoryboardClipHasAudio(inputPath: string) {
    const stdout = await this.runFfprobe([
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index',
      '-of',
      'json',
      inputPath,
    ]);

    try {
      const parsed = JSON.parse(stdout) as { streams?: Array<{ index?: number }> };
      return Array.isArray(parsed.streams) && parsed.streams.length > 0;
    } catch {
      return false;
    }
  }

  private async normalizeStoryboardClip(input: {
    inputPath: string;
    outputPath: string;
    preserveAudio: boolean;
    sourceHasAudio: boolean;
  }) {
    const commonArgs = [
      '-y',
      '-i',
      input.inputPath,
      '-vf',
      `scale=${STORYBOARD_MERGE_WIDTH}:${STORYBOARD_MERGE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${STORYBOARD_MERGE_WIDTH}:${STORYBOARD_MERGE_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`,
      '-r',
      `${STORYBOARD_MERGE_FPS}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
    ];

    if (!input.preserveAudio) {
      await this.runFfmpeg([
        ...commonArgs,
        '-an',
        '-movflags',
        '+faststart',
        input.outputPath,
      ]);
      return;
    }

    if (input.sourceHasAudio) {
      await this.runFfmpeg([
        ...commonArgs,
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        input.outputPath,
      ]);
      return;
    }

    await this.runFfmpeg([
      '-y',
      '-i',
      input.inputPath,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-shortest',
      '-vf',
      `scale=${STORYBOARD_MERGE_WIDTH}:${STORYBOARD_MERGE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${STORYBOARD_MERGE_WIDTH}:${STORYBOARD_MERGE_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`,
      '-r',
      `${STORYBOARD_MERGE_FPS}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      input.outputPath,
    ]);
  }

  private async concatNormalizedStoryboardClips(inputPaths: string[], outputPath: string, hasAudio: boolean) {
    if (inputPaths.length === 1) {
      await copyFile(inputPaths[0], outputPath);
      return;
    }

    const args = ['-y'];
    for (const inputPath of inputPaths) {
      args.push('-i', inputPath);
    }

    args.push(
      '-filter_complex',
      hasAudio
        ? `concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`
        : `concat=n=${inputPaths.length}:v=1:a=0[outv]`,
      '-map',
      '[outv]',
    );
    if (hasAudio) {
      args.push(
        '-map',
        '[outa]',
      );
    }
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
    );
    if (hasAudio) {
      args.push(
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-b:a',
        '192k',
      );
    }
    args.push(
      '-movflags',
      '+faststart',
      outputPath,
    );

    await this.runFfmpeg(args);
  }

  private normalizeEpisodeNumber(value: number | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException('Episode number must be a positive integer');
    }
    return value;
  }

  private truncateForAi(value: string | null | undefined, maxLength: number) {
    const normalized = trimText(value);
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  private sortInspirations<T extends { episodeNumber: number | null; createdAt: Date }>(items: T[]) {
    return [...items].sort((left, right) => {
      const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (leftEpisode !== rightEpisode) return leftEpisode - rightEpisode;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
  }

  private buildProjectDescriptionPrompt(params: {
    projectName?: string | null;
    currentConcept?: string | null;
    savedConcept?: string | null;
    inspirations: ProjectDescriptionInspirationContext[];
    documents: ProjectDescriptionDocumentContext[];
  }) {
    const inspirationSection = params.inspirations
      .slice(0, 8)
      .map((item, index) => {
        const episodeLabel = item.episodeNumber ? `第${item.episodeNumber}集` : `灵感${index + 1}`;
        const blocks = [
          this.truncateForAi(item.ideaText, 700) ? `核心灵感：${this.truncateForAi(item.ideaText, 700)}` : null,
          this.truncateForAi(item.contextText, 450) ? `背景设定：${this.truncateForAi(item.contextText, 450)}` : null,
          this.truncateForAi(item.plotText, 500) ? `剧情方向：${this.truncateForAi(item.plotText, 500)}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        if (!blocks) return '';
        return `${episodeLabel}｜${this.truncateForAi(item.title, 120) || '未命名灵感'}\n${blocks}`;
      })
      .filter(Boolean)
      .join('\n\n');

    let documentBudget = 6000;
    const documentSection = params.documents
      .slice(0, 6)
      .map((item, index) => {
        if (documentBudget <= 0) return '';
        const excerpt = this.truncateForAi(item.extractedText, Math.min(1600, documentBudget));
        if (!excerpt) return '';
        documentBudget -= excerpt.length;
        return `[文档${index + 1}] ${this.truncateForAi(item.label, 120) || '未命名文档'}\n${excerpt}`;
      })
      .filter(Boolean)
      .join('\n\n');

    return [
      '请基于以下信息，一次性生成项目描述、短版风格摘要，以及一条完整的项目级图片统一风格主提示词。',
      params.projectName ? `项目名称：${this.truncateForAi(params.projectName, 120)}` : null,
      params.currentConcept ? `用户当前输入的项目主题/灵感：${this.truncateForAi(params.currentConcept, 2200)}` : null,
      params.savedConcept && params.savedConcept !== params.currentConcept
        ? `项目已保存主题/灵感：${this.truncateForAi(params.savedConcept, 1800)}`
        : null,
      inspirationSection ? `项目灵感参考：\n${inspirationSection}` : null,
      documentSection ? `项目参考文档：\n${documentSection}` : null,
      '要求：',
      '1. 只能输出 1 个 JSON 对象，不要输出任何额外解释、Markdown 或代码块外文本。',
      '2. JSON 结构必须是 {"description":"...","styleSummary":"...","imagePrompt":"..."}。',
      '3. description 是最终保存到项目描述里的正文，需要先给出完整项目描述，再自然追加一小段短版风格摘要；摘要建议单独成段，并以“风格摘要：”开头。',
      '4. description 需要覆盖核心主体、视觉基调、情绪与叙事方向、关键约束，以及后续图片/视频创作时应该反复坚持的重点。',
      '5. styleSummary 要比 description 更短，提炼统一风格锚点，适合后续单图提示词持续复用。',
      '6. imagePrompt 必须是完整、专业、可复用的图片主提示词，用来约束整个项目的统一风格；它要描述画风、构图习惯、色彩系统、光影策略、材质/线条/纹理语言、信息密度和一致性约束，但不要写成某一张具体图片。',
      '7. 如果提供了文档，请吸收其中的设定、世界观、角色、对象、术语、结构或叙事线索；但不要把项目限定成论文、剧集、小说或某一种固定形态，要根据内容自适应。',
      '8. 风格要具体、专业、可复用，不要空泛。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildProjectImagePrompt(params: {
    project: {
      name: string;
      concept: string | null;
      description: string | null;
    };
    userPrompt: string;
    documents: ProjectDescriptionDocumentContext[];
    masterImagePrompt: string | null;
  }) {
    let documentBudget = 5000;
    const documentSection = params.documents
      .slice(0, 6)
      .map((item, index) => {
        if (documentBudget <= 0) return '';
        const excerpt = this.truncateForAi(item.extractedText, Math.min(1300, documentBudget));
        if (!excerpt) return '';
        documentBudget -= excerpt.length;
        return `[参考文本${index + 1}] ${this.truncateForAi(item.label, 120) || '未命名文档'}\n${excerpt}`;
      })
      .filter(Boolean)
      .join('\n\n');

    return [
      '请根据以下项目背景与本次画面需求，生成 1 条可直接提交给 AI 图片模型的最终单图提示词。',
      `项目名称：${params.project.name}`,
      params.project.concept ? `项目主题/灵感：${this.truncateForAi(params.project.concept, 1600)}` : null,
      params.project.description ? `项目描述：${this.truncateForAi(params.project.description, 2600)}` : null,
      params.masterImagePrompt
        ? `项目插图统一风格总提示词：\n${this.truncateForAi(params.masterImagePrompt, 3200)}`
        : null,
      documentSection ? `项目参考文档/文本：\n${documentSection}` : null,
      `本次单图需求：${this.truncateForAi(params.userPrompt, 2200)}`,
      '输出要求：',
      '1. 只输出 1 条最终单图提示词正文，不要解释、不要标题、不要 Markdown、不要 JSON。',
      '2. 必须优先继承“项目插图统一风格总提示词”里的风格锚点，确保同一项目里的图片持续保持统一画风、构图习惯、色彩体系、光影策略和材质/线条语言。',
      '3. 同时吸收项目文档/文本与项目描述中的事实信息、术语、结构、规则和约束，但不要机械照抄原文。',
      '4. 这次输出必须聚焦当前这一张图的主体、场景、构图、信息重点和细节呈现，而不是重复整项目概述。',
      '5. 不要虚构用户没有提供的关键事实；如果信息不足，只做克制、专业的补全。',
      '6. 默认输出中文，可保留少量必要专业术语；尽量保持清晰、具体、适中长度。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private buildProjectStoryboardPrompt(params: {
    project: { name: string; concept: string | null; description: string | null };
    currentInspiration: {
      title: string;
      episodeNumber: number | null;
      ideaText: string;
      contextText: string | null;
      plotText: string | null;
    };
    previousInspirations: Array<{
      title: string;
      episodeNumber: number | null;
      ideaText: string;
      contextText: string | null;
      plotText: string | null;
    }>;
    documents: ProjectDescriptionDocumentContext[];
    options: Required<GenerateProjectInspirationPromptDto>;
  }) {
    const { project, currentInspiration, previousInspirations, documents, options } = params;

    const previousIdeaSection = options.includePreviousInspirations
      ? previousInspirations
          .map((item, index) => {
            const episodeLabel = item.episodeNumber ? `第${item.episodeNumber}集` : `前序片段${index + 1}`;
            const text = this.truncateForAi(item.ideaText, 900);
            return text ? `${episodeLabel}｜${item.title}\n${text}` : '';
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

    const previousContextSection = options.includePreviousContextText
      ? previousInspirations
          .map((item, index) => {
            const text = this.truncateForAi(item.contextText, 700);
            if (!text) return '';
            const episodeLabel = item.episodeNumber ? `第${item.episodeNumber}集` : `前序片段${index + 1}`;
            return `${episodeLabel}｜${item.title}\n${text}`;
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

    const previousPlotSection = options.includePreviousPlotText
      ? previousInspirations
          .map((item, index) => {
            const text = this.truncateForAi(item.plotText, 800);
            if (!text) return '';
            const episodeLabel = item.episodeNumber ? `第${item.episodeNumber}集` : `前序片段${index + 1}`;
            return `${episodeLabel}｜${item.title}\n${text}`;
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

    let documentBudget = 5000;
    const documentSection = options.includeProjectDescription
      ? documents
          .slice(0, 5)
          .map((item, index) => {
            if (documentBudget <= 0) return '';
            const excerpt = this.truncateForAi(item.extractedText, Math.min(1400, documentBudget));
            if (!excerpt) return '';
            documentBudget -= excerpt.length;
            return `[项目文档${index + 1}] ${this.truncateForAi(item.label, 120) || '未命名文档'}\n${excerpt}`;
          })
          .filter(Boolean)
          .join('\n\n')
      : '';

    return [
      '请根据以下项目与剧情素材，生成 1 个可直接用于 AI 视频模型的详细分镜提示词。',
      `项目名称：${project.name}`,
      options.includeProjectDescription && project.concept
        ? `项目主题/灵感：${this.truncateForAi(project.concept, 1800)}`
        : null,
      options.includeProjectDescription && project.description
        ? `项目描述：${this.truncateForAi(project.description, 2400)}`
        : null,
      currentInspiration.episodeNumber ? `当前集数：第${currentInspiration.episodeNumber}集` : null,
      `当前灵感标题：${currentInspiration.title}`,
      `当前灵感：${this.truncateForAi(currentInspiration.ideaText, 2600)}`,
      currentInspiration.contextText
        ? `当前上下文文本：${this.truncateForAi(currentInspiration.contextText, 1800)}`
        : null,
      currentInspiration.plotText
        ? `当前剧情：${this.truncateForAi(currentInspiration.plotText, 2200)}`
        : null,
      documentSection ? `项目参考文档：\n${documentSection}` : null,
      previousIdeaSection ? `前序灵感参考：\n${previousIdeaSection}` : null,
      previousContextSection ? `前序上下文参考：\n${previousContextSection}` : null,
      previousPlotSection ? `前序剧情参考：\n${previousPlotSection}` : null,
      '输出要求：',
      '1. 保持主体设定、空间关系、情绪推进和叙事连续性。',
      '2. 详细描述每个镜头的景别、运镜、主体动作、环境变化、光线氛围和转场方式。',
      '3. 如果提供了项目文档，请吸收其中的人设、世界观、场景规则、物件设定或叙事线索，并在分镜中保持一致。',
      '4. 如果适合，补充声音氛围、对白节奏或环境声方向，但不要写成脚本解释。',
      '5. 结果要像专业导演写给 AI 视频模型的执行提示词，而不是故事大纲。',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private assertProjectUploadFile(kind: ProjectAssetKind, file: Express.Multer.File) {
    const rule = PROJECT_UPLOAD_RULES[kind];
    const fileName = normalizeUploadedFileName(file.originalname);
    const normalizedMimeType = String(file.mimetype || '').toLowerCase().trim();
    const normalizedExt = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : '';
    const maxBytes = rule.maxSizeMb * 1024 * 1024;

    if ((file.size ?? 0) <= 0) {
      throw new BadRequestException(`文件 ${fileName} 为空`);
    }

    if ((file.size ?? 0) > maxBytes) {
      throw new BadRequestException(`文件 ${fileName} 超过大小限制（${rule.maxSizeMb}MB）`);
    }

    const mimeAllowed = rule.allowedMimePrefixes.some((prefix) => normalizedMimeType.startsWith(prefix));
    const extAllowed = rule.allowedExtensions.some((ext) => ext === normalizedExt);
    if (!mimeAllowed && !extAllowed) {
      throw new BadRequestException(`文件 ${fileName} 格式不支持`);
    }
  }

  private async getProjectDocumentParseMaxChars() {
    const settings = await this.settings.getChatFileSettings();
    return Math.max(1000, settings.chatFileMaxExtractChars);
  }

  private async buildProjectDocumentChatFileRecord(
    file: Express.Multer.File,
    maxExtractChars: number,
  ) {
    const normalizedName = normalizeUploadedFileName(file.originalname);
    const mimeType = (file.mimetype || 'application/octet-stream').toLowerCase();
    const extension = normalizeFileExtension(normalizedName);
    const fileSize = file.size ?? 0;

    try {
      const parsed = await this.chatFileParser.parse(file, maxExtractChars);
      return {
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        fileSize: parsed.fileSize,
        extension: parsed.extension,
        extractedText: parsed.extractedText,
        textLength: parsed.extractedText.length,
        status: 'ready',
        errorMessage: null as string | null,
      };
    } catch (error) {
      return {
        fileName: normalizedName,
        mimeType,
        fileSize,
        extension,
        extractedText: '',
        textLength: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message.slice(0, 2000) : '文件解析失败',
      };
    }
  }

  private async collectProjectDescriptionDocuments(params: {
    userId: bigint;
    projectId: bigint | null;
    uploadedFiles: Express.Multer.File[];
  }) {
    const maxExtractChars = await this.getProjectDocumentParseMaxChars();
    const uploadedDocuments: ProjectDescriptionDocumentContext[] = [];
    let uploadedDocumentParseFailures = 0;

    for (const file of params.uploadedFiles ?? []) {
      this.assertProjectUploadFile(ProjectAssetKind.document, file);
      const parsed = await this.buildProjectDocumentChatFileRecord(file, maxExtractChars);
      if (parsed.status !== 'ready' || !trimText(parsed.extractedText)) {
        uploadedDocumentParseFailures += 1;
        continue;
      }

      uploadedDocuments.push({
        label: parsed.fileName,
        extractedText: parsed.extractedText,
      });
    }

    if (!params.projectId) {
      return {
        documents: uploadedDocuments,
        uploadedDocumentParseFailures,
      };
    }

    const storedDocuments = await this.prisma.chatFile.findMany({
      where: {
        userId: params.userId,
        status: 'ready',
        projectAsset: {
          projectId: params.projectId,
          kind: ProjectAssetKind.document,
        },
      },
      select: {
        fileName: true,
        extractedText: true,
        projectAsset: {
          select: {
            title: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      documents: [
        ...uploadedDocuments,
        ...storedDocuments
          .filter((item) => trimText(item.extractedText))
          .map((item) => ({
            label: trimText(item.projectAsset?.title) || item.fileName,
            extractedText: item.extractedText,
          })),
      ],
      uploadedDocumentParseFailures,
    };
  }

  private async collectProjectDescriptionInspirations(userId: bigint, projectId: bigint | null) {
    if (!projectId) return [] as ProjectDescriptionInspirationContext[];

    const inspirations = await this.prisma.projectInspiration.findMany({
      where: { userId, projectId },
      select: {
        title: true,
        episodeNumber: true,
        ideaText: true,
        contextText: true,
        plotText: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.sortInspirations(inspirations);
  }

  async listProjects(userId: bigint) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { assets: true, inspirations: true, prompts: true } },
        assets: {
          select: { kind: true, thumbnailUrl: true, url: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    return projects.map((project) => this.serializeProject(project));
  }

  async getProjectQuota(userId: bigint) {
    return this.resolveProjectQuotaSummary(userId);
  }

  async createProject(userId: bigint, dto: CreateProjectDto) {
    await this.enforceProjectLimit(userId);

    const masterImagePrompt = this.normalizeOptionalText(dto.masterImagePrompt);
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          userId,
          name: this.normalizeProjectName(dto.name),
          concept: this.normalizeProjectConcept(dto.concept),
          description: this.normalizeProjectDescription(dto.description),
        },
      });

      if (masterImagePrompt) {
        await this.upsertProjectMasterImagePrompt(tx, userId, created.id, masterImagePrompt);
      }

      return this.ensureOwnedProject(tx, userId, created.id);
    });

    return this.serializeProject(project);
  }

  private async enforceProjectLimit(_userId: bigint) {
    return;
  }

  async getProject(userId: bigint, projectId: bigint) {
    const project = await this.ensureOwnedProject(this.prisma, userId, projectId);
    return this.serializeProject(project);
  }

  async updateProject(userId: bigint, projectId: bigint, dto: UpdateProjectDto) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const data: Prisma.ProjectUpdateInput = {};
    const masterImagePrompt =
      dto.masterImagePrompt !== undefined ? this.normalizeOptionalText(dto.masterImagePrompt) : undefined;

    if (dto.name !== undefined) {
      data.name = this.normalizeProjectName(dto.name);
    }
    if (dto.concept !== undefined) {
      data.concept = this.normalizeProjectConcept(dto.concept);
    }
    if (dto.description !== undefined) {
      data.description = this.normalizeProjectDescription(dto.description);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.project.update({
          where: { id: projectId },
          data,
        });
      }

      if (masterImagePrompt) {
        await this.upsertProjectMasterImagePrompt(tx, userId, projectId, masterImagePrompt);
        await this.touchProject(tx, projectId);
      }

      return this.ensureOwnedProject(tx, userId, projectId);
    });

    return this.serializeProject(updated);
  }

  async generateProjectDescription(userId: bigint, dto: GenerateProjectDescriptionDto, files: Express.Multer.File[] = []) {
    const projectId = parseOptionalBigInt(dto.projectId, 'projectId');
    const project = projectId
      ? await this.ensureOwnedProject(this.prisma, userId, projectId)
      : null;
    const currentConcept = this.normalizeOptionalText(dto.concept);
    const savedConcept = project?.concept ?? null;
    const projectName = this.normalizeOptionalText(dto.name) ?? project?.name ?? null;
    const inspirations = await this.collectProjectDescriptionInspirations(userId, projectId);
    const { documents, uploadedDocumentParseFailures } = await this.collectProjectDescriptionDocuments({
      userId,
      projectId,
      uploadedFiles: files,
    });

    if (!currentConcept && !savedConcept && inspirations.length === 0 && documents.length === 0) {
      if (uploadedDocumentParseFailures > 0) {
        throw new BadRequestException('上传的文档暂时无法解析，请补充项目主题/灵感，或改用 PDF、DOCX、TXT、PPTX 文档');
      }
      throw new BadRequestException('请至少提供项目主题/灵感、已保存灵感或可解析文档中的一项');
    }

    const content = await this.promptOptimize.optimizePrompt(
      userId,
      this.buildProjectDescriptionPrompt({
        projectName,
        currentConcept,
        savedConcept,
        inspirations,
        documents,
      }),
      undefined,
      undefined,
      undefined,
      'project_description_bundle',
    );

    const parsed = this.parseGeneratedProjectDescriptionBundle(content.content);
    return {
      description: parsed.description,
      styleSummary: parsed.styleSummary,
      masterImagePrompt: parsed.masterImagePrompt,
    };
  }

  async generateProjectImagePrompt(userId: bigint, projectId: bigint, userPrompt: string) {
    const normalizedUserPrompt = this.normalizeRequiredText(userPrompt, 'Image prompt');
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true,
        name: true,
        concept: true,
        description: true,
        prompts: {
          where: { type: ProjectPromptType.image },
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: 12,
          select: {
            type: true,
            title: true,
            prompt: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const { documents } = await this.collectProjectDescriptionDocuments({
      userId,
      projectId,
      uploadedFiles: [],
    });
    const masterImagePromptRecord = this.resolveMasterImagePrompt(project.prompts);
    const masterImagePrompt = trimText(masterImagePromptRecord?.prompt) || null;

    if (!project.concept && !project.description && !masterImagePrompt && documents.length === 0) {
      return { prompt: normalizedUserPrompt };
    }

    const result = await this.promptOptimize.generateInternalPrompt({
      userId,
      prompt: this.buildProjectImagePrompt({
        project,
        userPrompt: normalizedUserPrompt,
        documents,
        masterImagePrompt,
      }),
      task: 'project_image_prompt',
    });

    return {
      prompt: trimText(result.content) || normalizedUserPrompt,
      masterImagePromptTitle: masterImagePromptRecord?.title ?? null,
    };
  }

  async listInspirations(userId: bigint, projectId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const inspirations = await this.prisma.projectInspiration.findMany({
      where: { userId, projectId },
      orderBy: { createdAt: 'asc' },
    });

    return this.sortInspirations(inspirations).map((item) => this.serializeProjectInspiration(item));
  }

  async createInspiration(userId: bigint, projectId: bigint, dto: CreateProjectInspirationDto) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);

    const created = await this.prisma.$transaction(async (tx) => {
      const inspiration = await tx.projectInspiration.create({
        data: {
          userId,
          projectId,
          title: this.normalizeInspirationTitle(dto.title),
          episodeNumber: this.normalizeEpisodeNumber(dto.episodeNumber) ?? null,
          ideaText: this.normalizeRequiredText(dto.ideaText, 'Inspiration text'),
          contextText: this.normalizeOptionalText(dto.contextText),
          plotText: this.normalizeOptionalText(dto.plotText),
        },
      });
      await this.touchProject(tx, projectId);
      return inspiration;
    });

    return this.serializeProjectInspiration(created);
  }

  async updateInspiration(
    userId: bigint,
    projectId: bigint,
    inspirationId: bigint,
    dto: UpdateProjectInspirationDto,
  ) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.ensureOwnedInspiration(this.prisma, userId, projectId, inspirationId);

    const data: Prisma.ProjectInspirationUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = this.normalizeInspirationTitle(dto.title);
    }
    if (dto.ideaText !== undefined) {
      data.ideaText = this.normalizeRequiredText(dto.ideaText, 'Inspiration text');
    }
    if (dto.contextText !== undefined) {
      data.contextText = this.normalizeOptionalText(dto.contextText);
    }
    if (dto.plotText !== undefined) {
      data.plotText = this.normalizeOptionalText(dto.plotText);
    }
    if (dto.episodeNumber !== undefined) {
      data.episodeNumber = this.normalizeEpisodeNumber(dto.episodeNumber) ?? null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const inspiration = await tx.projectInspiration.update({
        where: { id: inspirationId },
        data,
      });
      await this.touchProject(tx, projectId);
      return inspiration;
    });

    return this.serializeProjectInspiration(updated);
  }

  async deleteInspiration(userId: bigint, projectId: bigint, inspirationId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.ensureOwnedInspiration(this.prisma, userId, projectId, inspirationId);

    await this.prisma.$transaction(async (tx) => {
      await tx.projectInspiration.delete({ where: { id: inspirationId } });
      await this.touchProject(tx, projectId);
    });

    return { ok: true };
  }

  async listPrompts(userId: bigint, projectId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const prompts = await this.prisma.projectPrompt.findMany({
      where: { userId, projectId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return prompts.map((item) => this.serializeProjectPrompt(item));
  }

  async createPrompt(userId: bigint, projectId: bigint, dto: CreateProjectPromptDto) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);

    const created = await this.prisma.$transaction(async (tx) => {
      const prompt = await tx.projectPrompt.create({
        data: {
          userId,
          projectId,
          type: dto.type,
          title: this.normalizeProjectPromptTitle(dto.title),
          prompt: this.normalizeRequiredText(dto.prompt, 'Project prompt'),
        },
      });
      await this.touchProject(tx, projectId);
      return prompt;
    });

    return this.serializeProjectPrompt(created);
  }

  async updatePrompt(
    userId: bigint,
    projectId: bigint,
    promptId: bigint,
    dto: UpdateProjectPromptDto,
  ) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.ensureOwnedPrompt(this.prisma, userId, projectId, promptId);

    const data: Prisma.ProjectPromptUpdateInput = {};

    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.title !== undefined) {
      data.title = this.normalizeProjectPromptTitle(dto.title);
    }
    if (dto.prompt !== undefined) {
      data.prompt = this.normalizeRequiredText(dto.prompt, 'Project prompt');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const prompt = await tx.projectPrompt.update({
        where: { id: promptId },
        data,
      });
      await this.touchProject(tx, projectId);
      return prompt;
    });

    return this.serializeProjectPrompt(updated);
  }

  async deletePrompt(userId: bigint, projectId: bigint, promptId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.ensureOwnedPrompt(this.prisma, userId, projectId, promptId);

    await this.prisma.$transaction(async (tx) => {
      await tx.projectPrompt.delete({ where: { id: promptId } });
      await this.touchProject(tx, projectId);
    });

    return { ok: true };
  }

  async generateInspirationVideoPrompt(
    userId: bigint,
    projectId: bigint,
    inspirationId: bigint,
    dto: GenerateProjectInspirationPromptDto,
  ) {
    const project = await this.ensureOwnedProject(this.prisma, userId, projectId);
    const currentInspiration = await this.ensureOwnedInspiration(this.prisma, userId, projectId, inspirationId);
    const inspirations = await this.prisma.projectInspiration.findMany({
      where: { userId, projectId },
      orderBy: { createdAt: 'asc' },
    });
    const orderedInspirations = this.sortInspirations(inspirations);
    const currentIndex = orderedInspirations.findIndex((item) => item.id === inspirationId);
    const previousInspirations = currentIndex > 0 ? orderedInspirations.slice(0, currentIndex) : [];
    const { documents } = await this.collectProjectDescriptionDocuments({
      userId,
      projectId,
      uploadedFiles: [],
    });

    const options: Required<GenerateProjectInspirationPromptDto> = {
      includeProjectDescription: dto.includeProjectDescription ?? true,
      includePreviousInspirations: dto.includePreviousInspirations ?? true,
      includePreviousContextText: dto.includePreviousContextText ?? true,
      includePreviousPlotText: dto.includePreviousPlotText ?? true,
    };

    const promptResult = await this.promptOptimize.optimizePrompt(
      userId,
      this.buildProjectStoryboardPrompt({
        project,
        currentInspiration,
        previousInspirations,
        documents,
        options,
      }),
      undefined,
      undefined,
      undefined,
      'project_storyboard',
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const inspiration = await tx.projectInspiration.update({
        where: { id: inspirationId },
        data: { generatedPrompt: promptResult.content },
      });
      await this.touchProject(tx, projectId);
      return inspiration;
    });

    return this.serializeProjectInspiration(updated);
  }

  async deleteProject(userId: bigint, projectId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.prisma.project.delete({ where: { id: projectId } });
    return { ok: true };
  }

  async listAssets(userId: bigint, projectId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const assets = await this.prisma.projectAsset.findMany({
      where: { userId, projectId },
      orderBy: { createdAt: 'desc' },
    });
    return assets.map((asset) => this.serializeProjectAsset(asset));
  }

  async updateAsset(userId: bigint, projectId: bigint, assetId: bigint, dto: UpdateProjectAssetDto) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const existing = await this.ensureOwnedAsset(this.prisma, userId, projectId, assetId);

    const title = dto.title !== undefined ? trimText(dto.title) : existing.title;
    if (!title) throw new BadRequestException('Asset title is required');

    const description =
      dto.description !== undefined
        ? this.normalizeOptionalText(dto.description)
        : existing.description ?? null;

    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException('At least one asset field must be provided');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.projectAsset.update({
        where: { id: assetId },
        data: {
          title,
          description,
        },
      });
      await this.touchProject(tx, projectId);
      return asset;
    });

    return this.serializeProjectAsset(updated);
  }

  async deleteAsset(userId: bigint, projectId: bigint, assetId: bigint) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    await this.ensureOwnedAsset(this.prisma, userId, projectId, assetId);

    await this.prisma.$transaction(async (tx) => {
      await tx.projectAsset.delete({ where: { id: assetId } });
      await this.touchProject(tx, projectId);
    });

    return { ok: true };
  }

  async listImportableWorks(userId: bigint, query: ListImportableWorksDto): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;
    const promptFilter = trimText(query.q);
    const type = query.type === 'video' ? 'video' : 'image';

    if (type === 'video') {
      const where: Prisma.VideoTaskWhereInput = {
        userId,
        status: TaskStatus.completed,
        resultUrl: { not: null },
        ...(promptFilter ? { prompt: { contains: promptFilter } } : {}),
      };

      const [items, total] = await Promise.all([
        this.prisma.videoTask.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            prompt: true,
            thumbnailUrl: true,
            resultUrl: true,
            createdAt: true,
          },
        }),
        this.prisma.videoTask.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);
      return {
        data: items.map((item) => this.serializeImportableWork('video', item)),
        pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
      };
    }

    const where: Prisma.ImageTaskWhereInput = {
      userId,
      status: TaskStatus.completed,
      deletedAt: null,
      resultUrl: { not: null },
      ...(promptFilter ? { prompt: { contains: promptFilter } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.imageTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          prompt: true,
          thumbnailUrl: true,
          resultUrl: true,
          createdAt: true,
        },
      }),
      this.prisma.imageTask.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: items.map((item) => this.serializeImportableWork('image', item)),
      pagination: { page, limit, total, totalPages, hasMore: page < totalPages },
    };
  }

  async importAssets(userId: bigint, projectId: bigint, dto: ImportProjectAssetsDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureOwnedProject(tx, userId, projectId);

      const uniqueItems = Array.from(
        new Map(dto.items.map((item) => [`${item.type}:${item.id}`, item])).values(),
      );

      const imageIds = uniqueItems
        .filter((item) => item.type === 'image')
        .map((item) => BigInt(item.id));
      const videoIds = uniqueItems
        .filter((item) => item.type === 'video')
        .map((item) => BigInt(item.id));

      const [imageTasks, videoTasks] = await Promise.all([
        imageIds.length
          ? tx.imageTask.findMany({
              where: {
                id: { in: imageIds },
                userId,
                status: TaskStatus.completed,
                deletedAt: null,
                resultUrl: { not: null },
              },
              select: {
                id: true,
                prompt: true,
                resultUrl: true,
                thumbnailUrl: true,
                storageKey: true,
              },
            })
          : Promise.resolve([]),
        videoIds.length
          ? tx.videoTask.findMany({
              where: {
                id: { in: videoIds },
                userId,
                status: TaskStatus.completed,
                resultUrl: { not: null },
              },
              select: {
                id: true,
                prompt: true,
                resultUrl: true,
                thumbnailUrl: true,
                storageKey: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const imageMap = new Map(imageTasks.map((task) => [task.id.toString(), task]));
      const videoMap = new Map(videoTasks.map((task) => [task.id.toString(), task]));
      const importedAssets = [];
      let skippedCount = 0;

      for (const item of uniqueItems) {
        if (item.type === 'image') {
          const task = imageMap.get(item.id);
          if (!task || !task.resultUrl) {
            throw new BadRequestException(`Image work ${item.id} not found`);
          }

          const existing = await tx.projectAsset.findFirst({
            where: { projectId, userId, imageTaskId: task.id },
          });
          if (existing) {
            skippedCount += 1;
            continue;
          }

          const created = await tx.projectAsset.create({
            data: {
              userId,
              projectId,
              kind: ProjectAssetKind.image,
              source: ProjectAssetSource.task,
              title: previewPrompt(task.prompt, '图片素材'),
              description: task.prompt,
              sourcePrompt: task.prompt,
              url: task.resultUrl,
              thumbnailUrl: task.thumbnailUrl ?? task.resultUrl,
              storageKey: task.storageKey,
              imageTaskId: task.id,
            },
          });
          importedAssets.push(created);
          continue;
        }

        const task = videoMap.get(item.id);
        if (!task || !task.resultUrl) {
          throw new BadRequestException(`Video work ${item.id} not found`);
        }

        const existing = await tx.projectAsset.findFirst({
          where: { projectId, userId, videoTaskId: task.id },
        });
        if (existing) {
          skippedCount += 1;
          continue;
        }

        const created = await tx.projectAsset.create({
          data: {
            userId,
            projectId,
            kind: ProjectAssetKind.video,
            source: ProjectAssetSource.task,
            title: previewPrompt(task.prompt, '视频素材'),
            description: task.prompt,
            sourcePrompt: task.prompt,
            url: task.resultUrl,
            thumbnailUrl: task.thumbnailUrl ?? null,
            storageKey: task.storageKey,
            videoTaskId: task.id,
          },
        });
        importedAssets.push(created);
      }

      if (importedAssets.length > 0) {
        await this.touchProject(tx, projectId);
      }

      return {
        importedCount: importedAssets.length,
        skippedCount,
        assets: importedAssets.map((asset) => this.serializeProjectAsset(asset)),
      };
    });
  }

  async uploadAssets(userId: bigint, projectId: bigint, kind: ProjectAssetKind, files: Express.Multer.File[]) {
    await this.ensureOwnedProject(this.prisma, userId, projectId);
    const rule = PROJECT_UPLOAD_RULES[kind];
    const documentParseMaxChars =
      kind === ProjectAssetKind.document ? await this.getProjectDocumentParseMaxChars() : null;

    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('请至少上传一个文件');
    }

    if (files.length > rule.maxFiles) {
      throw new BadRequestException(`单次最多上传 ${rule.maxFiles} 个文件`);
    }

    const createdAssets = [];
    for (const file of files) {
      this.assertProjectUploadFile(kind, file);
      const normalizedName = normalizeUploadedFileName(file.originalname);
      const baseTitle = previewPrompt(stripExtension(normalizedName), kind === 'image' ? '图片素材' : kind === 'video' ? '视频素材' : '文档素材');

      if (kind === ProjectAssetKind.image) {
        const stored = await this.storage.saveProjectImageUpload(file.buffer, normalizedName, file.mimetype);
        const created = await this.prisma.projectAsset.create({
          data: {
            userId,
            projectId,
            kind: ProjectAssetKind.image,
            source: ProjectAssetSource.upload,
            title: baseTitle,
            description: baseTitle,
            fileName: normalizedName,
            mimeType: file.mimetype || null,
            fileSize: file.size ?? null,
            url: stored.original.url,
            thumbnailUrl: stored.thumbnail?.url ?? stored.original.url,
            storageKey: stored.original.storageKey,
          },
        });
        createdAssets.push(created);
        continue;
      }

      if (kind === ProjectAssetKind.document) {
        const stored = await this.storage.saveProjectDocumentUpload(file.buffer, normalizedName, file.mimetype);
        const parsedRecord = await this.buildProjectDocumentChatFileRecord(
          file,
          documentParseMaxChars ?? 120000,
        );
        const created = await this.prisma.$transaction(async (tx) => {
          const asset = await tx.projectAsset.create({
            data: {
              userId,
              projectId,
              kind: ProjectAssetKind.document,
              source: ProjectAssetSource.upload,
              title: baseTitle,
              description: baseTitle,
              fileName: normalizedName,
              mimeType: file.mimetype || null,
              fileSize: file.size ?? null,
              url: stored.original.url,
              thumbnailUrl: null,
              storageKey: stored.original.storageKey,
            },
          });

          await tx.chatFile.create({
            data: {
              userId,
              projectAssetId: asset.id,
              fileName: parsedRecord.fileName,
              mimeType: parsedRecord.mimeType,
              fileSize: parsedRecord.fileSize,
              extension: parsedRecord.extension,
              extractedText: parsedRecord.extractedText,
              textLength: parsedRecord.textLength,
              status: parsedRecord.status,
              errorMessage: parsedRecord.errorMessage,
            },
          });

          return asset;
        });
        createdAssets.push(created);
        continue;
      }

      const stored = await this.storage.saveProjectVideoUpload(file.buffer, normalizedName, file.mimetype);
      const created = await this.prisma.projectAsset.create({
        data: {
          userId,
          projectId,
          kind: ProjectAssetKind.video,
          source: ProjectAssetSource.upload,
          title: baseTitle,
          description: baseTitle,
          fileName: normalizedName,
          mimeType: file.mimetype || null,
          fileSize: file.size ?? null,
          url: stored.original.url,
          thumbnailUrl: stored.thumbnail?.url ?? null,
          storageKey: stored.original.storageKey,
        },
      });
      createdAssets.push(created);
    }

    await this.touchProject(this.prisma, projectId);

    return {
      assets: createdAssets.map((asset) => this.serializeProjectAsset(asset)),
    };
  }

  async mergeStoryboardVideos(userId: bigint, projectId: bigint, dto?: MergeProjectStoryboardDto) {
    const project = await this.ensureOwnedProject(this.prisma, userId, projectId);
    const requestedShotIds = this.normalizeStoryboardShotIds(dto?.shotIds);
    const latestStoryboardByShotId = await this.collectLatestCompletedStoryboardByShotId(userId, projectId, requestedShotIds);

    const orderedShotIds =
      requestedShotIds.length > 0
        ? requestedShotIds
        : this.sortStoryboardShotIds(latestStoryboardByShotId.keys());

    if (orderedShotIds.length === 0) {
      throw new BadRequestException('No completed storyboard videos are available to merge');
    }

    const missingShotIds = orderedShotIds.filter((shotId) => !latestStoryboardByShotId.has(shotId));
    if (missingShotIds.length > 0) {
      throw new BadRequestException(`Some storyboard shots are not completed yet: ${missingShotIds.join(', ')}`);
    }

    const storyboardInputs = orderedShotIds
      .map((shotId) => latestStoryboardByShotId.get(shotId) ?? null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const tempDir = await mkdtemp(join(tmpdir(), 'auto-project-merge-'));

    try {
      const preparedInputs: Array<{
        inputPath: string;
        normalizedPath: string;
        sourceHasAudio: boolean;
      }> = [];
      let hasAnyAudio = false;

      for (const [index, input] of storyboardInputs.entries()) {
        const inputPath = join(tempDir, `input-${index + 1}.mp4`);
        const normalizedPath = join(tempDir, `normalized-${index + 1}.mp4`);
        await this.downloadUrlToFile(input.resultUrl, inputPath);
        const sourceHasAudio = await this.probeStoryboardClipHasAudio(inputPath);
        if (sourceHasAudio) {
          hasAnyAudio = true;
        }
        preparedInputs.push({
          inputPath,
          normalizedPath,
          sourceHasAudio,
        });
      }

      const normalizedPaths: string[] = [];
      for (const input of preparedInputs) {
        await this.normalizeStoryboardClip({
          inputPath: input.inputPath,
          outputPath: input.normalizedPath,
          preserveAudio: hasAnyAudio,
          sourceHasAudio: input.sourceHasAudio,
        });
        normalizedPaths.push(input.normalizedPath);
      }

      const mergedOutputPath = join(tempDir, 'merged-storyboard.mp4');
      await this.concatNormalizedStoryboardClips(normalizedPaths, mergedOutputPath, hasAnyAudio);

      const mergedBuffer = await readFile(mergedOutputPath);
      const fileName = normalizeUploadedFileName(
        `${this.buildMergedStoryboardTitle(project.name).replace(/\s+/g, '-')}.mp4`,
      );
      const stored = await this.storage.saveProjectVideoUpload(mergedBuffer, fileName, 'video/mp4');

      const title = this.buildMergedStoryboardTitle(project.name);
      const description = this.buildMergedStoryboardDescription(storyboardInputs.length, hasAnyAudio);
      const sourcePrompt = this.buildMergedStoryboardSourcePrompt(orderedShotIds);

      const asset = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.projectAsset.findFirst({
          where: {
            userId,
            projectId,
            kind: ProjectAssetKind.video,
            source: ProjectAssetSource.upload,
            sourcePrompt: {
              startsWith: AUTO_PROJECT_MERGED_STORYBOARD_SENTINEL,
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        });

        const baseData = {
          title,
          description,
          sourcePrompt,
          fileName,
          mimeType: 'video/mp4',
          fileSize: stored.original.size ?? null,
          url: stored.original.url,
          thumbnailUrl: stored.thumbnail?.url ?? null,
          storageKey: stored.original.storageKey,
        };

        const mergedAsset = existing
          ? await tx.projectAsset.update({
              where: { id: existing.id },
              data: baseData,
            })
          : await tx.projectAsset.create({
              data: {
                userId,
                projectId,
                kind: ProjectAssetKind.video,
                source: ProjectAssetSource.upload,
                ...baseData,
              },
            });

        await this.touchProject(tx, projectId);
        return mergedAsset;
      });

      return this.serializeProjectAsset(asset);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async syncImageTaskAsset(taskId: bigint) {
    const task = await this.prisma.imageTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        userId: true,
        projectId: true,
        prompt: true,
        providerData: true,
        resultUrl: true,
        thumbnailUrl: true,
        storageKey: true,
        status: true,
      },
    });

    if (!task?.projectId || task.status !== TaskStatus.completed || !task.resultUrl) {
      return null;
    }
    const resultUrl = task.resultUrl;
    const autoProjectAsset = extractAutoProjectAssetMetadata(task.providerData);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: task.projectId!, userId: task.userId },
        select: { id: true },
      });
      if (!project) return null;

      const existing = await tx.projectAsset.findFirst({
        where: { projectId: task.projectId!, userId: task.userId, imageTaskId: task.id },
      });

      const baseData = {
        userId: task.userId,
        projectId: task.projectId!,
        kind: ProjectAssetKind.image,
        source: ProjectAssetSource.task,
        title: existing?.title ?? autoProjectAsset?.title ?? previewPrompt(task.prompt, '图片素材'),
        description: existing?.description ?? autoProjectAsset?.description ?? task.prompt,
        sourcePrompt: autoProjectAsset?.sourcePrompt ?? task.prompt,
        url: resultUrl,
        thumbnailUrl: task.thumbnailUrl ?? resultUrl,
        storageKey: task.storageKey ?? null,
      };

      const asset = existing
        ? await tx.projectAsset.update({
            where: { id: existing.id },
            data: baseData,
          })
        : await tx.projectAsset.create({
            data: {
              ...baseData,
              imageTaskId: task.id,
            },
          });

      await this.touchProject(tx, task.projectId!);
      return this.serializeProjectAsset(asset);
    });
  }

  async syncVideoTaskAsset(taskId: bigint) {
    const task = await this.prisma.videoTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        userId: true,
        projectId: true,
        prompt: true,
        providerData: true,
        resultUrl: true,
        thumbnailUrl: true,
        storageKey: true,
        status: true,
      },
    });

    if (!task?.projectId || task.status !== TaskStatus.completed || !task.resultUrl) {
      return null;
    }
    const resultUrl = task.resultUrl;
    const autoProjectAsset = extractAutoProjectAssetMetadata(task.providerData);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: task.projectId!, userId: task.userId },
        select: { id: true },
      });
      if (!project) return null;

      const existing = await tx.projectAsset.findFirst({
        where: { projectId: task.projectId!, userId: task.userId, videoTaskId: task.id },
      });

      const baseData = {
        userId: task.userId,
        projectId: task.projectId!,
        kind: ProjectAssetKind.video,
        source: ProjectAssetSource.task,
        title: existing?.title ?? autoProjectAsset?.title ?? previewPrompt(task.prompt, '视频素材'),
        description: existing?.description ?? autoProjectAsset?.description ?? task.prompt,
        sourcePrompt: autoProjectAsset?.sourcePrompt ?? task.prompt,
        url: resultUrl,
        thumbnailUrl: task.thumbnailUrl ?? null,
        storageKey: task.storageKey ?? null,
      };

      const asset = existing
        ? await tx.projectAsset.update({
            where: { id: existing.id },
            data: baseData,
          })
        : await tx.projectAsset.create({
            data: {
              ...baseData,
              videoTaskId: task.id,
            },
          });

      await this.touchProject(tx, task.projectId!);
      return this.serializeProjectAsset(asset);
    });
  }
}
