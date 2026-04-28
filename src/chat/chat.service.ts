import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiModel, ChatFile, Prisma } from '@prisma/client';
import { AiModelType, ApiChannelStatus, ChatMessageRole, ProjectAssetKind, TaskStatus, UserRole, UserStatus } from '../common/prisma-enums';
import axios from 'axios';
import { Response } from 'express';

import { EncryptionService } from '../encryption/encryption.service';
import { ImagesService } from '../images/images.service';
import { PrismaService } from '../prisma/prisma.service';
import { PROJECT_MASTER_IMAGE_PROMPT_TITLE } from '../projects/project-prompt.constants';
import { AiSettingsService } from '../settings/ai-settings.service';
import { DEFAULT_CHAT_FILE_SETTINGS } from '../settings/system-settings.constants';
import { SystemSettingsService } from '../settings/system-settings.service';
import { StorageService } from '../storage/storage.service';
import { normalizeUploadedFileName } from '../common/utils/upload-filename.util';
import {
  attachAutoProjectAssetMetadata,
  extractAutoProjectAssetMetadata,
  type AutoProjectTaskAssetMetadata,
} from '../common/utils/task-provider-data.util';
import { normalizeProviderKey } from '../common/utils/provider.util';
import { canCancelVideoTask, supportsVideoTaskCancel } from '../common/utils/video-task-cancel.util';
import { parseSqliteJson, toSqliteJson } from '../common/utils/sqlite-json.util';
import { buildModelCapabilities } from '../models/model-capabilities';
import { ChatFileParserService } from './chat-file-parser.service';
import {
  buildChatImageTaskParameters,
  buildChatVideoTaskParameters,
} from './chat-media-task-params';
import {
  extractAutoProjectAgentFromProviderData,
  parseAutoProjectAgentContext,
} from './auto-project-workflow.metadata';
import { AutoProjectWorkflowService } from './auto-project-workflow.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateChatImageTaskDto } from './dto/create-chat-image-task.dto';
import { CreateChatVideoTaskDto } from './dto/create-chat-video-task.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { VideosService } from '../videos/videos.service';

type UpstreamMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type UpstreamMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | UpstreamMessagePart[];
};

type ChatFileAttachment = {
  id: string;
  fileName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
};

type ChatCitation = {
  type: 'file';
  fileId?: string;
  fileName?: string;
  extension?: string;
  title?: string;
  url?: string;
  snippet: string;
  score?: number;
  chunkIndex?: number;
};

type ChatTaskRef = {
  kind: 'image' | 'video';
  taskId: string;
  taskNo?: string;
  status?: string;
  shotId?: string;
  finalStoryboard?: boolean;
  modelId?: string;
  provider?: string;
  prompt?: string;
  thumbnailUrl?: string | null;
  resultUrl?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  canCancel?: boolean;
  cancelSupported?: boolean;
};

type FileContextBuildResult = {
  systemMessage: string;
  attachments: ChatFileAttachment[];
  citations: ChatCitation[];
};

type ChatFileRuntimeSettings = {
  enabled: boolean;
  maxFilesPerMessage: number;
  maxFileSizeMb: number;
  maxExtractChars: number;
  contextMode: 'full' | 'retrieval';
  retrievalTopK: number;
  chunkSize: number;
  chunkOverlap: number;
  retrievalMaxChars: number;
  allowedExtensions: string[];
};

type MediaAgentContext = {
  enabled: boolean;
  modelId: string;
  preferredAspectRatio?: string | null;
  preferredResolution?: string | null;
  preferredDuration?: string | null;
  referenceImages: string[];
  referenceVideos: string[];
  referenceAudios: string[];
  autoCreate: boolean;
};

type MediaAgentStatus = 'clarify' | 'ready';
type MediaAgentIntent = 'edit' | 'generate';

type MediaAgentMetadata = {
  status: MediaAgentStatus;
  intent: MediaAgentIntent;
  optimizedPrompt: string | null;
  negativePrompt: string | null;
  suggestedReplies: string[];
  sourceUserMessageId: string;
  modelId: string;
  modelName: string;
  modelType: 'image' | 'video';
  preferredAspectRatio: string | null;
  preferredResolution: string | null;
  preferredDuration: string | null;
  referenceVideos: string[];
  referenceAudios: string[];
  referenceImageCount: number;
  referenceVideoCount: number;
  referenceAudioCount: number;
  autoCreated: boolean;
};

type ParsedMediaAgentResponse = {
  reply: string;
  status: MediaAgentStatus;
  intent: MediaAgentIntent;
  optimizedPrompt: string | null;
  negativePrompt: string | null;
  suggestedReplies: string[];
};

type ConversationComposerMode = 'chat' | 'image' | 'auto';

@Injectable()
export class ChatService {
  private static readonly DEFAULT_TITLE = 'New Chat';
  private static readonly PROJECT_CONTEXT_MAX_ASSET_ITEMS = 20;
  private static readonly PROJECT_CONTEXT_MAX_DOCUMENT_ITEMS = 4;
  private static readonly PROJECT_CONTEXT_MAX_INSPIRATION_ITEMS = 8;
  private static readonly PROJECT_CONTEXT_MAX_PROMPT_ITEMS = 8;
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly settings: SystemSettingsService,
    private readonly aiSettings: AiSettingsService,
    private readonly chatFileParser: ChatFileParserService,
    private readonly imagesService: ImagesService,
    private readonly videosService: VideosService,
    private readonly autoProjectWorkflow: AutoProjectWorkflowService,
    private readonly storage: StorageService,
  ) {}

  async listConversations(userId: bigint, q?: string) {
    const keyword = this.normalizeSearchKeyword(q);
    const where: Prisma.ChatConversationWhereInput = {
      userId,
      model: { is: { type: AiModelType.chat } },
    };

    if (keyword) {
      where.title = { contains: keyword };
    }

    const rows = await this.prisma.chatConversation.findMany({
      where,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, role: true, content: true, images: true, files: true, createdAt: true },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });

    return rows.map((row) => this.mapConversationSummary(row));
  }

  async createConversation(userId: bigint, dto: CreateConversationDto) {
    const modelId = this.parseBigInt(dto.modelId, 'modelId');

    const model = await this.prisma.aiModel.findFirst({
      where: {
        id: modelId,
        type: AiModelType.chat,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        type: true,
        supportsImageInput: true,
        isActive: true,
      },
    });

    if (!model) {
      throw new BadRequestException('Chat model not found or inactive');
    }

    const now = new Date();
    const title = this.normalizeTitle(dto.title) ?? ChatService.DEFAULT_TITLE;

    const row = await this.prisma.chatConversation.create({
      data: {
        userId,
        modelId,
        title,
        lastMessageAt: now,
      },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
      },
    });

    return this.mapConversationSummary({ ...row, messages: [] });
  }

  async removeConversation(userId: bigint, conversationIdRaw: string) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    await this.requireConversation(userId, conversationId);

    await this.prisma.chatConversation.delete({ where: { id: conversationId } });
    return { ok: true };
  }

  async updateConversation(userId: bigint, conversationIdRaw: string, dto: UpdateConversationDto) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversation(userId, conversationId);

    const data: Prisma.ChatConversationUpdateInput = {};

    if (dto.modelId !== undefined) {
      const nextModelId = this.parseBigInt(dto.modelId, 'modelId');
      if (nextModelId !== conversation.model.id) {
        const nextModel = await this.prisma.aiModel.findFirst({
          where: {
            id: nextModelId,
            type: AiModelType.chat,
            isActive: true,
          },
          select: { id: true },
        });
        if (!nextModel) {
          throw new BadRequestException('Chat model not found or inactive');
        }
        data.model = { connect: { id: nextModel.id } };
      }
    }

    if (dto.title !== undefined) {
      const nextTitle = this.normalizeTitle(dto.title);
      if (!nextTitle) {
        throw new BadRequestException('title cannot be empty');
      }
      data.title = nextTitle;
    }

    if (dto.isPinned !== undefined) {
      data.isPinned = dto.isPinned;
    }

    if (dto.clearProjectContext === true && conversation.projectContext) {
      data.projectContext = { disconnect: true };
    } else if (dto.projectContextId !== undefined) {
      const nextProjectId = this.parseBigInt(dto.projectContextId, 'projectContextId');
      if (nextProjectId !== conversation.projectContext?.id) {
        const project = await this.prisma.project.findFirst({
          where: {
            id: nextProjectId,
            userId,
          },
          select: { id: true },
        });
        if (!project) {
          throw new BadRequestException('Project not found');
        }
        data.projectContext = { connect: { id: project.id } };
      }
    }

    if (!Object.keys(data).length) {
      const latest = await this.prisma.chatMessage.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: {
          content: true,
          images: true,
          files: true,
          createdAt: true,
        },
      });
      return this.mapConversationSummary({
        ...conversation,
        messages: latest ? [latest] : [],
      });
    }

    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, role: true, content: true, images: true, files: true, createdAt: true },
        },
      },
    });

    return this.mapConversationSummary(updated);
  }

  async getMessages(userId: bigint, conversationIdRaw: string) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversation(userId, conversationId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const mappedMessages = messages.map((msg) => this.mapMessage(msg));
    const hydratedMessages = await this.hydrateTaskRefsForMessages(userId, mappedMessages);

    return {
      conversation: this.mapConversationSummary({ ...conversation, messages: [] }),
      messages: hydratedMessages,
    };
  }

  async removeMessageTurn(userId: bigint, conversationIdRaw: string, messageIdRaw: string) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversation(userId, conversationId);
    const messageId = this.parseBigInt(messageIdRaw, 'messageId');

    const timeline = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        role: true,
      },
    });

    const currentIndex = timeline.findIndex((item) => item.id === messageId);
    if (currentIndex < 0) {
      throw new NotFoundException('Message not found');
    }

    const pivot = timeline[currentIndex];
    if (pivot.role !== ChatMessageRole.user) {
      throw new BadRequestException('Only user message can be used to remove a turn');
    }

    const deleteIds: bigint[] = [pivot.id];
    for (let idx = currentIndex + 1; idx < timeline.length; idx += 1) {
      const candidate = timeline[idx];
      if (candidate.role === ChatMessageRole.user) {
        break;
      }
      if (candidate.role === ChatMessageRole.assistant || candidate.role === ChatMessageRole.system) {
        deleteIds.push(candidate.id);
      }
    }

    const updatedConversation = await this.prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany({
        where: {
          conversationId,
          id: { in: deleteIds },
        },
      });

      const remainingMessages = await tx.chatMessage.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          createdAt: true,
          providerData: true,
        },
      });
      const latest = remainingMessages[remainingMessages.length - 1];

      return tx.chatConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: latest?.createdAt ?? conversation.createdAt,
          composerMode: this.resolveComposerModeLockFromMessages(remainingMessages),
        },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
              supportsImageInput: true,
              isActive: true,
            },
          },
          projectContext: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { id: true, role: true, content: true, images: true, files: true, createdAt: true },
          },
        },
      });
    });

    return {
      ok: true,
      deletedMessageIds: deleteIds.map((id) => id.toString()),
      conversation: this.mapConversationSummary(updatedConversation),
    };
  }

  async uploadFiles(userId: bigint, conversationIdRaw: string, files: Express.Multer.File[]) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    await this.requireConversation(userId, conversationId);

    const settings = await this.getChatFileRuntimeSettings();

    if (!settings.enabled) {
      throw new BadRequestException('管理员已关闭聊天文件上传功能');
    }
    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('请至少上传一个文件');
    }

    if (files.length > settings.maxFilesPerMessage) {
      throw new BadRequestException(`单次最多上传 ${settings.maxFilesPerMessage} 个文件`);
    }

    const acceptedExtSet = new Set(settings.allowedExtensions);
    const uploaded = [];

    for (const file of files) {
      const fileSize = file.size ?? 0;
      const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
      if (fileSize > maxBytes) {
        throw new BadRequestException(
          `文件 ${normalizeUploadedFileName(file.originalname)} 超过大小限制（${settings.maxFileSizeMb}MB）`,
        );
      }

      const parsed = await this.chatFileParser.parse(file, settings.maxExtractChars);
      if (!acceptedExtSet.has(parsed.extension)) {
        throw new BadRequestException(`文件 ${parsed.fileName} 的扩展名不在允许列表内`);
      }

      const created = await this.prisma.chatFile.create({
        data: {
          userId,
          conversationId,
          fileName: parsed.fileName,
          mimeType: parsed.mimeType,
          fileSize: parsed.fileSize,
          extension: parsed.extension,
          extractedText: parsed.extractedText,
          textLength: parsed.extractedText.length,
          status: 'ready',
        },
      });

      uploaded.push(this.mapChatFile(created));
    }

    return { files: uploaded };
  }

  async sendMessage(userId: bigint, conversationIdRaw: string, dto: SendMessageDto) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversationWithChannel(userId, conversationId);

    if (conversation.model.type !== AiModelType.chat) {
      throw new BadRequestException('Conversation model is not chat type');
    }
    if (!conversation.model.isActive) {
      throw new BadRequestException('Conversation model is inactive');
    }
    if (conversation.model.channel.status !== ApiChannelStatus.active) {
      throw new BadRequestException('Model channel is inactive');
    }

    const content = (dto.content ?? '').trim();
    const images = this.normalizeImages(dto.images);
    const fileIds = this.normalizeFileIds(dto.fileIds);
    const mediaAgent = this.normalizeMediaAgentContext(dto.mediaAgent ?? dto.imageAgent);
    const autoProjectAgent = parseAutoProjectAgentContext(dto.autoProjectAgent);
    const requestedMode = this.resolveConversationComposerMode({
      mediaAgent,
      autoProjectAgent,
    });

    if (!content && images.length === 0 && fileIds.length === 0) {
      throw new BadRequestException('content, images or files is required');
    }

    await this.assertConversationComposerMode({
      conversationId,
      requestedMode,
    });

    if (mediaAgent?.enabled && autoProjectAgent?.enabled) {
      throw new BadRequestException('Media Agent and Auto Project Agent cannot be enabled together');
    }

    if (mediaAgent?.enabled && fileIds.length > 0) {
      throw new BadRequestException('Media Agent does not support file attachments');
    }
    if (autoProjectAgent?.enabled && (images.length > 0 || fileIds.length > 0)) {
      throw new BadRequestException('Auto Project Agent does not support direct attachments');
    }

    const supportsImageInput = Boolean(conversation.model.supportsImageInput);
    if (images.length > 0 && !supportsImageInput && !mediaAgent?.enabled) {
      throw new BadRequestException('Current model does not support image uploads');
    }

    const fileContext: FileContextBuildResult = { systemMessage: '', attachments: [], citations: [] };
    let projectContextSystemMessage = '';
    let projectActionSystemMessage = '';
    let mergedCitations: ChatCitation[] = [];

    if (!mediaAgent?.enabled && !autoProjectAgent?.enabled) {
      const chatFileSettings = await this.getChatFileRuntimeSettings();
      if (fileIds.length > 0 && !chatFileSettings.enabled) {
        throw new BadRequestException('管理员已关闭聊天文件上传功能');
      }
      const builtFileContext = await this.buildFileContext({
        userId,
        conversationId,
        fileIds,
        query: content,
        settings: chatFileSettings,
      });

      fileContext.systemMessage = builtFileContext.systemMessage;
      fileContext.attachments = builtFileContext.attachments;
      fileContext.citations = builtFileContext.citations;
      projectContextSystemMessage = await this.buildConversationProjectContextSystemMessage(
        userId,
        conversation.projectContext?.id ?? null,
      );
      projectActionSystemMessage = projectContextSystemMessage
        ? this.buildProjectPromptActionSystemMessage(conversation.projectContext?.name ?? null)
        : '';
      mergedCitations = [...builtFileContext.citations];
    }

    const now = new Date();
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.user,
        content,
        images: images.length > 0 ? toSqliteJson(images) : undefined,
        files: fileContext.attachments.length > 0 ? toSqliteJson(fileContext.attachments) : undefined,
      },
    });

    const conversationUpdateData: Prisma.ChatConversationUpdateInput = {
      lastMessageAt: now,
      composerMode: requestedMode,
    };

    const nextTitle = this.buildAutoTitle(conversation.title, content);
    if (nextTitle) {
      conversationUpdateData.title = nextTitle;
    }

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: conversationUpdateData,
    });

    const recentMessagesDesc = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: this.resolveRecentMessageTake(conversation.model.maxContextRounds),
    });
    const recentMessages = recentMessagesDesc.reverse();
    let completion: { content: string; providerData?: unknown };
    if (autoProjectAgent?.enabled) {
      try {
        completion = await this.autoProjectWorkflow.completeTurn({
          userId,
          conversationId,
          conversation,
          recentMessages,
          autoProjectAgent,
          userInput: content,
        });
      } catch (error) {
        completion = this.buildVisibleAgentErrorCompletion({
          mode: 'auto',
          error,
          recentMessages,
        });
      }
    } else if (mediaAgent?.enabled) {
      try {
        completion = await this.completeMediaAgentTurn({
          userId,
          conversationId,
          conversation,
          recentMessages,
          mediaAgent,
          sourceUserMessageId: userMessage.id.toString(),
        });
      } catch (error) {
        completion = this.buildVisibleAgentErrorCompletion({
          mode: 'media',
          error,
          recentMessages,
        });
      }
    } else {
      completion = await this.requestChatCompletion(
        conversation,
        this.injectSystemContextIntoUpstream(
          await this.toUpstreamMessages(recentMessages, {
            includeImages: supportsImageInput,
          }),
          conversation.model.systemPrompt,
          projectContextSystemMessage,
          projectActionSystemMessage,
          fileContext.systemMessage,
        ),
      );
    }

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.assistant,
        content: completion.content,
        providerData: toSqliteJson({
          ...this.asJsonRecord(completion.providerData),
          ...(mergedCitations.length > 0 ? { citations: mergedCitations } : {}),
        }),
      },
    });

    const updatedConversation = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      conversation: this.mapConversationSummary({ ...updatedConversation, messages: [assistantMessage] }),
      userMessage: this.mapMessage(userMessage),
      assistantMessage: this.mapMessage(assistantMessage),
    };
  }

  async createImageTask(userId: bigint, conversationIdRaw: string, dto: CreateChatImageTaskDto) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversation(userId, conversationId);
    const userContent = (dto.userMessageContent ?? dto.prompt ?? '').trim();
    const currentImages = this.normalizeImages(dto.images, 20);

    if (!userContent) {
      throw new BadRequestException('prompt is required');
    }

    const { createdTask } = await this.generateConversationImageTask({
      userId,
      conversationId,
      imageModelIdRaw: dto.modelId,
      projectId: conversation.projectContext?.id ?? null,
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      currentImages,
      useConversationContextEdit: dto.useConversationContextEdit === true,
      preferredAspectRatio: dto.preferredAspectRatio ?? null,
      preferredResolution: dto.preferredResolution ?? null,
      parameters: dto.parameters && typeof dto.parameters === 'object' ? { ...dto.parameters } : {},
    });

    const now = new Date();
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.user,
        content: userContent,
        ...(currentImages.length > 0
          ? { images: toSqliteJson(currentImages) }
          : {}),
      },
    });

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.assistant,
        content: '已创建绘图任务，生成完成后会自动刷新。',
        providerData: toSqliteJson({
          taskRefs: [
            {
              kind: 'image',
              taskId: createdTask.id,
              taskNo: createdTask.taskNo,
              status: createdTask.status,
              modelId: createdTask.modelId,
              provider: createdTask.provider,
              prompt: createdTask.prompt,
              thumbnailUrl: createdTask.thumbnailUrl,
              resultUrl: createdTask.resultUrl,
              errorMessage: createdTask.errorMessage,
              createdAt: createdTask.createdAt,
              completedAt: createdTask.completedAt,
            },
          ],
        }),
      },
    });

    await this.markConfirmedMediaAgentMessage({
      userId,
      conversationId,
      sourceAssistantMessageId: dto.sourceAssistantMessageId,
    });

    const conversationUpdateData: Prisma.ChatConversationUpdateInput = {
      lastMessageAt: now,
      composerMode: 'image',
    };
    const nextTitle = this.buildAutoTitle(conversation.title, userContent);
    if (nextTitle) {
      conversationUpdateData.title = nextTitle;
    }

    const updatedConversation = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: conversationUpdateData,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      conversation: this.mapConversationSummary({ ...updatedConversation, messages: [assistantMessage] }),
      userMessage: this.mapMessage(userMessage),
      assistantMessage: this.mapMessage(assistantMessage),
    };
  }

  async createVideoTask(userId: bigint, conversationIdRaw: string, dto: CreateChatVideoTaskDto) {
    const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
    const conversation = await this.requireConversation(userId, conversationId);
    const userContent = (dto.userMessageContent ?? dto.prompt ?? '').trim();
    const currentImages = this.normalizeImages(dto.images, 20);
    const currentVideos = this.normalizeStringList(dto.videos, 10);
    const currentAudios = this.normalizeStringList(dto.audios, 10);

    if (!userContent) {
      throw new BadRequestException('prompt is required');
    }

    const { createdTask } = await this.generateConversationVideoTask({
      userId,
      conversationId,
      videoModelIdRaw: dto.modelId,
      projectId: conversation.projectContext?.id ?? null,
      prompt: dto.prompt,
      currentImages,
      currentVideos,
      currentAudios,
      useConversationContextEdit: dto.useConversationContextEdit === true,
      preferredAspectRatio: dto.preferredAspectRatio ?? null,
      preferredResolution: dto.preferredResolution ?? null,
      preferredDuration: dto.preferredDuration ?? null,
      parameters: dto.parameters && typeof dto.parameters === 'object' ? { ...dto.parameters } : {},
    });

    const now = new Date();
    const userMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.user,
        content: userContent,
        ...(currentImages.length > 0
          ? { images: toSqliteJson(currentImages) }
          : {}),
      },
    });

    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        conversationId,
        userId,
        role: ChatMessageRole.assistant,
        content: '已创建视频任务，生成完成后会自动刷新。',
        providerData: toSqliteJson({
          taskRefs: [this.toChatVideoTaskRef(createdTask)],
        }),
      },
    });

    await this.markConfirmedMediaAgentMessage({
      userId,
      conversationId,
      sourceAssistantMessageId: dto.sourceAssistantMessageId,
    });

    const conversationUpdateData: Prisma.ChatConversationUpdateInput = {
      lastMessageAt: now,
      composerMode: 'image',
    };
    const nextTitle = this.buildAutoTitle(conversation.title, userContent);
    if (nextTitle) {
      conversationUpdateData.title = nextTitle;
    }

    const updatedConversation = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: conversationUpdateData,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      conversation: this.mapConversationSummary({ ...updatedConversation, messages: [assistantMessage] }),
      userMessage: this.mapMessage(userMessage),
      assistantMessage: this.mapMessage(assistantMessage),
    };
  }

  private async markConfirmedMediaAgentMessage(params: {
    userId: bigint;
    conversationId: bigint;
    sourceAssistantMessageId?: string;
  }) {
    if (!params.sourceAssistantMessageId?.trim()) return;

    const assistantMessageId = this.parseBigInt(params.sourceAssistantMessageId, 'sourceAssistantMessageId');
    const sourceMessage = await this.prisma.chatMessage.findFirst({
      where: {
        id: assistantMessageId,
        conversationId: params.conversationId,
        userId: params.userId,
        role: ChatMessageRole.assistant,
      },
      select: {
        id: true,
        providerData: true,
      },
    });

    if (
      !sourceMessage?.providerData
    ) {
      return;
    }

    const providerData = this.asJsonRecord(sourceMessage.providerData);
    if (Object.keys(providerData).length === 0) return;
    const rawMediaAgent = providerData.mediaAgent ?? providerData.imageAgent;
    if (!rawMediaAgent || typeof rawMediaAgent !== 'object' || Array.isArray(rawMediaAgent)) {
      return;
    }

    providerData.mediaAgent = {
      ...(rawMediaAgent as Record<string, unknown>),
      autoCreated: true,
    };

    await this.prisma.chatMessage.update({
      where: { id: assistantMessageId },
      data: {
        providerData: toSqliteJson(providerData),
      },
    });
  }

  async streamMessage(userId: bigint, conversationIdRaw: string, dto: SendMessageDto, res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    (res as Response & { socket?: { setNoDelay?: (noDelay?: boolean) => void } }).socket?.setNoDelay?.(true);
    res.write(': connected\n\n');

    let closed = false;
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    res.on('close', () => {
      closed = true;
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    });
    const sendSse = (payload: Record<string, unknown>) => {
      if (closed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      (res as Response & { flush?: () => void }).flush?.();
    };
    const closeSse = () => {
      if (closed || res.writableEnded) return;
      closed = true;
      res.write('data: [DONE]\n\n');
      res.end();
    };
    keepAlive = setInterval(() => {
      if (closed || res.writableEnded) return;
      try {
        res.write(': ping\n\n');
        (res as Response & { flush?: () => void }).flush?.();
      } catch {
        closed = true;
      }
    }, 10_000);

    try {
      const conversationId = this.parseBigInt(conversationIdRaw, 'conversationId');
      const conversation = await this.requireConversationWithChannel(userId, conversationId);

      if (conversation.model.type !== AiModelType.chat) {
        throw new BadRequestException('Conversation model is not chat type');
      }
      if (!conversation.model.isActive) {
        throw new BadRequestException('Conversation model is inactive');
      }
      if (conversation.model.channel.status !== ApiChannelStatus.active) {
        throw new BadRequestException('Model channel is inactive');
      }

      const content = (dto.content ?? '').trim();
      const images = this.normalizeImages(dto.images);
      const fileIds = this.normalizeFileIds(dto.fileIds);
      const mediaAgent = this.normalizeMediaAgentContext(dto.mediaAgent ?? dto.imageAgent);
      const autoProjectAgent = parseAutoProjectAgentContext(dto.autoProjectAgent);
      const requestedMode = this.resolveConversationComposerMode({
        mediaAgent,
        autoProjectAgent,
      });

      if (!content && images.length === 0 && fileIds.length === 0) {
        throw new BadRequestException('content, images or files is required');
      }

      await this.assertConversationComposerMode({
        conversationId,
        requestedMode,
      });

      if (mediaAgent?.enabled && autoProjectAgent?.enabled) {
        throw new BadRequestException('Media Agent and Auto Project Agent cannot be enabled together');
      }

      if (mediaAgent?.enabled && fileIds.length > 0) {
        throw new BadRequestException('Media Agent does not support file attachments');
      }
      if (autoProjectAgent?.enabled && (images.length > 0 || fileIds.length > 0)) {
        throw new BadRequestException('Auto Project Agent does not support direct attachments');
      }

      const supportsImageInput = Boolean(conversation.model.supportsImageInput);
      if (images.length > 0 && !supportsImageInput && !mediaAgent?.enabled) {
        throw new BadRequestException('Current model does not support image uploads');
      }

      const fileContext: FileContextBuildResult = { systemMessage: '', attachments: [], citations: [] };
      let projectContextSystemMessage = '';
      let projectActionSystemMessage = '';
      let mergedCitations: ChatCitation[] = [];

      if (!mediaAgent?.enabled && !autoProjectAgent?.enabled) {
        const chatFileSettings = await this.getChatFileRuntimeSettings();
        if (fileIds.length > 0 && !chatFileSettings.enabled) {
          throw new BadRequestException('管理员已关闭聊天文件上传功能');
        }
        const builtFileContext = await this.buildFileContext({
          userId,
          conversationId,
          fileIds,
          query: content,
          settings: chatFileSettings,
        });

        fileContext.systemMessage = builtFileContext.systemMessage;
        fileContext.attachments = builtFileContext.attachments;
        fileContext.citations = builtFileContext.citations;
        projectContextSystemMessage = await this.buildConversationProjectContextSystemMessage(
          userId,
          conversation.projectContext?.id ?? null,
        );
        projectActionSystemMessage = projectContextSystemMessage
          ? this.buildProjectPromptActionSystemMessage(conversation.projectContext?.name ?? null)
          : '';
        mergedCitations = [...builtFileContext.citations];
      }

      const now = new Date();
      const userMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId,
          userId,
          role: ChatMessageRole.user,
          content,
          images: images.length > 0 ? toSqliteJson(images) : undefined,
          files: fileContext.attachments.length > 0 ? toSqliteJson(fileContext.attachments) : undefined,
        },
      });

      const conversationUpdateData: Prisma.ChatConversationUpdateInput = {
        lastMessageAt: now,
        composerMode: requestedMode,
      };
      const nextTitle = this.buildAutoTitle(conversation.title, content);
      if (nextTitle) {
        conversationUpdateData.title = nextTitle;
      }

      await this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: conversationUpdateData,
      });

      const startConversation = await this.prisma.chatConversation.findUnique({
        where: { id: conversationId },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
              supportsImageInput: true,
              isActive: true,
            },
          },
          projectContext: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, role: true, content: true, images: true, files: true, createdAt: true },
          },
        },
      });

      if (startConversation) {
        sendSse({
          type: 'start',
          conversation: this.mapConversationSummary(startConversation),
          userMessage: this.mapMessage(userMessage),
        });
      }

      const recentMessagesDesc = await this.prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: this.resolveRecentMessageTake(conversation.model.maxContextRounds),
      });
      const recentMessages = recentMessagesDesc.reverse();
      let completion: { content: string; providerData?: unknown };
      if (autoProjectAgent?.enabled) {
        try {
          completion = await this.autoProjectWorkflow.completeTurn({
            userId,
            conversationId,
            conversation,
            recentMessages,
            autoProjectAgent,
            userInput: content,
            onStatus: (message) => {
              sendSse({ type: 'status', stage: 'planning', message });
            },
          });
        } catch (error) {
          completion = this.buildVisibleAgentErrorCompletion({
            mode: 'auto',
            error,
            recentMessages,
          });
        }
      } else if (mediaAgent?.enabled) {
        try {
          completion = await this.completeMediaAgentTurn({
            userId,
            conversationId,
            conversation,
            recentMessages,
            mediaAgent,
            sourceUserMessageId: userMessage.id.toString(),
          });
        } catch (error) {
          completion = this.buildVisibleAgentErrorCompletion({
            mode: 'media',
            error,
            recentMessages,
          });
        }
      } else {
        completion = await this.requestChatCompletionStream(
          conversation,
          this.injectSystemContextIntoUpstream(
            await this.toUpstreamMessages(recentMessages, {
              includeImages: supportsImageInput,
            }),
            conversation.model.systemPrompt,
            projectContextSystemMessage,
            projectActionSystemMessage,
            fileContext.systemMessage,
          ),
          (chunk) => {
            sendSse({ type: 'delta', content: chunk });
          },
          (chunk) => {
            sendSse({ type: 'reasoning_delta', content: chunk });
          },
        );
      }

      if (mediaAgent?.enabled || autoProjectAgent?.enabled) {
        sendSse({ type: 'delta', content: completion.content });
      }

      const assistantMessage = await this.prisma.chatMessage.create({
        data: {
          conversationId,
          userId,
          role: ChatMessageRole.assistant,
          content: completion.content,
          providerData: toSqliteJson({
            ...this.asJsonRecord(completion.providerData),
            ...(mergedCitations.length > 0 ? { citations: mergedCitations } : {}),
          }),
        },
      });

      const updatedConversation = await this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
        include: {
          model: {
            select: {
              id: true,
              name: true,
              icon: true,
              type: true,
              supportsImageInput: true,
              isActive: true,
            },
          },
          projectContext: {
            select: {
              id: true,
              name: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, role: true, content: true, images: true, files: true, createdAt: true },
          },
        },
      });

      sendSse({
        type: 'done',
        conversation: this.mapConversationSummary(updatedConversation),
        assistantMessage: this.mapMessage(assistantMessage),
      });
      closeSse();
    } catch (error) {
      const message = this.normalizeExceptionMessage(error);
      this.logger.error(`Chat stream failed: ${message}`, error instanceof Error ? error.stack : undefined);
      sendSse({ type: 'error', message });
      closeSse();
    } finally {
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    }
  }

  private async requestChatCompletionStream(
    conversation: {
      model: {
        modelKey: string;
        defaultParams: Prisma.JsonValue | null;
        channel: {
          baseUrl: string;
          apiKey: string | null;
          extraHeaders: Prisma.JsonValue | null;
          timeout: number;
        };
      };
    },
    messages: UpstreamMessage[],
    onDelta: (delta: string) => void,
    onReasoningDelta: (delta: string) => void,
  ) {
    const decryptedApiKey = this.encryption.decryptString(conversation.model.channel.apiKey);
    if (!decryptedApiKey) {
      throw new BadRequestException('Channel API key is not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      Authorization: `Bearer ${decryptedApiKey}`,
    };

    const extraHeaders = this.normalizeExtraHeaders(conversation.model.channel.extraHeaders);
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers[key] = value;
    }

    const defaultParams =
      conversation.model.defaultParams && typeof conversation.model.defaultParams === 'object'
        ? (conversation.model.defaultParams as Record<string, unknown>)
        : {};

    const payload: Record<string, unknown> = {
      ...defaultParams,
      model: conversation.model.modelKey,
      messages,
      stream: true,
    };

    const timeout = Math.max(5_000, Math.min(conversation.model.channel.timeout ?? 60_000, 600_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.buildChatCompletionUrl(conversation.model.channel.baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const parsed = this.tryParseJson(body);
        const message =
          (parsed ? this.extractErrorMessage(parsed) : null) ||
          body.trim() ||
          `Upstream chat request failed (${response.status})`;
        throw new BadRequestException(message);
      }

      const providerData: Record<string, unknown> = {
        id: null,
        model: null,
        usage: null,
        reasoning: null,
      };
      const setProviderData = (payloadChunk: unknown) => {
        if (!payloadChunk || typeof payloadChunk !== 'object') return;
        const obj = payloadChunk as Record<string, unknown>;
        if (typeof obj.id === 'string') providerData.id = obj.id;
        if (typeof obj.model === 'string') providerData.model = obj.model;
        if ('usage' in obj && obj.usage) providerData.usage = obj.usage;
      };

      let fullText = '';
      let fullReasoning = '';
      const appendDelta = (incomingDelta: string) => {
        if (!incomingDelta) return;

        let incremental = incomingDelta;
        if (incomingDelta.startsWith(fullText)) {
          // Some providers stream cumulative content; emit only incremental suffix.
          incremental = incomingDelta.slice(fullText.length);
        } else if (fullText.endsWith(incomingDelta)) {
          // Duplicate chunk; ignore.
          incremental = '';
        }

        if (!incremental) return;

        for (const char of incremental) {
          fullText += char;
          onDelta(char);
        }
      };

      const appendReasoningDelta = (incomingDelta: string) => {
        if (!incomingDelta) return;

        let incremental = incomingDelta;
        if (incomingDelta.startsWith(fullReasoning)) {
          incremental = incomingDelta.slice(fullReasoning.length);
        } else if (fullReasoning.endsWith(incomingDelta)) {
          incremental = '';
        }

        if (!incremental) return;

        for (const char of incremental) {
          fullReasoning += char;
          onReasoningDelta(char);
        }
      };

      const processPayload = (raw: string) => {
        if (!raw || raw === '[DONE]') return;

        const parsed = this.tryParseJson(raw);
        if (!parsed) {
          appendDelta(raw);
          return;
        }

        setProviderData(parsed);

        const err = this.extractErrorMessage(parsed);
        if (err) {
          throw new BadRequestException(err);
        }

        const reasoningDelta = this.extractReasoningDelta(parsed);
        if (reasoningDelta) {
          appendReasoningDelta(reasoningDelta);
        }

        const delta = this.extractAssistantDelta(parsed);
        if (delta) {
          appendDelta(delta);
        }
      };

      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      const reader = response.body?.getReader();

      if (!reader) {
        const raw = await response.text();
        if (raw) processPayload(raw);
      } else {
        const decoder = new TextDecoder();
        let buffer = '';
        let isLineStream =
          contentType.includes('text/event-stream') ||
          contentType.includes('ndjson') ||
          contentType.includes('stream');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;

          if (!isLineStream && chunk.includes('data:')) {
            isLineStream = true;
          }

          if (!isLineStream) {
            // Plain text chunk stream (raw passthrough).
            appendDelta(chunk);
            continue;
          }

          buffer += chunk;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const normalizedLine = line.trimEnd();
            if (!normalizedLine) continue;
            if (normalizedLine.startsWith('data:')) {
              processPayload(normalizedLine.slice(5).trimStart());
              continue;
            }
            if (normalizedLine.startsWith('{') || normalizedLine.startsWith('[')) {
              processPayload(normalizedLine);
              continue;
            }
            appendDelta(normalizedLine);
          }
        }

        if (buffer) {
          if (isLineStream) {
            const tail = buffer.trim();
            if (tail.startsWith('data:')) {
              processPayload(tail.slice(5).trimStart());
            } else if (tail.startsWith('{') || tail.startsWith('[')) {
              processPayload(tail);
            } else {
              appendDelta(buffer);
            }
          } else {
            appendDelta(buffer);
          }
        }
      }

      if (!fullReasoning.trim()) {
        const extractedThink = this.extractThinkBlock(fullText);
        if (extractedThink.reasoning) {
          fullReasoning = extractedThink.reasoning;
          if (extractedThink.content) {
            fullText = extractedThink.content;
          }
        }
      }

      if (!fullText.trim() && fullReasoning.trim()) {
        fullText = fullReasoning;
      }

      if (!fullText.trim()) {
        throw new BadRequestException('Upstream chat returned empty content');
      }

      if (fullReasoning.trim()) {
        providerData.reasoning = fullReasoning;
      }

      return {
        content: fullText,
        providerData,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadRequestException('Upstream chat request timeout');
      }
      throw new BadRequestException('Upstream chat request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestChatCompletion(
    conversation: {
      model: {
        modelKey: string;
        defaultParams: Prisma.JsonValue | null;
        channel: {
          baseUrl: string;
          apiKey: string | null;
          extraHeaders: Prisma.JsonValue | null;
          timeout: number;
        };
      };
    },
    messages: UpstreamMessage[],
  ) {
    const decryptedApiKey = this.encryption.decryptString(conversation.model.channel.apiKey);
    if (!decryptedApiKey) {
      throw new BadRequestException('Channel API key is not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers.Authorization = `Bearer ${decryptedApiKey}`;

    const extraHeaders = this.normalizeExtraHeaders(conversation.model.channel.extraHeaders);
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers[key] = value;
    }

    const baseUrl = conversation.model.channel.baseUrl;
    const url = this.buildChatCompletionUrl(baseUrl);

    const defaultParams =
      conversation.model.defaultParams && typeof conversation.model.defaultParams === 'object'
        ? (conversation.model.defaultParams as Record<string, unknown>)
        : {};

    const payload: Record<string, unknown> = {
      ...defaultParams,
      model: conversation.model.modelKey,
      messages,
      stream: false,
    };

    const timeout = Math.max(5_000, Math.min(conversation.model.channel.timeout ?? 60_000, 600_000));

    const response = await axios.post(url, payload, {
      headers,
      timeout,
      validateStatus: () => true,
    });

    const body = response.data;

    if (response.status >= 400) {
      const message = this.extractErrorMessage(body) ?? `Upstream chat request failed (${response.status})`;
      throw new BadRequestException(message);
    }

    const upstreamError = this.extractErrorMessage(body);
    if (upstreamError) {
      throw new BadRequestException(upstreamError);
    }

    let content = this.extractAssistantContent(body);
    let reasoning = this.extractAssistantReasoning(body);

    if (!reasoning) {
      const extractedThink = this.extractThinkBlock(content);
      if (extractedThink.reasoning) {
        reasoning = extractedThink.reasoning;
        if (extractedThink.content) {
          content = extractedThink.content;
        }
      }
    }

    if (!content.trim() && reasoning.trim()) {
      content = reasoning;
    }

    if (!content.trim()) {
      throw new BadRequestException('Upstream chat returned empty content');
    }

    return {
      content,
      providerData: {
        id: typeof body?.id === 'string' ? body.id : null,
        model: typeof body?.model === 'string' ? body.model : null,
        usage: body?.usage ?? null,
        reasoning: reasoning || null,
      },
    };
  }

  private extractAssistantContent(payload: any): string {
    if (!payload || typeof payload !== 'object') return '';

    const firstChoice = payload.choices?.[0];
    const candidates = [
      firstChoice?.message?.content,
      firstChoice?.delta?.content,
      firstChoice?.text,
      payload.output_text,
      payload.content,
      payload.text,
    ];

    for (const value of candidates) {
      const normalized = this.normalizeUpstreamContent(value);
      if (normalized) return normalized;
    }

    return '';
  }

  private extractAssistantDelta(payload: any): string {
    if (!payload || typeof payload !== 'object') return '';

    const firstChoice = payload.choices?.[0];
    const deltaCandidates = [
      firstChoice?.delta?.content,
      firstChoice?.delta?.text,
      payload.delta?.content,
      payload.delta?.text,
      payload.content_block?.text,
    ];

    for (const value of deltaCandidates) {
      const normalized = this.normalizeUpstreamContent(value);
      if (normalized) return normalized;
    }

    // Some providers return plain JSON in a non-SSE response even when stream=true.
    const fallbackCandidates = [firstChoice?.message?.content, firstChoice?.text, payload.output_text, payload.content, payload.text];
    for (const value of fallbackCandidates) {
      const normalized = this.normalizeUpstreamContent(value);
      if (normalized) return normalized;
    }

    return '';
  }

  private extractReasoningDelta(payload: any): string {
    if (!payload || typeof payload !== 'object') return '';

    const firstChoice = payload.choices?.[0];
    const deltaCandidates = [
      firstChoice?.delta?.reasoning_content,
      firstChoice?.delta?.reasoning,
      firstChoice?.reasoning_content,
      firstChoice?.reasoning,
      payload.delta?.reasoning_content,
      payload.delta?.reasoning,
      payload.reasoning_content,
      payload.reasoning,
      payload.thinking,
      payload.thought,
      payload.content_block?.reasoning,
      payload.content_block?.thinking,
      payload.content_block?.thought,
    ];

    for (const value of deltaCandidates) {
      const normalized = this.normalizeUpstreamContent(value);
      if (normalized) return normalized;
    }

    return '';
  }

  private extractAssistantReasoning(payload: any): string {
    if (!payload || typeof payload !== 'object') return '';

    const firstChoice = payload.choices?.[0];
    const candidates = [
      firstChoice?.message?.reasoning_content,
      firstChoice?.message?.reasoning,
      firstChoice?.reasoning_content,
      firstChoice?.reasoning,
      payload.reasoning_content,
      payload.reasoning,
      payload.thinking,
      payload.thought,
      payload.output_reasoning,
    ];

    for (const value of candidates) {
      const normalized = this.normalizeUpstreamContent(value);
      if (normalized) return normalized;
    }

    return '';
  }

  private extractThinkBlock(raw: string): { content: string; reasoning: string } {
    const source = (raw ?? '').trim();
    if (!source) {
      return { content: '', reasoning: '' };
    }

    const regex = /<think>([\s\S]*?)<\/think>/gi;
    const reasoningParts: string[] = [];
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source)) !== null) {
      const block = (match[1] ?? '').trim();
      if (block) {
        reasoningParts.push(block);
      }
    }

    if (reasoningParts.length === 0) {
      return { content: source, reasoning: '' };
    }

    const content = source.replace(regex, '').trim();
    const reasoning = reasoningParts.join('\n\n').trim();
    return { content, reasoning };
  }

  private tryParseJson(raw: string) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private normalizeUpstreamContent(value: unknown): string {
    if (typeof value === 'string') return value;

    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (typeof part === 'string') return part;
          if (!part || typeof part !== 'object') return '';

          const partObj = part as Record<string, unknown>;
          if (typeof partObj.text === 'string') return partObj.text;
          if (typeof partObj.content === 'string') return partObj.content;
          return '';
        })
        .join('');
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text;
      if (typeof obj.content === 'string') return obj.content;
      if (Array.isArray(obj.content)) return this.normalizeUpstreamContent(obj.content);
    }

    return '';
  }

  private extractErrorMessage(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;

    const err = payload.error;
    if (!err) return null;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && typeof err.message === 'string') return err.message;

    return 'Upstream provider returned an error';
  }

  private async toUpstreamMessages(
    messages: Array<{ role: string; content: string; images: unknown; files?: unknown }>,
    options?: { includeImages?: boolean },
  ): Promise<UpstreamMessage[]> {
    const includeImages = options?.includeImages !== false;
    const out: UpstreamMessage[] = [];

    for (const msg of messages) {
        const role = msg.role as UpstreamMessage['role'];

        if (role !== 'assistant' && role !== 'system' && role !== 'user') continue;

        if (role !== 'user') {
          out.push({
            role,
            content: msg.content,
          });
          continue;
        }

        const images = includeImages ? this.extractImages(msg.images) : [];
        if (!includeImages) {
          const plainText = msg.content.trim();
          if (plainText) {
            out.push({
              role,
              content: msg.content,
            });
            continue;
          }

          const previousImageCount = this.extractImages(msg.images).length;
          if (previousImageCount > 0) {
            out.push({
              role,
              content: previousImageCount > 1 ? `[${previousImageCount} images omitted]` : '[image omitted]',
            });
            continue;
          }

          const fileCount = this.extractMessageFiles(msg.files ?? null).length;
          if (fileCount > 0) {
            out.push({
              role,
              content: fileCount > 1 ? `[${fileCount} files attached]` : '[file attached]',
            });
            continue;
          }

          continue;
        }

        if (images.length === 0) {
          const plainText = msg.content.trim();
          if (!plainText) {
            const fileCount = this.extractMessageFiles(msg.files ?? null).length;
            if (fileCount > 0) {
              out.push({
                role,
                content: fileCount > 1 ? `[${fileCount} files attached]` : '[file attached]',
              });
              continue;
            }

            continue;
          }

          out.push({
            role,
            content: msg.content,
          });
          continue;
        }

        const parts: UpstreamMessagePart[] = [];
        if (msg.content) {
          parts.push({ type: 'text', text: msg.content });
        }

        for (const image of images) {
          parts.push({
            type: 'image_url',
            image_url: { url: await this.toImageUrl(image) },
          });
        }

        out.push({
          role,
          content: parts,
        });
      }

    return out;
  }

  private async toImageUrl(value: string) {
    if (value.startsWith('data:image/')) {
      return value;
    }
    if (this.storage.isLocalObjectUrl(value)) {
      return this.storage.localImageUrlToDataUrl(value);
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    return `data:image/jpeg;base64,${value}`;
  }

  private buildChatCompletionUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
  }

  private normalizeExtraHeaders(raw: Prisma.JsonValue | null): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!key) continue;
      if (typeof value === 'string') {
        out[key] = value;
        continue;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        out[key] = String(value);
      }
    }
    return out;
  }
  private normalizeFileIds(fileIds?: string[]) {
    if (!Array.isArray(fileIds)) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of fileIds) {
      if (typeof raw !== 'string') continue;
      const value = raw.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
      if (out.length >= 20) break;
    }
    return out;
  }

  private resolveRecentMessageTake(maxContextRounds: number | null) {
    if (maxContextRounds === null || maxContextRounds === undefined) {
      return 40;
    }
    const rounds = Math.max(1, Math.min(Math.trunc(maxContextRounds), 200));
    return Math.max(2, rounds * 2);
  }

  private async getChatFileRuntimeSettings(): Promise<ChatFileRuntimeSettings> {
    const parsedAllowed = DEFAULT_CHAT_FILE_SETTINGS.chatFileAllowedExtensions
      .split(',')
      .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
      .filter((item) => item.length > 0);

    const supportedByParser = new Set(this.chatFileParser.getSupportedExtensions());
    const allowedExtensions = parsedAllowed.filter((item) => supportedByParser.has(item));
    if (allowedExtensions.length === 0) {
      for (const fallback of DEFAULT_CHAT_FILE_SETTINGS.chatFileAllowedExtensions.split(',')) {
        const ext = fallback.trim();
        if (ext && supportedByParser.has(ext)) allowedExtensions.push(ext);
      }
    }

    return {
      enabled: true,
      maxFilesPerMessage: 5,
      maxFileSizeMb: 20,
      maxExtractChars: DEFAULT_CHAT_FILE_SETTINGS.chatFileMaxExtractChars,
      contextMode: DEFAULT_CHAT_FILE_SETTINGS.chatFileContextMode,
      retrievalTopK: DEFAULT_CHAT_FILE_SETTINGS.chatFileRetrievalTopK,
      chunkSize: DEFAULT_CHAT_FILE_SETTINGS.chatFileChunkSize,
      chunkOverlap: DEFAULT_CHAT_FILE_SETTINGS.chatFileChunkOverlap,
      retrievalMaxChars: DEFAULT_CHAT_FILE_SETTINGS.chatFileRetrievalMaxChars,
      allowedExtensions: Array.from(new Set(allowedExtensions)),
    };
  }

  private async buildFileContext(params: {
    userId: bigint;
    conversationId: bigint;
    fileIds: string[];
    query: string;
    settings: ChatFileRuntimeSettings;
  }): Promise<FileContextBuildResult> {
    if (params.fileIds.length === 0) {
      return { systemMessage: '', attachments: [], citations: [] };
    }

    if (params.fileIds.length > params.settings.maxFilesPerMessage) {
      throw new BadRequestException(`单条消息最多上传 ${params.settings.maxFilesPerMessage} 个文件`);
    }

    const ids = params.fileIds.map((id) => this.parseBigInt(id, 'fileId'));
    const files = await this.prisma.chatFile.findMany({
      where: {
        userId: params.userId,
        conversationId: params.conversationId,
        status: 'ready',
        id: { in: ids },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const fileMap = new Map(files.map((file) => [file.id.toString(), file]));
    const orderedFiles: ChatFile[] = [];
    for (const id of params.fileIds) {
      const file = fileMap.get(id);
      if (!file) {
        throw new BadRequestException('文件不存在或不可用于当前会话');
      }
      orderedFiles.push(file);
    }

    const attachments = orderedFiles.map((file) => this.mapChatFile(file));
    const built =
      params.settings.contextMode === 'full'
        ? this.buildFullFileContext(orderedFiles, params.settings.retrievalMaxChars)
        : this.buildRetrievalFileContext(orderedFiles, params.query, {
            topK: params.settings.retrievalTopK,
            chunkSize: params.settings.chunkSize,
            chunkOverlap: params.settings.chunkOverlap,
            maxChars: params.settings.retrievalMaxChars,
          });

    return {
      systemMessage: built.message,
      attachments,
      citations: built.citations,
    };
  }


  private buildFullFileContext(files: ChatFile[], maxChars: number) {
    const sections: string[] = [];
    const citations: ChatCitation[] = [];
    let budget = Math.max(1000, maxChars);

    for (const file of files) {
      if (budget <= 0) break;
      const source = (file.extractedText ?? '').trim();
      if (!source) continue;

      const clipped = source.slice(0, budget);
      budget -= clipped.length;

      const ref = `[F${file.id.toString()}]`;
      sections.push(`${ref} ${file.fileName}\n${clipped}`);
      citations.push({
        type: 'file',
        fileId: file.id.toString(),
        fileName: file.fileName,
        extension: file.extension,
        snippet: clipped.slice(0, 260),
      });
    }

    if (sections.length === 0) {
      return { message: '', citations: [] as ChatCitation[] };
    }

    const message = [
      '以下是用户上传文件内容，请优先基于这些内容回答；如果资料不足请明确说明。',
      '文件内容开始：',
      ...sections,
      '文件内容结束。',
    ].join('\n\n');

    return { message, citations };
  }

  private buildRetrievalFileContext(
    files: ChatFile[],
    query: string,
    options: { topK: number; chunkSize: number; chunkOverlap: number; maxChars: number },
  ) {
    const queryTokens = this.tokenizeForSearch(query);
    const candidates: Array<{
      file: ChatFile;
      chunkIndex: number;
      text: string;
      score: number;
    }> = [];

    for (const file of files) {
      const chunks = this.chunkText(file.extractedText ?? '', options.chunkSize, options.chunkOverlap);
      chunks.forEach((chunk, idx) => {
        const score = this.scoreChunkByTokens(chunk, queryTokens);
        candidates.push({
          file,
          chunkIndex: idx + 1,
          text: chunk,
          score,
        });
      });
    }

    candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length);

    const selected: typeof candidates = [];
    let budget = Math.max(1000, options.maxChars);
    for (const item of candidates) {
      if (selected.length >= options.topK || budget <= 0) break;
      const chunk = item.text.slice(0, budget);
      if (!chunk.trim()) continue;
      selected.push({ ...item, text: chunk });
      budget -= chunk.length;
    }

    if (selected.length === 0) {
      return { message: '', citations: [] as ChatCitation[] };
    }

    const citations: ChatCitation[] = selected.map((item) => ({
      type: 'file',
      fileId: item.file.id.toString(),
      fileName: item.file.fileName,
      extension: item.file.extension,
      snippet: item.text.slice(0, 260),
      score: Number(item.score.toFixed(4)),
      chunkIndex: item.chunkIndex,
    }));

    const blocks = selected.map((item) => {
      const ref = `[F${item.file.id.toString()}-${item.chunkIndex}]`;
      return `${ref} ${item.file.fileName}\n${item.text}`;
    });

    const message = [
      '以下为基于用户问题召回的文件片段，请优先参考这些片段回答，并避免编造不存在的内容。',
      '召回片段开始：',
      ...blocks,
      '召回片段结束。',
    ].join('\n\n');

    return { message, citations };
  }

  private chunkText(text: string, chunkSize: number, overlap: number) {
    const source = (text ?? '').trim();
    if (!source) return [];

    const normalizedSize = Math.max(200, chunkSize);
    const normalizedOverlap = Math.max(0, Math.min(overlap, normalizedSize - 1));
    const step = Math.max(1, normalizedSize - normalizedOverlap);
    const chunks: string[] = [];

    for (let start = 0; start < source.length; start += step) {
      const chunk = source.slice(start, start + normalizedSize).trim();
      if (chunk) chunks.push(chunk);
      if (start + normalizedSize >= source.length) break;
    }

    return chunks;
  }

  private tokenizeForSearch(input: string) {
    return (input || '')
      .toLowerCase()
      .replace(/[^\\p{L}\\p{N}\\s]/gu, ' ')
      .split(/\\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
      .slice(0, 80);
  }

  private scoreChunkByTokens(chunk: string, queryTokens: string[]) {
    const source = chunk.toLowerCase();
    if (queryTokens.length === 0) {
      return Math.min(chunk.length / 3000, 1);
    }

    let hitCount = 0;
    let weighted = 0;
    for (const token of queryTokens) {
      if (!source.includes(token)) continue;
      hitCount += 1;
      weighted += Math.min(token.length, 12);
    }

    if (hitCount === 0) return 0;
    const coverage = hitCount / queryTokens.length;
    const depth = weighted / (queryTokens.length * 10);
    const lengthBonus = Math.min(chunk.length / 2000, 0.2);
    return coverage * 0.65 + depth * 0.35 + lengthBonus;
  }

  private truncateProjectContextText(value: string | null | undefined, maxLength: number) {
    const normalized = (value || '').trim().replace(/\n{3,}/g, '\n\n');
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  private buildProjectPromptActionSystemMessage(projectName?: string | null) {
    const projectLabel = this.truncateProjectContextText(projectName, 80) || '当前导入项目';

    return [
      `当前聊天已导入项目「${projectLabel}」。`,
      '如果用户明确表达了“新增 / 保存 / 沉淀 / 加入项目提示词”这一类意图，或者明确要求“修改 / 更新 / 重写 / 覆盖 / 替换 项目主提示词、统一风格提示词、风格锚点提示词”，你可以在正常回答结尾追加一个机器可解析的动作块。',
      '动作块格式必须严格如下，且只能追加一次；根据意图二选一：',
      '<project_prompt_action>{"action":"create_project_prompt","type":"image|video","title":"提示词标题","prompt":"完整提示词正文"}</project_prompt_action>',
      '<project_prompt_action>{"action":"upsert_project_master_image_prompt","prompt":"完整的项目统一风格主提示词"}</project_prompt_action>',
      '输出规则：',
      '1. 先正常回答，再单独输出动作块。',
      '2. 动作块必须是纯 JSON，不能放进 Markdown 代码块，不能附带额外解释。',
      '3. 只有在用户确实希望把某条提示词沉淀到项目里，或明确要求修改项目统一风格主提示词时，才输出动作块；普通问答不要输出。',
      `4. 如果用户要改的是当前项目的“主提示词 / 风格提示词 / 统一风格提示词”，优先输出 action="upsert_project_master_image_prompt"；不要再把它当成普通项目提示词新建一条。`,
      '5. 当 action=create_project_prompt 时，title 要简洁明确，prompt 要是可以直接保存复用的完整提示词。',
      `6. 当 action=upsert_project_master_image_prompt 时，prompt 必须是一条完整、专业、可复用的项目级图片统一风格主提示词，用来整体约束后续画风；它对应项目内标题为「${PROJECT_MASTER_IMAGE_PROMPT_TITLE}」的主提示词。`,
      '7. 如果项目已有描述、文档、灵感、分镜或项目提示词体现了既定视觉风格，新提示词必须严格继承同一风格，不要擅自切换画风、镜头语言、色彩体系或材质质感；只有用户明确要求换风格时，才重写主提示词。',
    ].join('\n\n');
  }

  private async buildConversationProjectContextSystemMessage(userId: bigint, projectId?: bigint | null) {
    if (!projectId) return '';

    const [project, documentFiles, assetKindCounts] = await Promise.all([
      this.prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
        },
        select: {
          id: true,
          name: true,
          concept: true,
          description: true,
          _count: {
            select: {
              assets: true,
              inspirations: true,
              prompts: true,
            },
          },
          assets: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: ChatService.PROJECT_CONTEXT_MAX_ASSET_ITEMS,
            select: {
              kind: true,
              title: true,
              description: true,
              sourcePrompt: true,
              fileName: true,
            },
          },
          inspirations: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: ChatService.PROJECT_CONTEXT_MAX_INSPIRATION_ITEMS,
            select: {
              title: true,
              episodeNumber: true,
              ideaText: true,
              contextText: true,
              plotText: true,
              generatedPrompt: true,
            },
          },
          prompts: {
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: ChatService.PROJECT_CONTEXT_MAX_PROMPT_ITEMS * 3,
            select: {
              type: true,
              title: true,
              prompt: true,
            },
          },
        },
      }),
      this.prisma.chatFile.findMany({
        where: {
          userId,
          status: 'ready',
          projectAsset: {
            projectId,
            kind: ProjectAssetKind.document,
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ChatService.PROJECT_CONTEXT_MAX_DOCUMENT_ITEMS,
        select: {
          fileName: true,
          extractedText: true,
          projectAsset: {
            select: {
              title: true,
            },
          },
        },
      }),
      this.prisma.projectAsset.groupBy({
        by: ['kind'],
        where: {
          userId,
          projectId,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    if (!project) return '';

    const masterImagePromptIndex = project.prompts.findIndex(
      (item) =>
        item.type === 'image' &&
        item.title.trim() === PROJECT_MASTER_IMAGE_PROMPT_TITLE &&
        item.prompt.trim().length > 0,
    );
    const prioritizedProjectPrompts =
      masterImagePromptIndex >= 0
        ? [
            project.prompts[masterImagePromptIndex],
            ...project.prompts.filter((_, index) => index !== masterImagePromptIndex),
          ]
        : [...project.prompts];
    const projectPromptItems = prioritizedProjectPrompts.slice(
      0,
      ChatService.PROJECT_CONTEXT_MAX_PROMPT_ITEMS,
    );

    const countByKind = assetKindCounts.reduce(
      (acc, item) => {
        acc[item.kind] = item._count._all;
        return acc;
      },
      {
        [ProjectAssetKind.image]: 0,
        [ProjectAssetKind.video]: 0,
        [ProjectAssetKind.document]: 0,
      } as Record<string, number>,
    );

    let assetBudget = 4200;
    const assetSection = project.assets
      .map((asset, index) => {
        if (assetBudget <= 0) return '';

        const kindLabel =
          asset.kind === ProjectAssetKind.image
            ? '图片'
            : asset.kind === ProjectAssetKind.video
              ? '视频'
              : '文档';
        const lines = [
          `[素材${index + 1}] ${kindLabel}｜${this.truncateProjectContextText(asset.title, 120) || '未命名素材'}`,
          asset.fileName ? `文件名：${this.truncateProjectContextText(asset.fileName, 120)}` : null,
          asset.description ? `描述：${this.truncateProjectContextText(asset.description, 320)}` : null,
          asset.sourcePrompt ? `来源提示词：${this.truncateProjectContextText(asset.sourcePrompt, 520)}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        if (!lines) return '';
        assetBudget -= lines.length;
        return lines;
      })
      .filter((item) => item.length > 0)
      .join('\n\n');

    let documentBudget = 5200;
    const documentSection = documentFiles
      .map((item, index) => {
        if (documentBudget <= 0) return '';
        const excerpt = this.truncateProjectContextText(item.extractedText, Math.min(1400, documentBudget));
        if (!excerpt) return '';
        documentBudget -= excerpt.length;
        return [
          `[文档${index + 1}] ${
            this.truncateProjectContextText(item.projectAsset?.title || item.fileName, 120) || '未命名文档'
          }`,
          excerpt,
        ].join('\n');
      })
      .filter((item) => item.length > 0)
      .join('\n\n');

    let inspirationBudget = 4200;
    const inspirationSection = project.inspirations
      .map((item, index) => {
        if (inspirationBudget <= 0) return '';
        const episodeLabel = item.episodeNumber ? `第${item.episodeNumber}集` : `灵感${index + 1}`;
        const lines = [
          `[${episodeLabel}] ${this.truncateProjectContextText(item.title, 120) || '未命名灵感'}`,
          item.ideaText ? `核心想法：${this.truncateProjectContextText(item.ideaText, 700)}` : null,
          item.contextText ? `上下文：${this.truncateProjectContextText(item.contextText, 520)}` : null,
          item.plotText ? `剧情：${this.truncateProjectContextText(item.plotText, 620)}` : null,
          item.generatedPrompt
            ? `已生成分镜提示词：${this.truncateProjectContextText(item.generatedPrompt, 900)}`
            : null,
        ]
          .filter(Boolean)
          .join('\n');

        if (!lines) return '';
        inspirationBudget -= lines.length;
        return lines;
      })
      .filter((item) => item.length > 0)
      .join('\n\n');

    let promptBudget = 3600;
    const promptSection = projectPromptItems
      .map((item, index) => {
        if (promptBudget <= 0) return '';
        const isMasterImagePrompt =
          item.type === 'image' && item.title.trim() === PROJECT_MASTER_IMAGE_PROMPT_TITLE;
        const typeLabel = isMasterImagePrompt
          ? '图片提示词｜项目统一风格主提示词'
          : item.type === 'video'
            ? '视频提示词'
            : '图片提示词';
        const lines = [
          `[项目提示词${index + 1}] ${typeLabel}｜${this.truncateProjectContextText(item.title, 120) || '未命名提示词'}`,
          this.truncateProjectContextText(item.prompt, Math.min(900, promptBudget)),
        ]
          .filter(Boolean)
          .join('\n');

        if (!lines) return '';
        promptBudget -= lines.length;
        return lines;
      })
      .filter((item) => item.length > 0)
      .join('\n\n');

    return [
      '以下是当前聊天已导入的项目上下文。请把它视为本轮对话持续生效的背景资料，并在理解需求、生成描述、生成分镜提示词、生成图片提示词、生成视频提示词时主动参考。',
      '不要声称你看到了项目中的具体图片或视频画面，因为你现在拿到的是项目的文字资料、素材元数据、文档解析文本、灵感、分镜和已有提示词，而不是素材像素内容。',
      `项目名称：${this.truncateProjectContextText(project.name, 120)}`,
      project.concept ? `项目主题 / 灵感：${this.truncateProjectContextText(project.concept, 1600)}` : null,
      project.description ? `项目描述：${this.truncateProjectContextText(project.description, 2400)}` : null,
      `项目概览：共 ${project._count.assets} 个素材（图片 ${countByKind[ProjectAssetKind.image]}、视频 ${countByKind[ProjectAssetKind.video]}、文档 ${countByKind[ProjectAssetKind.document]}），${project._count.inspirations} 条灵感，${project._count.prompts} 条项目提示词。`,
      assetSection ? `项目素材信息：\n${assetSection}` : null,
      documentSection ? `项目文档解析内容：\n${documentSection}` : null,
      inspirationSection ? `项目灵感与分镜信息：\n${inspirationSection}` : null,
      promptSection ? `项目已有提示词：\n${promptSection}` : null,
      '使用要求：',
      '1. 优先继承项目里已经确立的人物设定、世界观规则、叙事方向、镜头逻辑和视觉风格。',
      `2. 如果项目已有标题为「${PROJECT_MASTER_IMAGE_PROMPT_TITLE}」的图片提示词，把它视为当前项目后续所有单图生成的最高优先级风格锚点；除非用户明确要求改风格，否则不要偏离它。`,
      '3. 如果用户让你生成新的项目描述、分镜提示词、图片提示词或视频提示词，必须主动吸收项目文档、灵感、已有提示词和素材说明中的关键信息。',
      '4. 同一个项目里的所有图片提示词都应保持严格一致的风格锚点；除非用户明确要求改风格，否则不要擅自改变画风、镜头语言、色彩体系、光影策略或材质质感。',
    ]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join('\n\n');
  }

  private injectSystemContextIntoUpstream(
    messages: UpstreamMessage[],
    ...contexts: Array<string | null | undefined>
  ) {
    const mergedContext = contexts
      .map((item) => (item || '').trim())
      .filter((item) => item.length > 0)
      .join('\n\n');
    if (!mergedContext) return messages;

    const injected: UpstreamMessage = {
      role: 'system',
      content: mergedContext,
    };

    const firstMessage = messages[0];
    if (firstMessage?.role === 'system') {
      const firstContent = this.normalizeUpstreamContent(firstMessage.content).trim();
      const mergedSystemMessage: UpstreamMessage = {
        role: 'system',
        content: [firstContent, mergedContext].filter((item) => item.length > 0).join('\n\n'),
      };
      return [
        mergedSystemMessage,
        ...messages.slice(1),
      ];
    }

    return [injected, ...messages];
  }

  private normalizeMediaAgentContext(
    raw?: SendMessageDto['mediaAgent'] | SendMessageDto['imageAgent'],
  ): MediaAgentContext | null {
    if (!raw?.enabled) return null;

    const source = raw as unknown as Record<string, unknown>;
    const modelIdCandidate =
      (typeof source.modelId === 'string' ? source.modelId : '') ||
      (typeof source.imageModelId === 'string' ? source.imageModelId : '');
    const modelId = modelIdCandidate.trim();
    if (!modelId) {
      throw new BadRequestException('mediaAgent.modelId is required');
    }

    const preferredAspectRatio =
      typeof source.preferredAspectRatio === 'string' && source.preferredAspectRatio.trim()
        ? source.preferredAspectRatio.trim().slice(0, 40)
        : null;
    const preferredResolution =
      typeof source.preferredResolution === 'string' && source.preferredResolution.trim()
        ? source.preferredResolution.trim().slice(0, 40)
        : null;
    const preferredDuration =
      typeof source.preferredDuration === 'string' && source.preferredDuration.trim()
        ? source.preferredDuration.trim().slice(0, 40)
        : null;

    return {
      enabled: true,
      modelId,
      preferredAspectRatio,
      preferredResolution,
      preferredDuration,
      referenceImages: this.normalizeImages(Array.isArray(source.referenceImages) ? (source.referenceImages as string[]) : [], 20),
      referenceVideos: this.normalizeStringList(source.referenceVideos, 10),
      referenceAudios: this.normalizeStringList(source.referenceAudios, 10),
      autoCreate: source.autoCreate === true,
    };
  }

  private supportsMediaAgentImageModel(
    model: AiModel,
    capabilities: ReturnType<typeof buildModelCapabilities>,
  ) {
    return model.type === AiModelType.image && capabilities.supports.contextualEdit;
  }

  private supportsMediaAgentVideoModel(
    model: AiModel,
    capabilities: ReturnType<typeof buildModelCapabilities>,
  ) {
    return model.type === AiModelType.video && capabilities.supports.contextualEdit;
  }

  private isWanxR2vVideoModel(model: {
    provider: string;
    modelKey?: string | null;
  }) {
    const providerKey = normalizeProviderKey(model.provider);
    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    return (
      (providerKey.includes('wanx') || providerKey.includes('wanxiang'))
      && (remoteModel.includes('wan2.7') || remoteModel.includes('happyhorse-1.0'))
      && remoteModel.includes('-r2v')
    );
  }

  private isWanxImageOnlyR2vVideoModel(model: {
    provider: string;
    modelKey?: string | null;
  }) {
    const providerKey = normalizeProviderKey(model.provider);
    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    return (
      (providerKey.includes('wanx') || providerKey.includes('wanxiang'))
      && remoteModel.includes('happyhorse-1.0')
      && remoteModel.includes('-r2v')
    );
  }

  private buildWanxSiblingModelKey(
    model: { modelKey?: string | null },
    targetKind: 'i2v' | 't2v' | 'r2v',
  ) {
    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    if (!/-r2v$/i.test(remoteModel)) return null;
    return remoteModel.replace(/-r2v$/i, `-${targetKind}`);
  }

  private async requireWanxSiblingVideoModel(
    model: AiModel,
    targetKind: 'i2v' | 't2v' | 'r2v',
  ) {
    const siblingModelKey = this.buildWanxSiblingModelKey(model, targetKind);
    if (!siblingModelKey) {
      throw new BadRequestException('Wanx sibling video model is not available for the selected model');
    }

    const siblingModel = await this.prisma.aiModel.findFirst({
      where: {
        type: AiModelType.video,
        isActive: true,
        provider: model.provider,
        modelKey: siblingModelKey,
      },
    }) ?? await this.prisma.aiModel.findFirst({
      where: {
        type: AiModelType.video,
        isActive: true,
        modelKey: siblingModelKey,
      },
    });
    if (!siblingModel) {
      throw new BadRequestException(`Wanx sibling video model ${siblingModelKey} is not configured or inactive`);
    }

    return siblingModel;
  }

  private stripWanxReferenceParameters(parameters: Record<string, unknown>) {
    [
      'firstFrame',
      'first_frame',
      'lastFrame',
      'last_frame',
      'firstClip',
      'first_clip',
      'drivingAudio',
      'driving_audio',
      'audioUrl',
      'audio_url',
      'referenceImages',
      'reference_images',
      'referenceVideos',
      'reference_videos',
      'referenceAudios',
      'reference_audios',
    ].forEach((key) => {
      delete parameters[key];
    });
  }

  private buildWanxR2vContextVideoParameters(input: {
    currentImages: string[];
    currentVideos: string[];
    currentAudios: string[];
    firstFrameImage?: string | null;
    imageOnlyReferences?: boolean;
  }) {
    const parameters: Record<string, unknown> = {};
    const firstFrame = input.firstFrameImage?.trim() || null;
    const imageOnlyReferences = input.imageOnlyReferences === true;
    const totalVisualBudget = imageOnlyReferences ? 5 : Math.max(0, 5 - (firstFrame ? 1 : 0));

    let referenceImages = input.currentImages
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
    let referenceVideos = input.currentVideos
      .map((item) => item.trim())
      .filter((item) => Boolean(item));

    if (imageOnlyReferences) {
      referenceVideos = [];
    }

    if (referenceImages.length === 0 && referenceVideos.length === 0 && firstFrame) {
      referenceImages = [firstFrame];
    }

    const cappedVideos = referenceVideos.slice(0, totalVisualBudget);
    const remainingVisualBudget = Math.max(0, totalVisualBudget - cappedVideos.length);
    const cappedImages = referenceImages.slice(0, remainingVisualBudget);
    const visualCount = cappedImages.length + cappedVideos.length;
    const cappedAudios = input.currentAudios
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, visualCount);

    if (firstFrame && !imageOnlyReferences) {
      parameters.firstFrame = firstFrame;
    }
    if (cappedImages.length > 0) {
      parameters.referenceImages = cappedImages;
    }
    if (cappedVideos.length > 0 && !imageOnlyReferences) {
      parameters.referenceVideos = cappedVideos;
    }
    if (cappedAudios.length > 0 && !imageOnlyReferences) {
      parameters.referenceAudios = cappedAudios;
    }

    return parameters;
  }

  private resolveConversationComposerMode(input: {
    mediaAgent: MediaAgentContext | null;
    autoProjectAgent: ReturnType<typeof parseAutoProjectAgentContext>;
  }): ConversationComposerMode {
    if (input.autoProjectAgent?.enabled) return 'auto';
    if (input.mediaAgent?.enabled) return 'image';
    return 'chat';
  }

  private async assertConversationComposerMode(input: {
    conversationId: bigint;
    requestedMode: ConversationComposerMode;
  }) {
    const lockedMode = await this.resolveConversationComposerModeLock(input.conversationId);
    if (!lockedMode || lockedMode === input.requestedMode) {
      return;
    }

    const modeLabel =
      lockedMode === 'auto'
        ? 'Auto Mode'
        : lockedMode === 'image'
          ? 'Agent Mode'
          : 'Chat Mode';
    throw new BadRequestException(`This conversation is locked to ${modeLabel}`);
  }

  private async resolveConversationComposerModeLock(
    conversationId: bigint,
  ): Promise<ConversationComposerMode | null> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { composerMode: true },
    });
    const persistedMode = this.normalizeConversationComposerMode(conversation?.composerMode);
    if (persistedMode) {
      return persistedMode;
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        providerData: true,
      },
    });

    const resolvedMode = this.resolveComposerModeLockFromMessages(messages);
    if (resolvedMode) {
      await this.prisma.chatConversation.updateMany({
        where: {
          id: conversationId,
          composerMode: null,
        },
        data: {
          composerMode: resolvedMode,
        },
      });
    }

    return resolvedMode;
  }

  private resolveComposerModeLockFromMessages(
    messages: Array<{ providerData: unknown }>,
  ): ConversationComposerMode | null {
    if (messages.length === 0) {
      return null;
    }

    for (const message of messages) {
      if (extractAutoProjectAgentFromProviderData(message.providerData ?? null)) {
        return 'auto';
      }
      if (this.extractMediaAgentFromProviderData(message.providerData ?? null)) {
        return 'image';
      }
    }

    return 'chat';
  }

  private normalizeConversationComposerMode(
    value: string | null | undefined,
  ): ConversationComposerMode | null {
    if (value === 'chat' || value === 'image' || value === 'auto') {
      return value;
    }
    return null;
  }

  private buildMediaAgentSystemPrompt(input: {
    targetModel: AiModel;
    preferredAspectRatio: string | null;
    preferredResolution: string | null;
    preferredDuration: string | null;
    referenceImageCount: number;
    referenceVideoCount: number;
    referenceAudioCount: number;
    autoCreate: boolean;
    hasConversationGeneratedMedia: boolean;
  }) {
    const mediaLabel = input.targetModel.type === AiModelType.video ? 'video' : 'image';
    const isVideoTarget = input.targetModel.type === AiModelType.video;
    const submissionHint = input.autoCreate
      ? `- When the request is specific enough, mark the result as ready so the system can create the ${mediaLabel} task immediately after your response.`
      : input.hasConversationGeneratedMedia
        ? `- Default behavior: when the request is specific enough, mark the result as ready, show the polished prompt, and explicitly ask the user to confirm before any ${mediaLabel} task is submitted. Exception: if the user is clearly asking to revise or edit an earlier generated ${mediaLabel} result in this conversation and the request is already specific enough, mark the result as ready so the system can submit the edit task immediately. In that edit case, do not ask for confirmation.`
        : `- When the request is specific enough, mark the result as ready, show the polished prompt, and explicitly ask the user to confirm before any ${mediaLabel} task is submitted.`;
    const aspectRatioHint = input.preferredAspectRatio
      ? `- Manual aspect ratio is already locked to "${input.preferredAspectRatio}". Respect it unless the user explicitly wants to change it.`
      : `- No manual aspect ratio is locked. Only ask about framing if it materially changes the ${mediaLabel}.`;
    const resolutionHint = input.preferredResolution
      ? `- Manual resolution/size is already locked to "${input.preferredResolution}".`
      : '- No manual resolution/size is locked.';
    const durationHint =
      input.targetModel.type === AiModelType.video
        ? input.preferredDuration
          ? `- Manual duration is already locked to "${input.preferredDuration}".`
          : '- No manual duration is locked.'
        : '- Duration is not relevant unless the user is generating video.';
    const referenceHints = [
      input.referenceImageCount > 0
        ? `- ${input.referenceImageCount} reference image(s) are attached.`
        : '- No reference images are attached right now.',
      input.referenceVideoCount > 0
        ? `- ${input.referenceVideoCount} reference video(s) are attached.`
        : '- No reference videos are attached right now.',
      input.referenceAudioCount > 0
        ? `- ${input.referenceAudioCount} reference audio file(s) are attached.`
        : '- No reference audio files are attached right now.',
      input.hasConversationGeneratedMedia
        ? `- Earlier generated ${mediaLabel} results exist in this conversation and can be reused when the user clearly wants an edit or revision.`
        : `- There is no earlier generated ${mediaLabel} result available for reuse right now.`,
    ];
    const mediaQualityHints = isVideoTarget
      ? [
          '- For video prompts, act like a prompt director: produce an engineered, production-ready video prompt rather than a loose pile of adjectives.',
          '- The final optimizedPrompt must be direct model-ready prompt text only. Do not include explanation, checklist, JSON fragments, or meta commentary inside optimizedPrompt.',
          '- The final optimizedPrompt does not need a fixed heading template, but the content itself must clearly cover these dimensions when relevant: shot setup (shot size, camera position, one dominant camera move, total duration), narrative goal (who the subject is, what action happens, what emotion is maintained), timeline execution split into exactly 3 beats (opening entry, middle main action, ending resolution), dialogue handling (lip-sync and pause-sync when there is dialogue; breathing, gaze, and body language when there is no dialogue), ending transition pose for the next shot, consistency constraints, style supplements, and quality constraints.',
          '- Make the shot setup explicit inside the prompt: shot size, camera position, one dominant camera movement, and the total duration or duration intent.',
          '- Make the narrative goal explicit: who the subject is, what the main action is, and what emotion should stay consistent through the shot.',
          '- Even without fixed headings, write the temporal execution in exactly 3 beats: opening entry, middle main action, ending resolution.',
          '- If there is dialogue, explicitly require lip-sync and pause-sync. If there is no dialogue, explicitly require emotion to be carried by breathing, gaze, and body language.',
          '- Require the ending to land in a pose or state that can naturally connect into the next shot.',
          '- If reference images are attached, explicitly require clothing, scene, and props to remain stable and not drift.',
          '- Preserve and fold the style words and the base action description into the final prompt instead of dropping them.',
          '- Explicitly stress coherent motion, physical plausibility, and avoiding frame skipping or deformation.',
          '- If reference images, reference videos, or reference audio are attached, use them semantically to preserve identity, appearance, motion, rhythm, framing, or atmosphere. Do not invent numbered labels, fake placeholders, filenames, or any system-internal identifiers inside optimizedPrompt.',
          '- If the user is editing or revising an existing result, preserve subject identity, motion direction, framing logic, and scene continuity unless the user explicitly asks to change them.',
          '- Keep one dominant camera movement per shot or beat. Remove conflicting instructions such as push-in plus pan-left plus pull-back unless one clear movement remains.',
          '- You may express temporal progression naturally with phrases like "开场", "中段", and "结尾". A rigid title format is optional, but the 3-beat execution logic is required. If manual duration is already locked, use that duration as the basis of the 3-beat plan.',
          '- For multi-character, frontal, or high-motion scenes, add strong spatial anchors, clothing or identity anchors, and simpler camera language to reduce face drift, body glitches, and role swapping.',
          '- End video optimizedPrompt with high-quality and anti-collapse constraints such as 4K高清、细节丰富、人物面部稳定、五官清晰、肢体自然、无变形、无穿模、动作连贯、物理合理、避免跳帧、镜头稳定衔接.',
        ]
      : [
          '- For image prompts, make composition, subject, style, and lighting explicit when helpful.',
        ];

    return [
      `You are an AI ${mediaLabel} creation agent working inside a chat product.`,
      `The target ${mediaLabel} model for the final generation is "${input.targetModel.name}" (provider: ${input.targetModel.provider}).`,
      aspectRatioHint,
      resolutionHint,
      durationHint,
      ...referenceHints,
      submissionHint,
      `- Your job is to help the user reach a production-ready ${mediaLabel} prompt, not to answer broadly unrelated questions.`,
      '- If the request is still underspecified, ask only the next most valuable question. Keep it concise, concrete, and helpful.',
      '- Choose intent="edit" only when the user is clearly trying to revise an existing result or use current reference media as the editing context.',
      '- Choose intent="generate" when the user wants a fresh new result or a clear restart.',
      ...mediaQualityHints,
      '- Suggested quick replies must be short, clickable, and mutually distinct.',
      '- The fields "optimizedPrompt" and "negativePrompt" must always be written in Simplified Chinese, regardless of the user language.',
      '- The user-facing "reply" and "suggestedReplies" can follow the user language, but the actual generation prompt must stay in Simplified Chinese.',
      '- Return ONLY valid JSON. Do not use markdown fences. Do not add any text outside the JSON object.',
      'Use exactly this JSON schema:',
      '{"reply":"string","status":"clarify|ready","intent":"edit|generate","optimizedPrompt":"string|null","negativePrompt":"string|null","suggestedReplies":["string"]}',
      '- reply: user-visible assistant reply.',
      '- status: "clarify" if you still need one more round, "ready" if the system can generate now.',
      '- intent: "edit" when the generation should reuse an existing result/reference context, otherwise "generate".',
      '- optimizedPrompt: final polished prompt only when status is "ready"; otherwise null.',
      '- negativePrompt: optional negative prompt for image generation; otherwise null.',
      '- suggestedReplies: 0 to 4 short suggestions. When clarifying, prefer 2 to 4. When ready, use them only for revisions or confirmation shortcuts if truly helpful.',
    ].join('\n');
  }

  private parseMediaAgentResponse(rawContent: string): ParsedMediaAgentResponse {
    const raw = (rawContent || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || raw;
    const parsed = this.tryParseJson(candidate);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        reply: raw || 'I need one more detail before I generate the media.',
        status: 'clarify',
        intent: 'generate',
        optimizedPrompt: null,
        negativePrompt: null,
        suggestedReplies: [],
      };
    }

    const source = parsed as Record<string, unknown>;
    const replyCandidate = this.normalizeUpstreamContent(
      source.reply ?? source.message ?? source.assistantReply,
    ).trim();
    const statusRaw = this.normalizeUpstreamContent(source.status ?? source.stage).trim().toLowerCase();
    const intentRaw = this.normalizeUpstreamContent(source.intent ?? source.generationIntent).trim().toLowerCase();
    const optimizedPrompt = this.normalizeUpstreamContent(
      source.optimizedPrompt ?? source.prompt ?? source.finalPrompt,
    ).trim();
    const negativePrompt = this.normalizeUpstreamContent(source.negativePrompt).trim();
    const suggestedReplies = Array.isArray(source.suggestedReplies)
      ? source.suggestedReplies
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0)
          .slice(0, 4)
      : [];

    const normalizedStatus: MediaAgentStatus =
      statusRaw === 'ready' && optimizedPrompt
        ? 'ready'
        : 'clarify';

    return {
      reply:
        replyCandidate ||
        (normalizedStatus === 'ready'
          ? 'I have enough detail and the media can be generated now.'
          : 'I need one more detail before I generate the media.'),
      status: normalizedStatus,
      intent: intentRaw === 'edit' ? 'edit' : 'generate',
      optimizedPrompt: normalizedStatus === 'ready' ? optimizedPrompt : null,
      negativePrompt: negativePrompt || null,
      suggestedReplies,
    };
  }

  private isLikelyChineseText(value: string) {
    return /[\u4e00-\u9fff]/.test(value);
  }

  private needsChinesePromptRewrite(value: string | null | undefined) {
    const normalized = (value ?? '').trim();
    if (!normalized) return false;
    return !this.isLikelyChineseText(normalized);
  }

  private async rewriteCreativePromptPairToChinese(params: {
    conversation: {
      model: {
        modelKey: string;
        defaultParams: Prisma.JsonValue | null;
        channel: {
          baseUrl: string;
          apiKey: string | null;
          extraHeaders: Prisma.JsonValue | null;
          timeout: number;
        };
      };
    };
    kind: 'image' | 'video';
    prompt: string;
    negativePrompt?: string | null;
  }) {
    const prompt = params.prompt.trim();
    const negativePrompt = (params.negativePrompt ?? '').trim() || null;

    if (!this.needsChinesePromptRewrite(prompt) && !this.needsChinesePromptRewrite(negativePrompt)) {
      return {
        prompt,
        negativePrompt,
      };
    }

    try {
      const completion = await this.requestChatCompletion(params.conversation, [
        {
          role: 'system',
          content: [
            'You are a localization editor for AI image and video generation prompts.',
            'Rewrite the provided prompt content into polished Simplified Chinese for direct model generation.',
            'Keep the original creative intent, subject, composition, style, lighting, motion, camera language, pacing, aspect ratios, durations, resolutions, and technical constraints unchanged.',
            'Preserve product names, brand names, model names, IDs, file names, URLs, and special tokens exactly when needed.',
            'negativePrompt must also be Simplified Chinese when present.',
            'Return ONLY valid JSON without markdown fences.',
            'Use exactly this JSON schema:',
            '{"prompt":"string","negativePrompt":"string|null"}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            kind: params.kind,
            prompt,
            negativePrompt,
          }),
        },
      ]);

      const raw = completion.content.trim();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenced?.[1]?.trim() || raw;
      const parsed = this.tryParseJson(candidate);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { prompt, negativePrompt };
      }

      const source = parsed as Record<string, unknown>;
      const rewrittenPrompt = this.normalizeUpstreamContent(source.prompt).trim() || prompt;
      const rewrittenNegativePrompt =
        this.normalizeUpstreamContent(source.negativePrompt).trim() || negativePrompt;

      return {
        prompt: rewrittenPrompt,
        negativePrompt: rewrittenNegativePrompt || null,
      };
    } catch {
      return {
        prompt,
        negativePrompt,
      };
    }
  }

  private toChatImageTaskRef(task: {
    id: string;
    taskNo: string;
    status: string;
    modelId: string;
    provider: string;
    prompt: string;
    thumbnailUrl: string | null;
    resultUrl: string | null;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): ChatTaskRef {
    return {
      kind: 'image',
      taskId: task.id,
      taskNo: task.taskNo,
      status: task.status,
      modelId: task.modelId,
      provider: task.provider,
      prompt: task.prompt,
      thumbnailUrl: task.thumbnailUrl,
      resultUrl: task.resultUrl,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    };
  }

  private toChatVideoTaskRef(task: {
    id: string;
    taskNo: string;
    status: string;
    modelId: string;
    provider: string;
    prompt: string;
    thumbnailUrl: string | null;
    resultUrl: string | null;
    errorMessage: string | null;
    createdAt: Date;
    completedAt: Date | null;
    canCancel?: boolean;
    cancelSupported?: boolean;
  }, metadata?: {
    shotId?: string | null;
    finalStoryboard?: boolean;
  }): ChatTaskRef {
    const taskRef: ChatTaskRef = {
      kind: 'video',
      taskId: task.id,
      taskNo: task.taskNo,
      status: task.status,
      modelId: task.modelId,
      provider: task.provider,
      prompt: task.prompt,
      thumbnailUrl: task.thumbnailUrl,
      resultUrl: task.resultUrl,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      ...(typeof task.canCancel === 'boolean' ? { canCancel: task.canCancel } : {}),
      ...(typeof task.cancelSupported === 'boolean' ? { cancelSupported: task.cancelSupported } : {}),
    };

    if (metadata?.shotId) {
      taskRef.shotId = metadata.shotId;
    }
    if (metadata?.finalStoryboard === true) {
      taskRef.finalStoryboard = true;
    }

    return taskRef;
  }

  private async completeMediaAgentTurn(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: {
      projectContext?: {
        id: bigint;
      } | null;
      model: {
        id: bigint;
        name: string;
        provider: string;
        modelKey: string;
        defaultParams: Prisma.JsonValue | null;
        supportsImageInput: boolean | null;
        channel: {
          baseUrl: string;
          apiKey: string | null;
          extraHeaders: Prisma.JsonValue | null;
          timeout: number;
        };
        systemPrompt: string | null;
      };
    };
    recentMessages: Array<{
      role: string;
      content: string;
      images: unknown;
      files?: unknown;
    }>;
    mediaAgent: MediaAgentContext;
    sourceUserMessageId: string;
  }) {
    const latestUserInput =
      [...params.recentMessages]
        .reverse()
        .find((message) => message.role === ChatMessageRole.user)
        ?.content
        ?.trim() || '';
    const preferChinese = this.isLikelyChineseText(latestUserInput);
    const targetModelId = this.parseBigInt(params.mediaAgent.modelId, 'mediaAgent.modelId');
    const targetModel = await this.prisma.aiModel.findFirst({
      where: {
        id: targetModelId,
        type: { in: [AiModelType.image, AiModelType.video] },
        isActive: true,
      },
    });
    if (!targetModel) {
      throw new BadRequestException('Target media model not found or inactive');
    }

    const targetCapabilities = buildModelCapabilities(targetModel as AiModel, null);
    const supportsMediaAgent =
      targetModel.type === AiModelType.image
        ? this.supportsMediaAgentImageModel(targetModel, targetCapabilities)
        : this.supportsMediaAgentVideoModel(targetModel, targetCapabilities);

    if (!supportsMediaAgent) {
      throw new BadRequestException('Selected model does not support contextual editing in chat');
    }

    const existingGeneratedMedia = await this.collectConversationGeneratedMediaAssets({
      userId: params.userId,
      conversationId: params.conversationId,
      kind: targetModel.type === AiModelType.video ? 'video' : 'image',
      limit: 1,
    });
    const projectContextSystemMessage = await this.buildConversationProjectContextSystemMessage(
      params.userId,
      params.conversation.projectContext?.id ?? null,
    );

    const upstreamMessages = await this.toUpstreamMessages(params.recentMessages, {
      includeImages: Boolean(params.conversation.model.supportsImageInput),
    });
    const completion = await this.requestChatCompletion(
      params.conversation,
      this.injectSystemContextIntoUpstream(
        upstreamMessages,
        params.conversation.model.systemPrompt,
        projectContextSystemMessage,
        this.buildMediaAgentSystemPrompt({
          targetModel,
          preferredAspectRatio: params.mediaAgent.preferredAspectRatio ?? null,
          preferredResolution: params.mediaAgent.preferredResolution ?? null,
          preferredDuration: params.mediaAgent.preferredDuration ?? null,
          referenceImageCount: params.mediaAgent.referenceImages.length,
          referenceVideoCount: params.mediaAgent.referenceVideos.length,
          referenceAudioCount: params.mediaAgent.referenceAudios.length,
          autoCreate: params.mediaAgent.autoCreate,
          hasConversationGeneratedMedia: existingGeneratedMedia.length > 0,
        }),
      ),
    );

    const parsed = this.parseMediaAgentResponse(completion.content);
    const localizedPromptPair =
      parsed.optimizedPrompt || parsed.negativePrompt
        ? await this.rewriteCreativePromptPairToChinese({
            conversation: params.conversation,
            kind: targetModel.type === AiModelType.video ? 'video' : 'image',
            prompt: parsed.optimizedPrompt ?? '',
            negativePrompt: parsed.negativePrompt ?? null,
          })
        : null;
    const finalOptimizedPrompt = localizedPromptPair?.prompt || parsed.optimizedPrompt;
    const finalNegativePrompt =
      targetModel.type === AiModelType.image
        ? localizedPromptPair?.negativePrompt ?? parsed.negativePrompt
        : null;
    const autoCreateFromConversationEdit =
      parsed.status === 'ready' &&
      parsed.intent === 'edit' &&
      existingGeneratedMedia.length > 0 &&
      !params.mediaAgent.autoCreate;
    const providerData: Record<string, unknown> = this.asJsonRecord(completion.providerData);

    let taskRefs: ChatTaskRef[] = [];
    let autoCreated = false;

    if (
      parsed.status === 'ready' &&
      finalOptimizedPrompt &&
      (params.mediaAgent.autoCreate || autoCreateFromConversationEdit)
    ) {
      if (targetModel.type === AiModelType.image) {
        const { createdTask } = await this.generateConversationImageTask({
          userId: params.userId,
          conversationId: params.conversationId,
          imageModelIdRaw: params.mediaAgent.modelId,
          projectId: params.conversation.projectContext?.id ?? null,
          prompt: finalOptimizedPrompt,
          negativePrompt: finalNegativePrompt ?? undefined,
          currentImages: params.mediaAgent.referenceImages,
          useConversationContextEdit: parsed.intent === 'edit',
          preferredAspectRatio: params.mediaAgent.preferredAspectRatio ?? null,
          preferredResolution: params.mediaAgent.preferredResolution ?? null,
        });
        taskRefs = [this.toChatImageTaskRef(createdTask)];
      } else {
        const { createdTask } = await this.generateConversationVideoTask({
          userId: params.userId,
          conversationId: params.conversationId,
          videoModelIdRaw: params.mediaAgent.modelId,
          projectId: params.conversation.projectContext?.id ?? null,
          prompt: finalOptimizedPrompt,
          currentImages: params.mediaAgent.referenceImages,
          currentVideos: params.mediaAgent.referenceVideos,
          currentAudios: params.mediaAgent.referenceAudios,
          useConversationContextEdit: parsed.intent === 'edit',
          preferredAspectRatio: params.mediaAgent.preferredAspectRatio ?? null,
          preferredResolution: params.mediaAgent.preferredResolution ?? null,
          preferredDuration: params.mediaAgent.preferredDuration ?? null,
        });
        taskRefs = [this.toChatVideoTaskRef(createdTask)];
      }
      autoCreated = taskRefs.length > 0;
    }

    const mediaAgentMetadata: MediaAgentMetadata = {
      status: parsed.status,
      intent: parsed.intent,
      optimizedPrompt: finalOptimizedPrompt,
      negativePrompt: finalNegativePrompt,
      suggestedReplies: parsed.suggestedReplies,
      sourceUserMessageId: params.sourceUserMessageId,
      modelId: params.mediaAgent.modelId,
      modelName: targetModel.name,
      modelType: targetModel.type === AiModelType.video ? 'video' : 'image',
      preferredAspectRatio: params.mediaAgent.preferredAspectRatio ?? null,
      preferredResolution: params.mediaAgent.preferredResolution ?? null,
      preferredDuration: params.mediaAgent.preferredDuration ?? null,
      referenceVideos: params.mediaAgent.referenceVideos,
      referenceAudios: params.mediaAgent.referenceAudios,
      referenceImageCount: params.mediaAgent.referenceImages.length,
      referenceVideoCount: params.mediaAgent.referenceVideos.length,
      referenceAudioCount: params.mediaAgent.referenceAudios.length,
      autoCreated,
    };

    providerData.mediaAgent = mediaAgentMetadata;
    if (taskRefs.length > 0) {
      providerData.taskRefs = taskRefs;
    }

    const autoCreatedConversationEditReply =
      targetModel.type === AiModelType.video
        ? preferChinese
          ? '已根据上一版结果直接提交视频编辑任务，我会沿用已有生成结果作为编辑上下文。'
          : 'I submitted the video edit task directly using the previous result as editing context.'
        : preferChinese
          ? '已根据上一版结果直接提交图片编辑任务，我会沿用已有生成结果作为编辑上下文。'
          : 'I submitted the image edit task directly using the previous result as editing context.';

    return {
      content: autoCreateFromConversationEdit && autoCreated
        ? autoCreatedConversationEditReply
        : parsed.reply,
      providerData,
    };
  }

  private async collectConversationGeneratedMediaAssets(params: {
    userId: bigint;
    conversationId: bigint;
    kind: 'image' | 'video';
    limit: number;
  }) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: params.conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        providerData: true,
      },
    });

    const orderedTaskIds: string[] = [];
    const fallbackMap = new Map<string, { resultUrl: string | null; thumbnailUrl: string | null }>();
    const numericTaskIds: bigint[] = [];
    const seen = new Set<string>();

    for (const message of messages) {
      const taskRefs = this.extractTaskRefsFromProviderData(message.providerData ?? null);
      for (const taskRef of taskRefs) {
        if (taskRef.kind !== params.kind || seen.has(taskRef.taskId)) continue;
        seen.add(taskRef.taskId);
        orderedTaskIds.push(taskRef.taskId);
        fallbackMap.set(taskRef.taskId, {
          resultUrl: taskRef.resultUrl ?? null,
          thumbnailUrl: taskRef.thumbnailUrl ?? null,
        });
        try {
          numericTaskIds.push(BigInt(taskRef.taskId));
        } catch {
          continue;
        }
        if (orderedTaskIds.length >= params.limit) break;
      }
      if (orderedTaskIds.length >= params.limit) break;
    }

    if (orderedTaskIds.length === 0) return [];

    if (params.kind === 'image') {
      const tasks = await this.prisma.imageTask.findMany({
        where: {
          id: { in: numericTaskIds },
          userId: params.userId,
          deletedAt: null,
        },
        select: {
          id: true,
          resultUrl: true,
          thumbnailUrl: true,
        },
      });

      const taskMap = new Map(
        tasks.map((task) => [
          task.id.toString(),
          {
            resultUrl: task.resultUrl,
            thumbnailUrl: task.thumbnailUrl,
            providerTaskId: null,
          },
        ]),
      );

      return orderedTaskIds
        .map((taskId) => {
          const stored = taskMap.get(taskId);
          const fallback = fallbackMap.get(taskId);
          return {
            kind: 'image' as const,
            taskId,
            resultUrl: stored?.resultUrl ?? fallback?.resultUrl ?? null,
            thumbnailUrl: stored?.thumbnailUrl ?? fallback?.thumbnailUrl ?? null,
            providerTaskId: null as string | null,
          };
        })
        .filter((item) => item.resultUrl || item.thumbnailUrl);
    }

    const tasks = await this.prisma.videoTask.findMany({
      where: {
        id: { in: numericTaskIds },
        userId: params.userId,
      },
      select: {
        id: true,
        resultUrl: true,
        thumbnailUrl: true,
        providerTaskId: true,
      },
    });

    const taskMap = new Map(
      tasks.map((task) => [
        task.id.toString(),
        {
          resultUrl: task.resultUrl,
          thumbnailUrl: task.thumbnailUrl,
          providerTaskId: task.providerTaskId,
        },
      ]),
    );

    return orderedTaskIds
      .map((taskId) => {
        const stored = taskMap.get(taskId);
        const fallback = fallbackMap.get(taskId);
        return {
          kind: 'video' as const,
          taskId,
          resultUrl: stored?.resultUrl ?? fallback?.resultUrl ?? null,
          thumbnailUrl: stored?.thumbnailUrl ?? fallback?.thumbnailUrl ?? null,
          providerTaskId: stored?.providerTaskId ?? null,
        };
      })
      .filter((item) => item.resultUrl || item.thumbnailUrl || item.providerTaskId);
  }

  private buildChatContextImageParameters(provider: string, images: string[]) {
    if (images.length === 0) return {};

    const providerKey = normalizeProviderKey(provider);
    if (providerKey.includes('qwen')) {
      return { images };
    }
    if (providerKey.includes('doubao')) {
      return { image: images.length === 1 ? images[0] : images };
    }
    if (
      providerKey.includes('nanobanana') ||
      providerKey.includes('gemini') ||
      providerKey.includes('google')
    ) {
      return {
        images,
        imageFirst: true,
      };
    }
    return {};
  }

  private buildChatContextVideoParameters(
    model: AiModel,
    input: {
      currentImages: string[];
      currentVideos: string[];
      currentAudios: string[];
      latestContextAsset?: {
        resultUrl: string | null;
        thumbnailUrl: string | null;
        providerTaskId: string | null;
      } | null;
    },
  ) {
    const providerKey = normalizeProviderKey(model.provider);
    const remoteModel = String((model as any).modelKey ?? '').trim().toLowerCase();
    const parameters: Record<string, unknown> = {};
    const fallbackImage = input.latestContextAsset?.thumbnailUrl ?? null;
    const fallbackVideo = input.latestContextAsset?.resultUrl ?? null;

    if (this.isWanxR2vVideoModel(model)) {
      const imageOnlyReferences = this.isWanxImageOnlyR2vVideoModel(model);
      const mergedReferenceVideos = [...input.currentVideos];
      if (!imageOnlyReferences && mergedReferenceVideos.length === 0 && fallbackVideo) {
        mergedReferenceVideos.push(fallbackVideo);
      }

      return this.buildWanxR2vContextVideoParameters({
        currentImages: input.currentImages,
        currentVideos: mergedReferenceVideos,
        currentAudios: input.currentAudios,
        firstFrameImage: fallbackImage,
        imageOnlyReferences,
      });
    }

    if (providerKey.includes('doubao') || providerKey.includes('bytedance') || providerKey.includes('ark')) {
      const isSeedance15Pro = remoteModel.includes('seedance-1-5-pro');
      if (isSeedance15Pro) {
        const mergedReferenceImages = [...input.currentImages];
        if (mergedReferenceImages.length === 0 && fallbackImage) {
          mergedReferenceImages.push(fallbackImage);
        }

        if (mergedReferenceImages.length > 0) {
          parameters.referenceImages = mergedReferenceImages;
        }
        return parameters;
      }

      const mergedReferenceVideos = [...input.currentVideos];
      if (mergedReferenceVideos.length === 0 && fallbackVideo) {
        mergedReferenceVideos.push(fallbackVideo);
      }

      const mergedReferenceImages = [...input.currentImages];
      if (mergedReferenceImages.length === 0 && mergedReferenceVideos.length === 0 && fallbackImage) {
        mergedReferenceImages.push(fallbackImage);
      }

      if (mergedReferenceImages.length > 0) {
        parameters.referenceImages = mergedReferenceImages;
      }
      if (mergedReferenceVideos.length > 0) {
        parameters.referenceVideos = mergedReferenceVideos;
      }
      if (input.currentAudios.length > 0) {
        parameters.referenceAudios = input.currentAudios;
      }
      return parameters;
    }

    return parameters;
  }

  private async generateConversationImageTask(params: {
    userId: bigint;
    conversationId: bigint;
    imageModelIdRaw: string;
    projectId?: bigint | null;
    prompt: string;
    negativePrompt?: string;
    currentImages: string[];
    useConversationContextEdit?: boolean;
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
    parameters?: Record<string, unknown>;
  }) {
    const imageModelId = this.parseBigInt(params.imageModelIdRaw, 'modelId');
    const imageModel = await this.prisma.aiModel.findFirst({
      where: {
        id: imageModelId,
        type: AiModelType.image,
        isActive: true,
      },
    });
    if (!imageModel) {
      throw new BadRequestException('Image model not found or inactive');
    }

    const imageModelCapabilities = buildModelCapabilities(imageModel as AiModel, null);
    const supportsContextImageEditing = this.supportsMediaAgentImageModel(
      imageModel,
      imageModelCapabilities,
    );

    if ((params.currentImages.length > 0 || params.useConversationContextEdit) && !supportsContextImageEditing) {
      throw new BadRequestException('Current image model does not support context editing in chat');
    }

    const mergedParameters = {
      ...buildChatImageTaskParameters(imageModel, {
        preferredAspectRatio: params.preferredAspectRatio ?? null,
        preferredResolution: params.preferredResolution ?? null,
        hasReferenceImages: params.currentImages.length > 0 || Boolean(params.useConversationContextEdit),
      }),
      ...(params.parameters ? { ...params.parameters } : {}),
    };
    const maxInputImages = Math.max(1, imageModelCapabilities.limits.maxInputImages ?? 1);
    const contextImages = [...params.currentImages]
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, maxInputImages);

    if (params.useConversationContextEdit) {
      const generatedAssets = await this.collectConversationGeneratedMediaAssets({
        userId: params.userId,
        conversationId: params.conversationId,
        kind: 'image',
        limit: maxInputImages,
      });

      for (const asset of generatedAssets) {
        const url = asset.resultUrl?.trim() || asset.thumbnailUrl?.trim() || '';
        if (!url || contextImages.includes(url)) continue;
        contextImages.push(url);
        if (contextImages.length >= maxInputImages) break;
      }
    }

    if (contextImages.length > 0) {
      Object.assign(
        mergedParameters,
        this.buildChatContextImageParameters(imageModel.provider, contextImages),
      );
    }

    const createdTask = await this.imagesService.generate(params.userId, {
      modelId: params.imageModelIdRaw,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      parameters: Object.keys(mergedParameters).length > 0 ? mergedParameters : undefined,
      projectId: params.projectId ? params.projectId.toString() : undefined,
    });

    return {
      createdTask,
      imageModel,
      imageModelCapabilities,
    };
  }

  private async generateConversationVideoTask(params: {
    userId: bigint;
    conversationId: bigint;
    videoModelIdRaw: string;
    projectId?: bigint | null;
    prompt: string;
    currentImages: string[];
    currentVideos: string[];
    currentAudios: string[];
    useConversationContextEdit?: boolean;
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
    preferredDuration?: string | null;
    parameters?: Record<string, unknown>;
  }) {
    const videoModelId = this.parseBigInt(params.videoModelIdRaw, 'modelId');
    const requestedVideoModel = await this.prisma.aiModel.findFirst({
      where: {
        id: videoModelId,
        type: AiModelType.video,
        isActive: true,
      },
    });
    if (!requestedVideoModel) {
      throw new BadRequestException('Video model not found or inactive');
    }

    const requestedImages = params.currentImages
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
    const requestedVideos = params.currentVideos
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
    const requestedAudios = params.currentAudios
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
    const shouldUseWanxTextOnlyModel =
      this.isWanxR2vVideoModel(requestedVideoModel) &&
      requestedImages.length === 0 &&
      requestedVideos.length === 0 &&
      requestedAudios.length === 0 &&
      params.useConversationContextEdit !== true;
    const videoModel = shouldUseWanxTextOnlyModel
      ? await this.requireWanxSiblingVideoModel(requestedVideoModel, 't2v')
      : requestedVideoModel;
    const videoModelIdRaw = shouldUseWanxTextOnlyModel
      ? videoModel.id.toString()
      : params.videoModelIdRaw;
    const videoModelCapabilities = buildModelCapabilities(videoModel as AiModel, null);
    const supportsContextVideoEditing = this.supportsMediaAgentVideoModel(
      videoModel,
      videoModelCapabilities,
    );

    if (
      (requestedImages.length > 0 ||
        requestedVideos.length > 0 ||
        requestedAudios.length > 0 ||
        params.useConversationContextEdit) &&
      !supportsContextVideoEditing
    ) {
      throw new BadRequestException('Current video model does not support context editing in chat');
    }

    if (requestedImages.length > 0 && !videoModelCapabilities.supports.imageInput) {
      throw new BadRequestException('Current video model does not support image references');
    }
    if (requestedVideos.length > 0 && !videoModelCapabilities.supports.videoInput) {
      throw new BadRequestException('Current video model does not support video references');
    }
    if (requestedAudios.length > 0 && !videoModelCapabilities.supports.audioInput) {
      throw new BadRequestException('Current video model does not support audio references');
    }

    const extraParameters = params.parameters ? { ...params.parameters } : {};
    if (shouldUseWanxTextOnlyModel) {
      this.stripWanxReferenceParameters(extraParameters);
    }
    const mergedParameters = {
      ...buildChatVideoTaskParameters(videoModel, {
        preferredAspectRatio: params.preferredAspectRatio ?? null,
        preferredResolution: params.preferredResolution ?? null,
        preferredDuration: params.preferredDuration ?? null,
      }),
      ...extraParameters,
    };
    const maxInputImages = Math.max(1, videoModelCapabilities.limits.maxInputImages ?? 1);
    const maxInputVideos = Math.max(1, videoModelCapabilities.limits.maxInputVideos ?? 1);
    const maxInputAudios = Math.max(1, videoModelCapabilities.limits.maxInputAudios ?? 1);

    const currentImages = requestedImages.slice(0, maxInputImages);
    const currentVideos = requestedVideos.slice(0, maxInputVideos);
    const currentAudios = requestedAudios.slice(0, maxInputAudios);

    const latestContextAsset = params.useConversationContextEdit
      ? (
          await this.collectConversationGeneratedMediaAssets({
            userId: params.userId,
            conversationId: params.conversationId,
            kind: 'video',
            limit: 1,
          })
        )[0] ?? null
      : null;

    Object.assign(
      mergedParameters,
      this.buildChatContextVideoParameters(videoModel, {
        currentImages,
        currentVideos,
        currentAudios,
        latestContextAsset,
      }),
    );

    const createdTask = await this.videosService.generate(params.userId, {
      modelId: videoModelIdRaw,
      prompt: params.prompt,
      parameters: Object.keys(mergedParameters).length > 0 ? mergedParameters : undefined,
      projectId: params.projectId ? params.projectId.toString() : undefined,
    });

    return {
      createdTask,
      videoModel,
      videoModelCapabilities,
    };
  }

  private normalizeStringList(value: unknown, max = 4): string[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => Boolean(item))
      .slice(0, max);
  }

  private normalizeImages(images?: string[], max = 4): string[] {
    if (!Array.isArray(images)) return [];

    return images
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => Boolean(value))
      .slice(0, max);
  }

  private extractImages(value: unknown): string[] {
    value = parseSqliteJson(value) as Prisma.JsonValue | null;
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => Boolean(item));
  }

  private mapChatFile(file: ChatFile): ChatFileAttachment {
    return {
      id: file.id.toString(),
      fileName: normalizeUploadedFileName(file.fileName),
      extension: file.extension,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    };
  }

  private extractMessageFiles(value: unknown): ChatFileAttachment[] {
    value = parseSqliteJson(value) as Prisma.JsonValue | null;
    if (!Array.isArray(value)) return [];

    const out: ChatFileAttachment[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;

      const id = typeof obj.id === 'string' ? obj.id : '';
      const fileName = typeof obj.fileName === 'string' ? normalizeUploadedFileName(obj.fileName) : '';
      const extension = typeof obj.extension === 'string' ? obj.extension : '';
      const mimeType = typeof obj.mimeType === 'string' ? obj.mimeType : '';
      const fileSizeRaw = obj.fileSize;
      const fileSize = typeof fileSizeRaw === 'number' && Number.isFinite(fileSizeRaw) ? Math.max(0, Math.trunc(fileSizeRaw)) : 0;

      if (!id || !fileName) continue;
      out.push({
        id,
        fileName,
        extension,
        mimeType,
        fileSize,
      });
    }

    return out;
  }

  private mapMessage(message: {
    id: bigint;
    conversationId: bigint;
    role: string;
    content: string;
    images: unknown;
    files: unknown;
    providerData?: unknown;
    createdAt: Date;
  }) {
    const reasoning = this.extractReasoningFromProviderData(message.providerData ?? null);
    const citations = this.extractCitationsFromProviderData(message.providerData ?? null);
    const taskRefs = this.extractTaskRefsFromProviderData(message.providerData ?? null);
    const mediaAgent = this.extractMediaAgentFromProviderData(message.providerData ?? null);
    const autoProjectAgent = extractAutoProjectAgentFromProviderData(message.providerData ?? null);
    return {
      id: message.id.toString(),
      conversationId: message.conversationId.toString(),
      role: message.role,
      content: message.content,
      reasoning,
      images: this.extractImages(message.images),
      files: this.extractMessageFiles(message.files),
      citations,
      taskRefs,
      mediaAgent,
      autoProjectAgent,
      createdAt: message.createdAt,
    };
  }

  private async hydrateTaskRefsForMessages<T extends { taskRefs: ChatTaskRef[] }>(
    userId: bigint,
    messages: T[],
  ): Promise<T[]> {
    const imageTaskIds: bigint[] = [];
    const videoTaskIds: bigint[] = [];
    const imageTaskNos: string[] = [];
    const videoTaskNos: string[] = [];
    const seenImageTaskIds = new Set<string>();
    const seenVideoTaskIds = new Set<string>();
    const seenImageTaskNos = new Set<string>();
    const seenVideoTaskNos = new Set<string>();

    for (const message of messages) {
      for (const taskRef of message.taskRefs) {
        const normalizedTaskNo = typeof taskRef.taskNo === 'string' ? taskRef.taskNo.trim() : '';
        if (normalizedTaskNo) {
          if (taskRef.kind === 'image') {
            if (!seenImageTaskNos.has(normalizedTaskNo)) {
              seenImageTaskNos.add(normalizedTaskNo);
              imageTaskNos.push(normalizedTaskNo);
            }
          } else if (!seenVideoTaskNos.has(normalizedTaskNo)) {
            seenVideoTaskNos.add(normalizedTaskNo);
            videoTaskNos.push(normalizedTaskNo);
          }
        }

        try {
          const taskId = BigInt(taskRef.taskId);
          if (taskRef.kind === 'image') {
            const key = taskId.toString();
            if (seenImageTaskIds.has(key)) continue;
            seenImageTaskIds.add(key);
            imageTaskIds.push(taskId);
            continue;
          }

          const key = taskId.toString();
          if (seenVideoTaskIds.has(key)) continue;
          seenVideoTaskIds.add(key);
          videoTaskIds.push(taskId);
        } catch {
          const fallbackTaskNo = taskRef.taskId.trim();
          if (!fallbackTaskNo) continue;

          if (taskRef.kind === 'image') {
            if (seenImageTaskNos.has(fallbackTaskNo)) continue;
            seenImageTaskNos.add(fallbackTaskNo);
            imageTaskNos.push(fallbackTaskNo);
            continue;
          }

          if (seenVideoTaskNos.has(fallbackTaskNo)) continue;
          seenVideoTaskNos.add(fallbackTaskNo);
          videoTaskNos.push(fallbackTaskNo);
        }
      }
    }

    if (imageTaskIds.length === 0 && videoTaskIds.length === 0 && imageTaskNos.length === 0 && videoTaskNos.length === 0) {
      return messages;
    }

    const [imageTasks, videoTasks] = await Promise.all([
      imageTaskIds.length > 0 || imageTaskNos.length > 0
        ? this.prisma.imageTask.findMany({
            where: {
              userId,
              OR: [
                ...(imageTaskIds.length > 0 ? [{ id: { in: imageTaskIds } }] : []),
                ...(imageTaskNos.length > 0 ? [{ taskNo: { in: imageTaskNos } }] : []),
              ],
            },
            select: {
              id: true,
              taskNo: true,
              status: true,
              modelId: true,
              provider: true,
              prompt: true,
              thumbnailUrl: true,
              resultUrl: true,
              errorMessage: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : Promise.resolve([]),
      videoTaskIds.length > 0 || videoTaskNos.length > 0
        ? this.prisma.videoTask.findMany({
            where: {
              userId,
              OR: [
                ...(videoTaskIds.length > 0 ? [{ id: { in: videoTaskIds } }] : []),
                ...(videoTaskNos.length > 0 ? [{ taskNo: { in: videoTaskNos } }] : []),
              ],
            },
            select: {
              id: true,
              taskNo: true,
              status: true,
              modelId: true,
              provider: true,
              model: {
                select: {
                  modelKey: true,
                },
              },
              prompt: true,
              thumbnailUrl: true,
              resultUrl: true,
              errorMessage: true,
              createdAt: true,
              completedAt: true,
              autoProjectShotId: true,
              autoProjectFinalStoryboard: true,
              providerData: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const imageTaskMap = new Map<string, ChatTaskRef>();
    for (const task of imageTasks) {
      const taskRef = this.toChatImageTaskRef({
        id: task.id.toString(),
        taskNo: task.taskNo,
        status:
          task.status === TaskStatus.pending
            ? 'pending'
            : task.status === TaskStatus.processing
              ? 'processing'
              : task.status === TaskStatus.completed
                ? 'completed'
                : 'failed',
        modelId: task.modelId.toString(),
        provider: task.provider,
        prompt: task.prompt,
        thumbnailUrl: task.thumbnailUrl,
        resultUrl: task.resultUrl,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      });

      imageTaskMap.set(task.id.toString(), taskRef);
      imageTaskMap.set(task.taskNo, taskRef);
    }

    const videoTaskMap = new Map<string, ChatTaskRef>();
    for (const task of videoTasks) {
      const autoProjectMetadata = extractAutoProjectAssetMetadata(task.providerData ?? null);
      const shotId =
        typeof task.autoProjectShotId === 'string' && task.autoProjectShotId.trim()
          ? task.autoProjectShotId.trim()
          : autoProjectMetadata?.shotId ?? null;
      const finalStoryboard =
        task.autoProjectFinalStoryboard === true ||
        autoProjectMetadata?.finalStoryboard === true;
      const taskRef = this.toChatVideoTaskRef({
        id: task.id.toString(),
        taskNo: task.taskNo,
        status:
          task.status === TaskStatus.pending
            ? 'pending'
            : task.status === TaskStatus.processing
              ? 'processing'
              : task.status === TaskStatus.completed
                ? 'completed'
                : 'failed',
        modelId: task.modelId.toString(),
        provider: task.provider,
        prompt: task.prompt,
        thumbnailUrl: task.thumbnailUrl,
        resultUrl: task.resultUrl,
        errorMessage: task.errorMessage,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        canCancel: canCancelVideoTask(task.status, task.provider, task.model?.modelKey ?? null),
        cancelSupported: supportsVideoTaskCancel(task.provider, task.model?.modelKey ?? null),
      }, {
        shotId,
        finalStoryboard,
      });

      videoTaskMap.set(task.id.toString(), taskRef);
      videoTaskMap.set(task.taskNo, taskRef);
    }

    return messages.map((message) => ({
      ...message,
      taskRefs: message.taskRefs.map((taskRef) => {
        const liveTaskRef = taskRef.kind === 'image'
          ? imageTaskMap.get(taskRef.taskId) ?? (taskRef.taskNo ? imageTaskMap.get(taskRef.taskNo) : undefined)
          : videoTaskMap.get(taskRef.taskId) ?? (taskRef.taskNo ? videoTaskMap.get(taskRef.taskNo) : undefined);

        return liveTaskRef ? { ...taskRef, ...liveTaskRef } : taskRef;
      }),
    }));
  }

  private buildVisibleAgentErrorCompletion(input: {
    mode: 'auto' | 'media';
    error: unknown;
    recentMessages: Array<{ providerData: unknown }>;
  }) {
    const message = this.normalizeExceptionMessage(input.error);
    const label = input.mode === 'auto' ? '全自动模式执行失败' : 'Agent 模式执行失败';
    this.logger.error(
      `${label}: ${message}`,
      input.error instanceof Error ? input.error.stack : undefined,
    );

    const providerData: Record<string, unknown> = {
      agentError: {
        mode: input.mode,
        message,
      },
    };

    for (const recentMessage of [...input.recentMessages].reverse()) {
      if (input.mode === 'auto') {
        const autoProjectAgent = extractAutoProjectAgentFromProviderData(recentMessage.providerData ?? null);
        if (autoProjectAgent) {
          providerData.autoProjectAgent = autoProjectAgent;
          break;
        }
      } else {
        const mediaAgent = this.extractMediaAgentFromProviderData(recentMessage.providerData ?? null);
        if (mediaAgent) {
          providerData.mediaAgent = mediaAgent;
          break;
        }
      }
    }

    return {
      content: `${label}：${message}`,
      providerData,
    };
  }

  private asJsonRecord(value: unknown): Record<string, unknown> {
    const parsed = parseSqliteJson<Record<string, unknown>>(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  }

  private extractReasoningFromProviderData(providerData: unknown): string | null {
    providerData = parseSqliteJson(providerData) ?? providerData;
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return null;
    }

    const source = providerData as Record<string, unknown>;
    const candidates = [
      source.reasoning,
      source.reasoning_content,
      source.thinking,
      source.thought,
    ];

    for (const value of candidates) {
      const normalized = this.normalizeUpstreamContent(value).trim();
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private extractCitationsFromProviderData(providerData: unknown): ChatCitation[] {
    providerData = parseSqliteJson(providerData) ?? providerData;
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return [];
    }

    const source = providerData as Record<string, unknown>;
    if (!Array.isArray(source.citations)) {
      return [];
    }

    const out: ChatCitation[] = [];
    for (const item of source.citations) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const snippet = typeof obj.snippet === 'string' ? obj.snippet.trim() : '';
      if (!snippet) continue;

      const citation: ChatCitation = {
        type: 'file',
        snippet,
      };

      if (typeof obj.fileId === 'string' && obj.fileId.trim()) {
        citation.fileId = obj.fileId.trim();
      }
      if (typeof obj.fileName === 'string' && obj.fileName.trim()) {
        citation.fileName = normalizeUploadedFileName(obj.fileName);
      }
      if (typeof obj.extension === 'string' && obj.extension.trim()) {
        citation.extension = obj.extension.trim();
      }
      if (!citation.fileId || !citation.fileName) {
        continue;
      }

      if (typeof obj.score === 'number' && Number.isFinite(obj.score)) {
        citation.score = obj.score;
      }
      if (typeof obj.chunkIndex === 'number' && Number.isFinite(obj.chunkIndex)) {
        citation.chunkIndex = Math.max(1, Math.trunc(obj.chunkIndex));
      }
      out.push(citation);
    }

    return out;
  }

  private extractTaskRefsFromProviderData(providerData: unknown): ChatTaskRef[] {
    providerData = parseSqliteJson(providerData) ?? providerData;
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return [];
    }

    const source = providerData as Record<string, unknown>;
    if (!Array.isArray(source.taskRefs)) {
      return [];
    }

    const out: ChatTaskRef[] = [];
    for (const item of source.taskRefs) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

      const obj = item as Record<string, unknown>;
      const kind = typeof obj.kind === 'string' ? obj.kind.trim().toLowerCase() : '';
      const taskId = typeof obj.taskId === 'string' ? obj.taskId.trim() : '';
      if ((kind !== 'image' && kind !== 'video') || !taskId) continue;

      const taskRef: ChatTaskRef = {
        kind: kind as ChatTaskRef['kind'],
        taskId,
      };

      if (typeof obj.taskNo === 'string' && obj.taskNo.trim()) {
        taskRef.taskNo = obj.taskNo.trim();
      }
      if (
        typeof obj.status === 'string' &&
        ['pending', 'processing', 'completed', 'failed'].includes(obj.status.trim())
      ) {
        taskRef.status = obj.status.trim() as ChatTaskRef['status'];
      }
      if (typeof obj.shotId === 'string' && obj.shotId.trim()) {
        taskRef.shotId = obj.shotId.trim();
      }
      if (obj.finalStoryboard === true) {
        taskRef.finalStoryboard = true;
      }
      if (typeof obj.modelId === 'string' && obj.modelId.trim()) {
        taskRef.modelId = obj.modelId.trim();
      }
      if (typeof obj.provider === 'string' && obj.provider.trim()) {
        taskRef.provider = obj.provider.trim();
      }
      if (typeof obj.prompt === 'string' && obj.prompt.trim()) {
        taskRef.prompt = obj.prompt.trim();
      }
      if (typeof obj.thumbnailUrl === 'string' && obj.thumbnailUrl.trim()) {
        taskRef.thumbnailUrl = obj.thumbnailUrl.trim();
      } else {
        taskRef.thumbnailUrl = null;
      }
      if (typeof obj.resultUrl === 'string' && obj.resultUrl.trim()) {
        taskRef.resultUrl = obj.resultUrl.trim();
      } else {
        taskRef.resultUrl = null;
      }
      if (typeof obj.canCancel === 'boolean') {
        taskRef.canCancel = obj.canCancel;
      }
      if (typeof obj.cancelSupported === 'boolean') {
        taskRef.cancelSupported = obj.cancelSupported;
      }
      if (typeof obj.errorMessage === 'string' && obj.errorMessage.trim()) {
        taskRef.errorMessage = obj.errorMessage.trim();
      } else {
        taskRef.errorMessage = null;
      }
      if (typeof obj.createdAt === 'string' && obj.createdAt.trim()) {
        taskRef.createdAt = obj.createdAt.trim();
      }
      if (typeof obj.completedAt === 'string' && obj.completedAt.trim()) {
        taskRef.completedAt = obj.completedAt.trim();
      } else {
        taskRef.completedAt = null;
      }

      out.push(taskRef);
    }

    return out;
  }

  private extractMediaAgentFromProviderData(providerData: unknown): MediaAgentMetadata | null {
    providerData = parseSqliteJson(providerData) ?? providerData;
    if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
      return null;
    }

    const source = providerData as Record<string, unknown>;
    const rawValue = source.mediaAgent ?? source.imageAgent;
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return null;
    }

    const raw = rawValue as Record<string, unknown>;
    const statusRaw = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';
    const status: MediaAgentStatus | null =
      statusRaw === 'ready'
        ? 'ready'
        : statusRaw === 'clarify'
          ? 'clarify'
          : null;
    const intentRaw = typeof raw.intent === 'string' ? raw.intent.trim().toLowerCase() : '';
    const modelId =
      typeof raw.modelId === 'string' && raw.modelId.trim()
        ? raw.modelId.trim()
        : typeof raw.imageModelId === 'string' && raw.imageModelId.trim()
          ? raw.imageModelId.trim()
          : '';
    const modelName =
      typeof raw.modelName === 'string' && raw.modelName.trim()
        ? raw.modelName.trim()
        : typeof raw.imageModelName === 'string' && raw.imageModelName.trim()
          ? raw.imageModelName.trim()
          : '';
    const modelTypeRaw = typeof raw.modelType === 'string' ? raw.modelType.trim().toLowerCase() : '';
    const modelType: MediaAgentMetadata['modelType'] =
      modelTypeRaw === 'video'
        ? 'video'
        : 'image';

    if (!status || !modelId || !modelName) {
      return null;
    }

    return {
      status,
      intent: intentRaw === 'edit' ? 'edit' : 'generate',
      optimizedPrompt:
        typeof raw.optimizedPrompt === 'string' && raw.optimizedPrompt.trim()
          ? raw.optimizedPrompt.trim()
          : null,
      negativePrompt:
        typeof raw.negativePrompt === 'string' && raw.negativePrompt.trim()
          ? raw.negativePrompt.trim()
          : null,
      suggestedReplies: Array.isArray(raw.suggestedReplies)
        ? raw.suggestedReplies
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0)
            .slice(0, 4)
        : [],
      sourceUserMessageId:
        typeof raw.sourceUserMessageId === 'string' && raw.sourceUserMessageId.trim()
          ? raw.sourceUserMessageId.trim()
          : '',
      modelId,
      modelName,
      modelType,
      preferredAspectRatio:
        typeof raw.preferredAspectRatio === 'string' && raw.preferredAspectRatio.trim()
          ? raw.preferredAspectRatio.trim()
          : null,
      preferredResolution:
        typeof raw.preferredResolution === 'string' && raw.preferredResolution.trim()
          ? raw.preferredResolution.trim()
          : null,
      preferredDuration:
        typeof raw.preferredDuration === 'string' && raw.preferredDuration.trim()
          ? raw.preferredDuration.trim()
          : null,
      referenceVideos: Array.isArray(raw.referenceVideos)
        ? raw.referenceVideos
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0)
            .slice(0, 10)
        : [],
      referenceAudios: Array.isArray(raw.referenceAudios)
        ? raw.referenceAudios
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item.length > 0)
            .slice(0, 10)
        : [],
      referenceImageCount:
        typeof raw.referenceImageCount === 'number' && Number.isFinite(raw.referenceImageCount)
          ? Math.max(0, Math.trunc(raw.referenceImageCount))
          : 0,
      referenceVideoCount:
        typeof raw.referenceVideoCount === 'number' && Number.isFinite(raw.referenceVideoCount)
          ? Math.max(0, Math.trunc(raw.referenceVideoCount))
          : 0,
      referenceAudioCount:
        typeof raw.referenceAudioCount === 'number' && Number.isFinite(raw.referenceAudioCount)
          ? Math.max(0, Math.trunc(raw.referenceAudioCount))
          : 0,
      autoCreated: raw.autoCreated === true,
    };
  }

  private mapConversationSummary(conversation: {
    id: bigint;
    title: string;
    isPinned: boolean;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
    projectContext?: {
      id: bigint;
      name: string;
    } | null;
    model: {
      id: bigint;
      name: string;
      icon: string | null;
      type: string;
      supportsImageInput: boolean | null;
      isActive: boolean;
    };
    messages?: Array<{
      content: string;
      images: unknown;
      files?: unknown;
      createdAt: Date;
    }>;
  }) {
    const latest = conversation.messages?.[0];

    return {
      id: conversation.id.toString(),
      title: conversation.title,
      isPinned: Boolean(conversation.isPinned),
      model: {
        id: conversation.model.id.toString(),
        name: conversation.model.name,
        icon: conversation.model.icon,
      type: conversation.model.type,
        supportsImageInput: Boolean(conversation.model.supportsImageInput),
        isActive: conversation.model.isActive,
      },
      projectContext: conversation.projectContext
        ? {
            id: conversation.projectContext.id.toString(),
            name: conversation.projectContext.name,
          }
        : null,
      lastMessagePreview: this.buildPreviewText(latest?.content ?? '', latest?.images ?? null, latest?.files ?? null),
      lastMessageAt: latest?.createdAt ?? conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private buildPreviewText(content: string, images: unknown, files: unknown) {
    const text = content.trim();
    if (text) return text.length > 80 ? `${text.slice(0, 80)}...` : text;

    const imageCount = this.extractImages(images).length;
    if (imageCount > 0) return imageCount > 1 ? `[${imageCount} images]` : '[image]';

    const fileCount = this.extractMessageFiles(files).length;
    if (fileCount > 0) return fileCount > 1 ? `[${fileCount} files]` : '[file]';

    return '';
  }

  private normalizeTitle(value: string | undefined) {
    if (!value) return null;
    const text = value.trim();
    if (!text) return null;
    return text.length > 200 ? text.slice(0, 200) : text;
  }

  private buildAutoTitle(currentTitle: string, content: string) {
    if (currentTitle !== ChatService.DEFAULT_TITLE) return null;

    const trimmed = content.trim();
    if (!trimmed) return null;

    const compact = trimmed.replace(/\s+/g, ' ');
    return compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
  }

  private normalizeSearchKeyword(value: string | undefined) {
    if (!value) return undefined;
    const text = value.trim();
    if (!text) return undefined;
    return text.slice(0, 100);
  }

  private normalizeExceptionMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string' && response.trim()) return response;
      if (response && typeof response === 'object' && typeof (response as Record<string, unknown>).message === 'string') {
        return (response as Record<string, string>).message;
      }
      if (error.message) return error.message;
      return 'Chat request failed';
    }
    if (error instanceof Error && error.message?.trim()) return error.message;
    return 'Chat request failed';
  }

  private parseBigInt(raw: string, fieldName: string) {
    try {
      return BigInt(raw);
    } catch {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }
  }

  private async requireConversation(userId: bigint, conversationId: bigint) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId,
        model: { is: { type: AiModelType.chat } },
      },
      include: {
        model: {
          select: {
            id: true,
            name: true,
            icon: true,
            type: true,
            supportsImageInput: true,
            isActive: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async requireConversationWithChannel(userId: bigint, conversationId: bigint) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId,
        model: { is: { type: AiModelType.chat } },
      },
      include: {
        model: {
          include: {
            channel: true,
          },
        },
        projectContext: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }
}
