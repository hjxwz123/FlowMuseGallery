import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AiModel, Prisma } from '@prisma/client';
import { AiModelType, ChatMessageRole, TaskStatus } from '../common/prisma-enums';
import axios from 'axios';

import {
  attachAutoProjectAssetMetadata,
  buildAutoProjectTaskColumnData,
  extractAutoProjectAssetMetadata,
  type AutoProjectTaskAssetMetadata,
} from '../common/utils/task-provider-data.util';
import { EncryptionService } from '../encryption/encryption.service';
import { ImagesService } from '../images/images.service';
import { buildModelCapabilities } from '../models/model-capabilities';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeProviderKey } from '../common/utils/provider.util';
import { parseSqliteJson, toSqliteJson } from '../common/utils/sqlite-json.util';
import { VideosService } from '../videos/videos.service';
import {
  getAutoProjectImageOptionCatalog,
  getAutoProjectVideoOptionCatalog,
  sanitizeAutoProjectImagePreferences,
  sanitizeAutoProjectVideoPreferences,
} from './auto-project-model-options';
import { extractAutoProjectAgentFromProviderData } from './auto-project-workflow.metadata';
import type {
  AutoProjectAgentContext,
  AutoProjectAgentMetadata,
  AutoProjectAssetSnapshot,
  AutoProjectCharacterItem,
  AutoProjectImagePlanItem,
  AutoProjectOrderedReferenceAsset,
  AutoProjectOutlineItem,
  AutoProjectShotPlanItem,
  AutoProjectSnapshot,
  AutoProjectWorkflow,
  AutoProjectWorkflowAction,
  AutoProjectWorkflowStage,
} from './auto-project-workflow.types';
import {
  buildChatImageTaskParameters,
  buildChatVideoTaskParameters,
} from './chat-media-task-params';

type UpstreamMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type UpstreamMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | UpstreamMessagePart[];
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

type ParsedAutoProjectWorkflowResponse = {
  reply: string;
  projectName: string | null;
  projectDescription: string | null;
  outlineTitle: string | null;
  outline: AutoProjectOutlineItem[];
  characters: AutoProjectCharacterItem[];
  imagePlans: AutoProjectImagePlanItem[];
  shots: AutoProjectShotPlanItem[];
  recommendedNextStage: AutoProjectWorkflowStage | null;
};

type AutoProjectConversationContext = {
  model: {
    id: bigint;
    name: string;
    provider: string;
    modelKey: string;
    defaultParams: unknown;
    supportsImageInput: boolean | null;
    channel: {
      baseUrl: string;
      apiKey: string | null;
      extraHeaders: unknown;
      timeout: number;
    };
    systemPrompt: string | null;
  };
};

type AutoProjectRecentMessage = {
  role: string;
  content: string;
  images: unknown;
  files?: unknown;
  providerData?: unknown;
};

type AutoProjectProjectTaskStats = {
  activeImageTaskCount: number;
  activeVideoTaskCount: number;
  completedRoleImageCount: number;
  completedShotVideoCount: number;
};

type AutoProjectDraftResult = {
  workflow: AutoProjectWorkflow;
  modelSummary: string;
  providerData: Record<string, unknown>;
};

type AutoProjectStoredShotVideoReference = {
  shotId: string;
  title: string;
  resultUrl: string;
  thumbnailUrl: string | null;
  providerTaskId: string | null;
};

type AutoProjectOrderedMediaInput = {
  kind: 'image' | 'video' | 'audio';
  url: string;
};

type AutoProjectShotExecutionTarget = {
  shot: AutoProjectShotPlanItem;
  shotIndex: number;
  continuityReferences: AutoProjectOrderedReferenceAsset[];
};

type AutoProjectSetupImageTaskEntry = {
  taskRef: ChatTaskRef;
  metadata: AutoProjectTaskAssetMetadata;
  createdAt: Date;
};

type AutoProjectSetupTaskMatchResult = {
  reusableTaskRefs: ChatTaskRef[];
  pendingPlans: AutoProjectImagePlanItem[];
  totalMatchedPlans: number;
};

type AutoProjectSetupExecutionStatus = {
  expectedPlanCount: number;
  reusableTaskRefs: ChatTaskRef[];
  completedTaskRefs: ChatTaskRef[];
  pendingTaskRefs: ChatTaskRef[];
  pendingPlans: AutoProjectImagePlanItem[];
  readyToProceed: boolean;
};

@Injectable()
export class AutoProjectWorkflowService {
  private readonly logger = new Logger(AutoProjectWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly imagesService: ImagesService,
    private readonly videosService: VideosService,
  ) {}

  async completeTurn(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    onStatus?: (message: string) => void;
  }) {
    const preferChinese = this.isLikelyChineseText(params.userInput);
    const imageModelId = this.parseBigInt(params.autoProjectAgent.imageModelId, 'autoProjectAgent.imageModelId');
    const videoModelId = this.parseBigInt(params.autoProjectAgent.videoModelId, 'autoProjectAgent.videoModelId');

    params.onStatus?.(
      preferChinese ? '【当前进度：工作流分析中】' : '[Progress: analyzing workflow]',
    );

    const [imageModel, videoModel] = await Promise.all([
      this.prisma.aiModel.findFirst({
        where: { id: imageModelId, type: AiModelType.image, isActive: true },
      }),
      this.prisma.aiModel.findFirst({
        where: { id: videoModelId, type: AiModelType.video, isActive: true },
      }),
    ]);

    if (!imageModel) {
      throw new BadRequestException('Image model not found or inactive');
    }
    if (!videoModel) {
      throw new BadRequestException('Video model not found or inactive');
    }
    if (!this.isAutoProjectSupportedModel(imageModel)) {
      throw new BadRequestException(
        preferChinese
          ? '所选图片模型未开启聊天页全自动模式。'
          : 'The selected image model is not enabled for chat auto mode.',
      );
    }
    if (!this.isAutoProjectSupportedModel(videoModel)) {
      throw new BadRequestException(
        preferChinese
          ? '所选视频模型未开启聊天页全自动模式。'
          : 'The selected video model is not enabled for chat auto mode.',
      );
    }
    if (normalizeProviderKey(videoModel.provider).includes('wanx') && !this.isWanxR2vVideoModel(videoModel)) {
      throw new BadRequestException(
        preferChinese
          ? '聊天页全自动模式下，万相当前仅支持 wan2.7-r2v 模型。'
          : 'Chat auto mode currently supports only Wanx wan2.7-r2v models.',
      );
    }

    const selectedProjectId = params.autoProjectAgent.projectId
      ? this.parseBigInt(params.autoProjectAgent.projectId, 'autoProjectAgent.projectId')
      : null;
    const projectSnapshot = selectedProjectId
      ? await this.loadAutoProjectSnapshot(params.userId, selectedProjectId)
      : null;
    const previousMetadata = await this.resolvePreviousAutoProjectMetadata({
      userId: params.userId,
      recentMessages: params.recentMessages,
      autoProjectAgent: params.autoProjectAgent,
      selectedProjectId: selectedProjectId ? selectedProjectId.toString() : null,
    });
    const resolvedAutoProjectAgent = this.resolveLockedAutoProjectAgent({
      autoProjectAgent: params.autoProjectAgent,
      previousMetadata,
      preferChinese,
    });
    const previousWorkflow = previousMetadata?.workflow ?? null;
    const action = this.resolveAutoProjectWorkflowAction({
      userInput: params.userInput,
      previousWorkflow,
      hasSelectedProject: Boolean(projectSnapshot),
    });

    this.logger.log(
      [
        `conversationId=${params.conversationId.toString()}`,
        `selectedProjectId=${projectSnapshot?.id ?? 'none'}`,
        `action=${action}`,
        `previousStage=${previousWorkflow?.stage ?? 'none'}`,
      ].join(' '),
    );

    if (action === 'confirm_project_plan') {
      return this.handleConfirmProjectPlan({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
      });
    }

    if (action === 'start_project_plan' || action === 'revise_project_plan') {
      return this.handleProjectPlanReview({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'start_outline' || action === 'revise_outline') {
      return this.handleOutlineReview({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'approve_outline' || action === 'revise_characters') {
      return this.handleCharacterReview({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'approve_characters' || action === 'revise_project_setup') {
      return this.handleProjectSetupReview({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'confirm_project_setup') {
      return this.handleConfirmProjectSetup({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
      });
    }

    if (action === 'prepare_shots' || action === 'revise_shots') {
      return this.handleShotReview({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        imageModel,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'generate_first' || action === 'generate_next') {
      return this.handleShotGeneration({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        videoModel,
        previousWorkflow,
        projectSnapshot,
        action,
      });
    }

    if (action === 'confirm_skip_shot') {
      return this.handleConfirmSkipShot({
        ...params,
        autoProjectAgent: resolvedAutoProjectAgent,
        preferChinese,
        previousWorkflow,
        projectSnapshot,
      });
    }

    throw new BadRequestException('Unsupported Auto Project workflow action');
  }

  private async handleProjectPlanReview(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'start_project_plan' | 'revise_project_plan';
    onStatus?: (message: string) => void;
  }) {
    if (!params.projectSnapshot) {
      throw new BadRequestException('Project is required to review an existing auto workflow plan');
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：读取项目全量信息中】'
        : '[Progress: reading project state]',
    );

    const taskStats = await this.loadProjectWorkflowTaskStats(
      params.userId,
      BigInt(params.projectSnapshot.id),
    );
    const draft = await this.createProjectPlanReviewDraft({
      action: params.action,
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      currentWorkflow: params.previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      imageModel: params.imageModel,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
    });

    const content = this.buildProjectPlanReviewReply({
      projectSnapshot: params.projectSnapshot,
      workflow: draft.workflow,
      taskStats,
      modelSummary: draft.modelSummary,
      preferChinese: params.preferChinese,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: draft.providerData,
      content,
      taskRefs: [],
    });
  }

  private async handleConfirmProjectPlan(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    onStatus?: (message: string) => void;
  }) {
    if (!params.previousWorkflow || params.previousWorkflow.stage !== 'project_plan_review') {
      throw new BadRequestException('No project execution plan is waiting for confirmation');
    }

    const nextAction = this.determineProjectPlanFollowupAction(
      params.previousWorkflow,
      params.projectSnapshot,
    );
    if (nextAction === 'start_outline' || nextAction === 'revise_outline') {
      return this.handleOutlineReview({
        ...params,
        action: nextAction,
      });
    }
    if (nextAction === 'approve_outline' || nextAction === 'revise_characters') {
      return this.handleCharacterReview({
        ...params,
        action: nextAction,
      });
    }
    if (nextAction === 'approve_characters' || nextAction === 'revise_project_setup') {
      return this.handleProjectSetupReview({
        ...params,
        action: nextAction,
      });
    }
    if (nextAction === 'prepare_shots' || nextAction === 'revise_shots') {
      return this.handleShotReview({
        ...params,
        action: nextAction,
      });
    }

    throw new BadRequestException('Unable to determine the next confirmed Auto Project workflow stage');
  }

  private async handleOutlineReview(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'start_outline' | 'revise_outline';
    onStatus?: (message: string) => void;
  }) {
    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：项目大纲待审阅】'
        : '[Progress: outline review]',
    );

    const draft = await this.createOutlineReviewDraft({
      action: params.action,
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      currentWorkflow: params.previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      imageModel: params.imageModel,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
    });

    const content = this.buildOutlineReviewReply({
      workflow: draft.workflow,
      preferChinese: params.preferChinese,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: draft.providerData,
      content,
      taskRefs: [],
    });
  }

  private async handleCharacterReview(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'approve_outline' | 'revise_characters';
    onStatus?: (message: string) => void;
  }) {
    if (!params.previousWorkflow?.outline.length && params.action !== 'revise_characters') {
      throw new BadRequestException('Outline must be confirmed before preparing characters');
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：角色设定待审阅】'
        : '[Progress: character review]',
    );

    const draft = await this.createCharacterReviewDraft({
      action: params.action,
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      currentWorkflow: params.previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      imageModel: params.imageModel,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
    });

    const content = this.buildCharacterReviewReply({
      workflow: draft.workflow,
      preferChinese: params.preferChinese,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: draft.providerData,
      content,
      taskRefs: [],
    });
  }

  private async handleProjectSetupReview(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'approve_characters' | 'revise_project_setup';
    onStatus?: (message: string) => void;
  }) {
    if (!params.previousWorkflow?.characters.length && params.action !== 'revise_project_setup') {
      throw new BadRequestException('Characters must be confirmed before preparing project setup');
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：待确认是否执行角色图生成+项目初始化】'
        : '[Progress: waiting for setup confirmation]',
    );

    const draft = await this.createProjectSetupReviewDraft({
      action: params.action,
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      currentWorkflow: params.previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      imageModel: params.imageModel,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
      userInput: params.userInput,
    });

    const content = this.buildProjectSetupConfirmationReply({
      projectSnapshot: params.projectSnapshot,
      workflow: draft.workflow,
      preferChinese: params.preferChinese,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: draft.providerData,
      content,
      taskRefs: [],
    });
  }

  private async handleConfirmProjectSetup(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    onStatus?: (message: string) => void;
  }) {
    const forceRegenerate = this.isAutoProjectRegenerateRoleImagesCommand(params.userInput);
    let previousWorkflow = params.previousWorkflow;
    let recoveredTaskRefs: ChatTaskRef[] = [];

    if ((!previousWorkflow || previousWorkflow.stage !== 'project_setup_confirmation') && params.projectSnapshot) {
      const existingSetupTasks = await this.loadProjectSetupImageTaskEntries(
        params.userId,
        BigInt(params.projectSnapshot.id),
      );
      const reusableTaskRefs = existingSetupTasks
        .filter((entry) => this.isReusableSetupTaskRef(entry.taskRef))
        .map((entry) => entry.taskRef);

      if (reusableTaskRefs.length > 0) {
        previousWorkflow = this.buildRecoveredProjectSetupWorkflow({
          projectSnapshot: params.projectSnapshot,
          previousWorkflow: params.previousWorkflow,
          taskEntries: existingSetupTasks,
          preferChinese: params.preferChinese,
        });
        recoveredTaskRefs = reusableTaskRefs;
      }
    }

    if (!previousWorkflow || previousWorkflow.stage !== 'project_setup_confirmation') {
      throw new BadRequestException(
        params.preferChinese
          ? '当前没有待确认的角色图生成与项目初始化方案，请先重新生成这一阶段内容。'
          : 'Project setup is not waiting for confirmation',
      );
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：执行角色图生成与项目初始化中】'
        : '[Progress: executing project setup]',
    );

    const existingSetupTasks = params.projectSnapshot
      ? await this.loadProjectSetupImageTaskEntries(
        params.userId,
        BigInt(params.projectSnapshot.id),
      )
      : [];
    const matchedSetupTasks = this.matchExistingProjectSetupTasks({
      plans: previousWorkflow.imagePlans,
      taskEntries: existingSetupTasks,
    });
    const expectedRoleTaskCount = previousWorkflow.imagePlans.length;

    let imageExecution = {
      taskRefs: matchedSetupTasks.reusableTaskRefs,
      failures: [] as string[],
    };
    let reusedTaskCount = matchedSetupTasks.reusableTaskRefs.length;
    const plansToSubmit = forceRegenerate
      ? previousWorkflow.imagePlans
      : matchedSetupTasks.pendingPlans;

    if (forceRegenerate) {
      const hasRunningSetupTasks = existingSetupTasks.some((entry) => this.isSetupTaskPending(entry.taskRef));
      if (hasRunningSetupTasks) {
        throw new BadRequestException(
          params.preferChinese
            ? '当前仍有角色图任务在执行，请等待当前任务完成后再重新生成。'
            : 'Role image tasks are still running. Wait for them to finish before regenerating.',
        );
      }
    }

    const projectResult = await this.ensureAutoProjectExistsForSetup({
      userId: params.userId,
      autoProjectAgent: params.autoProjectAgent,
      projectSnapshot: params.projectSnapshot,
      workflow: previousWorkflow,
      preferChinese: params.preferChinese,
      recentMessages: params.recentMessages,
    });

    if (forceRegenerate) {
      const executed = await this.executeAutoProjectImagePlans({
        userId: params.userId,
        conversationId: params.conversationId,
        projectId: BigInt(projectResult.projectSnapshot.id),
        projectSnapshot: projectResult.projectSnapshot,
        imageModel: params.imageModel,
        autoProjectAgent: params.autoProjectAgent,
        plans: previousWorkflow.imagePlans,
        workflow: previousWorkflow,
        preferChinese: params.preferChinese,
        onStatus: params.onStatus,
      });

      imageExecution = {
        taskRefs: executed.taskRefs,
        failures: executed.failures,
      };
      reusedTaskCount = 0;
    } else if (plansToSubmit.length > 0) {
      const executed = await this.executeAutoProjectImagePlans({
        userId: params.userId,
        conversationId: params.conversationId,
        projectId: BigInt(projectResult.projectSnapshot.id),
        projectSnapshot: projectResult.projectSnapshot,
        imageModel: params.imageModel,
        autoProjectAgent: params.autoProjectAgent,
        plans: plansToSubmit,
        workflow: previousWorkflow,
        preferChinese: params.preferChinese,
        onStatus: params.onStatus,
      });

      imageExecution = {
        taskRefs: [...matchedSetupTasks.reusableTaskRefs, ...executed.taskRefs],
        failures: executed.failures,
      };
    } else if (recoveredTaskRefs.length > 0 || matchedSetupTasks.reusableTaskRefs.length > 0) {
      imageExecution = {
        taskRefs: matchedSetupTasks.reusableTaskRefs,
        failures: [],
      };
    }

    const workflow = this.buildProjectSetupConfirmationWorkflow({
      previousWorkflow,
      taskRefs: imageExecution.taskRefs,
      expectedPlanCount: expectedRoleTaskCount,
      preferChinese: params.preferChinese,
    });

    const content = this.buildProjectSetupConfirmationReply({
      projectSnapshot: projectResult.projectSnapshot,
      workflow,
      preferChinese: params.preferChinese,
      executionSummary: this.buildProjectSetupExecutedSummary({
        projectSnapshot: projectResult.projectSnapshot,
        autoCreatedProject: projectResult.autoCreatedProject,
        taskRefs: imageExecution.taskRefs,
        failures: imageExecution.failures,
        reusedTaskCount,
        expectedPlanCount: expectedRoleTaskCount,
        preferChinese: params.preferChinese,
      }),
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow,
      projectSnapshot: projectResult.projectSnapshot,
      autoCreatedProject: projectResult.autoCreatedProject,
      providerData: {},
      content,
      taskRefs: imageExecution.taskRefs,
    });
  }

  private async handleShotReview(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    userInput: string;
    preferChinese: boolean;
    imageModel: AiModel;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'prepare_shots' | 'revise_shots';
    onStatus?: (message: string) => void;
  }) {
    if (
      params.action === 'prepare_shots'
      && params.previousWorkflow?.stage === 'project_setup_confirmation'
      && params.projectSnapshot
    ) {
      const setupExecutionStatus = await this.loadProjectSetupExecutionStatus({
        userId: params.userId,
        projectId: BigInt(params.projectSnapshot.id),
        workflow: params.previousWorkflow,
      });
      const hasVisibleRoleImageCoverage = this.hasProjectSetupAssetCoverage({
        workflow: params.previousWorkflow,
        projectSnapshot: params.projectSnapshot,
      });

      if (setupExecutionStatus.pendingTaskRefs.length > 0) {
        throw new BadRequestException(
          params.preferChinese
            ? '角色图任务仍在执行中，需等待全部完成后才能进入分镜剧本阶段。'
            : 'Role image tasks are still running. Wait until all finish before entering storyboard drafting.',
        );
      }

      if (
        setupExecutionStatus.expectedPlanCount > 0
        && !setupExecutionStatus.readyToProceed
        && !hasVisibleRoleImageCoverage
      ) {
        throw new BadRequestException(
          params.preferChinese
            ? '角色图尚未全部生成成功，暂时不能进入分镜剧本阶段。'
            : 'Not all role images have completed successfully yet, so storyboard drafting is not available.',
        );
      }
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：分镜剧本+时长方案待审阅】'
        : '[Progress: shot review]',
    );

    const requestedShotDuration = this.extractRequestedShotDuration(params.userInput, params.videoModel);

    const draft = await this.createShotReviewDraft({
      action: params.action,
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      currentWorkflow: params.previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      imageModel: params.imageModel,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
      preferredResolution: params.autoProjectAgent.preferredResolution,
      preferredDuration: requestedShotDuration,
    });

    const content = this.buildShotReviewReply({
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      preferChinese: params.preferChinese,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow: draft.workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: draft.providerData,
      content,
      taskRefs: [],
    });
  }

  private async handleShotGeneration(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    autoProjectAgent: AutoProjectAgentContext;
    preferChinese: boolean;
    videoModel: AiModel;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    action: 'generate_first' | 'generate_next';
    onStatus?: (message: string) => void;
  }) {
    const previousWorkflow = params.previousWorkflow;
    if (!previousWorkflow || previousWorkflow.stage !== 'shot_review') {
      throw new BadRequestException('Storyboard review is not ready for generation');
    }
    if (!params.projectSnapshot) {
      throw new BadRequestException('Project must exist before generating storyboard videos');
    }

    const activeVideoTaskCount = await this.countActiveProjectVideoTasks(
      params.userId,
      BigInt(params.projectSnapshot.id),
    );
    if (activeVideoTaskCount > 0) {
      const workflow = {
        ...previousWorkflow,
        progressLabel: this.getWorkflowProgressLabel('shot_generation', params.preferChinese),
      };
      const content = this.buildShotGenerationReply({
        workflow,
        projectSnapshot: params.projectSnapshot,
        preferChinese: params.preferChinese,
        createdShotIndex: null,
        createdShotTitle: null,
        taskRefs: [],
        failures: [
          params.preferChinese
            ? '当前已有分镜视频任务在执行，请等待完成后再继续下一镜。'
            : 'A storyboard video task is already running. Wait until it finishes before continuing.',
        ],
      });

      return this.buildCompletionResult({
        autoProjectAgent: params.autoProjectAgent,
        workflow,
        projectSnapshot: params.projectSnapshot,
        autoCreatedProject: false,
        providerData: {},
        content,
        taskRefs: [],
      });
    }

    const target = await this.resolveNextShotExecutionTarget({
      userId: params.userId,
      projectId: BigInt(params.projectSnapshot.id),
      workflow: previousWorkflow,
      projectSnapshot: params.projectSnapshot,
      videoModel: params.videoModel,
      preferChinese: params.preferChinese,
    });

    if (target.kind === 'blocked') {
      const workflow = {
        ...previousWorkflow,
        progressLabel: target.progressLabel,
      };
      const content = this.buildShotGenerationReply({
        workflow,
        projectSnapshot: params.projectSnapshot,
        preferChinese: params.preferChinese,
        createdShotIndex: null,
        createdShotTitle: null,
        taskRefs: [],
        failures: [target.message],
      });

      return this.buildCompletionResult({
        autoProjectAgent: params.autoProjectAgent,
        workflow,
        projectSnapshot: params.projectSnapshot,
        autoCreatedProject: false,
        providerData: {},
        content,
        taskRefs: [],
      });
    }

    params.onStatus?.(
      params.preferChinese
        ? '【当前进度：分镜视频生成中】'
        : '[Progress: generating storyboard video]',
    );

    const executed = await this.executeAutoProjectShotPlans({
      userId: params.userId,
      conversationId: params.conversationId,
      conversation: params.conversation,
      projectId: BigInt(params.projectSnapshot.id),
      projectSnapshot: params.projectSnapshot,
      videoModel: params.videoModel,
      autoProjectAgent: params.autoProjectAgent,
      shots: [target.value.shot],
      preferChinese: params.preferChinese,
      onStatus: params.onStatus,
      workflow: previousWorkflow,
      continuityReferences: target.value.continuityReferences,
    });

    const workflow: AutoProjectWorkflow = {
      ...previousWorkflow,
      progressLabel: this.getWorkflowProgressLabel('shot_generation', params.preferChinese),
      generationMode: 'step',
      generatedShotIds: [...new Set([...previousWorkflow.generatedShotIds, ...executed.generatedShotIds])],
      skippedShotIds: previousWorkflow.skippedShotIds,
    };

    const content = this.buildShotGenerationReply({
      workflow,
      projectSnapshot: params.projectSnapshot,
      preferChinese: params.preferChinese,
      createdShotIndex: target.value.shotIndex,
      createdShotTitle: target.value.shot.title,
      taskRefs: executed.taskRefs,
      failures: executed.failures,
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: {},
      content,
      taskRefs: executed.taskRefs,
    });
  }

  private async handleConfirmSkipShot(params: {
    autoProjectAgent: AutoProjectAgentContext;
    preferChinese: boolean;
    previousWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
  }) {
    const previousWorkflow = params.previousWorkflow;
    if (!previousWorkflow || previousWorkflow.stage !== 'shot_review') {
      throw new BadRequestException('Storyboard review is not ready for skip confirmation');
    }

    const nextPending = this.getNextPendingShot(previousWorkflow);
    if (!nextPending) {
      const workflow = {
        ...previousWorkflow,
        progressLabel: this.getWorkflowProgressLabel('shot_generation', params.preferChinese),
      };
      const content = this.buildShotGenerationReply({
        workflow,
        projectSnapshot: params.projectSnapshot,
        preferChinese: params.preferChinese,
        createdShotIndex: null,
        createdShotTitle: null,
        taskRefs: [],
        failures: [
          params.preferChinese
            ? '没有可跳过的待处理分镜。'
            : 'There is no pending shot to skip.',
        ],
      });

      return this.buildCompletionResult({
        autoProjectAgent: params.autoProjectAgent,
        workflow,
        projectSnapshot: params.projectSnapshot,
        autoCreatedProject: false,
        providerData: {},
        content,
        taskRefs: [],
      });
    }

    if (nextPending.shot.generationDecision !== 'skip') {
      const workflow = {
        ...previousWorkflow,
        progressLabel: this.getWorkflowProgressLabel('shot_review', params.preferChinese),
      };
      const content = this.buildShotReviewReply({
        workflow,
        projectSnapshot: params.projectSnapshot,
        preferChinese: params.preferChinese,
        executionSummary: params.preferChinese
          ? `当前待处理的第 ${nextPending.index + 1} 镜并未被标记为建议跳过。`
          : `The next pending shot #${nextPending.index + 1} is not marked for skipping.`,
      });

      return this.buildCompletionResult({
        autoProjectAgent: params.autoProjectAgent,
        workflow,
        projectSnapshot: params.projectSnapshot,
        autoCreatedProject: false,
        providerData: {},
        content,
        taskRefs: [],
      });
    }

    const workflow: AutoProjectWorkflow = {
      ...previousWorkflow,
      progressLabel: this.getWorkflowProgressLabel('shot_generation', params.preferChinese),
      skippedShotIds: [...new Set([...previousWorkflow.skippedShotIds, nextPending.shot.id])],
    };

    const content = this.buildShotGenerationReply({
      workflow,
      projectSnapshot: params.projectSnapshot,
      preferChinese: params.preferChinese,
      createdShotIndex: null,
      createdShotTitle: null,
      taskRefs: [],
      failures: [
        params.preferChinese
          ? `已确认跳过第 ${nextPending.index + 1} 镜：${nextPending.shot.title}`
          : `Confirmed skip for shot #${nextPending.index + 1}: ${nextPending.shot.title}`,
      ],
    });

    return this.buildCompletionResult({
      autoProjectAgent: params.autoProjectAgent,
      workflow,
      projectSnapshot: params.projectSnapshot,
      autoCreatedProject: false,
      providerData: {},
      content,
      taskRefs: [],
    });
  }

  private async createProjectPlanReviewDraft(input: {
    action: 'start_project_plan' | 'revise_project_plan';
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    currentWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot;
    imageModel: AiModel;
    videoModel: AiModel;
    preferChinese: boolean;
  }): Promise<AutoProjectDraftResult> {
    const completion = await this.requestAutoProjectWorkflowDraft({
      conversation: input.conversation,
      recentMessages: input.recentMessages,
      action: input.action,
      project: input.projectSnapshot,
      currentWorkflow: input.currentWorkflow,
      imageModel: input.imageModel,
      videoModel: input.videoModel,
    });

    const recommendedNextStage =
      completion.parsed.recommendedNextStage
      ?? this.buildProjectPlanFallbackStage({
        projectSnapshot: input.projectSnapshot,
        currentWorkflow: input.currentWorkflow,
      });

    const workflow = this.sanitizeAutoProjectWorkflowReferences(
      {
        stage: 'project_plan_review',
        progressLabel: this.getWorkflowProgressLabel('project_plan_review', input.preferChinese),
        outlineTitle: input.currentWorkflow?.outlineTitle ?? completion.parsed.outlineTitle ?? null,
        outline: input.currentWorkflow?.outline ?? completion.parsed.outline ?? [],
        characters: input.currentWorkflow?.characters ?? completion.parsed.characters ?? [],
        imagePlans: input.currentWorkflow?.imagePlans ?? completion.parsed.imagePlans ?? [],
        shots: input.currentWorkflow?.shots ?? completion.parsed.shots ?? [],
        generationMode: input.currentWorkflow?.generationMode ?? null,
        generatedShotIds: input.currentWorkflow?.generatedShotIds ?? [],
        skippedShotIds: input.currentWorkflow?.skippedShotIds ?? [],
        proposedProjectName:
          completion.parsed.projectName
          || input.currentWorkflow?.proposedProjectName
          || null,
        proposedProjectDescription:
          completion.parsed.projectDescription
          || input.currentWorkflow?.proposedProjectDescription
          || null,
        recommendedNextStage,
      },
      new Set(input.projectSnapshot.assets.map((asset) => asset.id)),
    );

    return {
      workflow,
      modelSummary: completion.parsed.reply,
      providerData: completion.providerData,
    };
  }

  private async createOutlineReviewDraft(input: {
    action: 'start_outline' | 'revise_outline';
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    currentWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    imageModel: AiModel;
    videoModel: AiModel;
    preferChinese: boolean;
  }): Promise<AutoProjectDraftResult> {
    const completion = await this.requestAutoProjectWorkflowDraft({
      conversation: input.conversation,
      recentMessages: input.recentMessages,
      action: input.action,
      project: input.projectSnapshot,
      currentWorkflow: input.currentWorkflow,
      imageModel: input.imageModel,
      videoModel: input.videoModel,
    });

    const outlineTitle =
      completion.parsed.outlineTitle
      || input.currentWorkflow?.outlineTitle
      || completion.parsed.projectName
      || input.projectSnapshot?.name
      || null;
    const outline = completion.parsed.outline.length > 0
      ? completion.parsed.outline
      : input.currentWorkflow?.outline ?? [];

    const workflow: AutoProjectWorkflow = {
      stage: 'outline_review',
      progressLabel: this.getWorkflowProgressLabel('outline_review', input.preferChinese),
      outlineTitle,
      outline,
      characters: [],
      imagePlans: [],
      shots: [],
      generationMode: null,
      generatedShotIds: [],
      skippedShotIds: [],
      proposedProjectName: null,
      proposedProjectDescription: null,
      recommendedNextStage: 'character_review',
    };

    return {
      workflow,
      modelSummary: completion.parsed.reply,
      providerData: completion.providerData,
    };
  }

  private async createCharacterReviewDraft(input: {
    action: 'approve_outline' | 'revise_characters';
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    currentWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    imageModel: AiModel;
    videoModel: AiModel;
    preferChinese: boolean;
  }): Promise<AutoProjectDraftResult> {
    const completion = await this.requestAutoProjectWorkflowDraft({
      conversation: input.conversation,
      recentMessages: input.recentMessages,
      action: input.action,
      project: input.projectSnapshot,
      currentWorkflow: input.currentWorkflow,
      imageModel: input.imageModel,
      videoModel: input.videoModel,
    });

    const workflow: AutoProjectWorkflow = {
      stage: 'character_review',
      progressLabel: this.getWorkflowProgressLabel('character_review', input.preferChinese),
      outlineTitle: input.currentWorkflow?.outlineTitle ?? completion.parsed.outlineTitle ?? null,
      outline: input.currentWorkflow?.outline ?? completion.parsed.outline ?? [],
      characters:
        completion.parsed.characters.length > 0
          ? completion.parsed.characters
          : input.currentWorkflow?.characters ?? [],
      imagePlans: [],
      shots: [],
      generationMode: null,
      generatedShotIds: [],
      skippedShotIds: [],
      proposedProjectName: null,
      proposedProjectDescription: null,
      recommendedNextStage: 'project_setup_confirmation',
    };

    return {
      workflow,
      modelSummary: completion.parsed.reply,
      providerData: completion.providerData,
    };
  }

  private async createProjectSetupReviewDraft(input: {
    action: 'approve_characters' | 'revise_project_setup';
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    currentWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    imageModel: AiModel;
    videoModel: AiModel;
    preferChinese: boolean;
    userInput: string;
  }): Promise<AutoProjectDraftResult> {
    const completion = await this.requestAutoProjectWorkflowDraft({
      conversation: input.conversation,
      recentMessages: input.recentMessages,
      action: input.action,
      project: input.projectSnapshot,
      currentWorkflow: input.currentWorkflow,
      imageModel: input.imageModel,
      videoModel: input.videoModel,
    });

    const baseWorkflow = input.currentWorkflow;
    const unsanitizedWorkflow: AutoProjectWorkflow = {
      stage: 'project_setup_confirmation',
      progressLabel: this.getWorkflowProgressLabel('project_setup_confirmation', input.preferChinese),
      outlineTitle: baseWorkflow?.outlineTitle ?? completion.parsed.outlineTitle ?? null,
      outline: baseWorkflow?.outline ?? completion.parsed.outline ?? [],
      characters:
        completion.parsed.characters.length > 0
          ? completion.parsed.characters
          : baseWorkflow?.characters ?? [],
      imagePlans:
        completion.parsed.imagePlans.length > 0
          ? completion.parsed.imagePlans
          : baseWorkflow?.imagePlans ?? [],
      shots: [],
      generationMode: null,
      generatedShotIds: [],
      skippedShotIds: [],
      proposedProjectName:
        completion.parsed.projectName
        || baseWorkflow?.proposedProjectName
        || input.projectSnapshot?.name
        || this.buildAutoProjectFallbackName(input.userInput, input.preferChinese),
      proposedProjectDescription:
        completion.parsed.projectDescription
        || baseWorkflow?.proposedProjectDescription
        || input.projectSnapshot?.description
        || this.buildProjectDescriptionFallback(baseWorkflow),
      recommendedNextStage: 'shot_review',
    };

    const workflow = this.sanitizeAutoProjectWorkflowPreferences({
      workflow: this.sanitizeAutoProjectWorkflowReferences(
        unsanitizedWorkflow,
        new Set(input.projectSnapshot?.assets.map((asset) => asset.id) ?? []),
      ),
      imageModel: input.imageModel,
      videoModel: input.videoModel,
    });

    return {
      workflow,
      modelSummary: completion.parsed.reply,
      providerData: completion.providerData,
    };
  }

  private async createShotReviewDraft(input: {
    action: 'prepare_shots' | 'revise_shots';
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    currentWorkflow: AutoProjectWorkflow | null;
    projectSnapshot: AutoProjectSnapshot | null;
    imageModel: AiModel;
    videoModel: AiModel;
    preferChinese: boolean;
    preferredResolution: string | null;
    preferredDuration: string | null;
  }): Promise<AutoProjectDraftResult> {
    const completion = await this.requestAutoProjectWorkflowDraft({
      conversation: input.conversation,
      recentMessages: input.recentMessages,
      action: input.action,
      project: input.projectSnapshot,
      currentWorkflow: input.currentWorkflow,
      imageModel: input.imageModel,
      videoModel: input.videoModel,
      preferredShotDuration: input.preferredDuration,
    });

    const assetIds = new Set(input.projectSnapshot?.assets.map((asset) => asset.id) ?? []);
    const sanitizedWorkflow = this.sanitizeAutoProjectWorkflowPreferences({
      workflow: this.sanitizeAutoProjectWorkflowReferences(
        {
          stage: 'shot_review',
          progressLabel: this.getWorkflowProgressLabel('shot_review', input.preferChinese),
          outlineTitle: input.currentWorkflow?.outlineTitle ?? completion.parsed.outlineTitle ?? null,
          outline: input.currentWorkflow?.outline ?? completion.parsed.outline ?? [],
          characters:
            completion.parsed.characters.length > 0
              ? completion.parsed.characters
              : input.currentWorkflow?.characters ?? [],
          imagePlans:
            completion.parsed.imagePlans.length > 0
              ? completion.parsed.imagePlans
              : input.currentWorkflow?.imagePlans ?? [],
          shots:
            completion.parsed.shots.length > 0
              ? completion.parsed.shots
              : input.currentWorkflow?.shots ?? [],
          generationMode: input.currentWorkflow?.generationMode ?? null,
          generatedShotIds: this.preserveAutoProjectGeneratedShotIds({
            previousWorkflow: input.currentWorkflow,
            nextShots:
              completion.parsed.shots.length > 0
                ? completion.parsed.shots
                : input.currentWorkflow?.shots ?? [],
          }),
          skippedShotIds: this.preserveAutoProjectSkippedShotIds({
            previousWorkflow: input.currentWorkflow,
            nextShots:
              completion.parsed.shots.length > 0
                ? completion.parsed.shots
                : input.currentWorkflow?.shots ?? [],
          }),
          proposedProjectName:
            input.currentWorkflow?.proposedProjectName
            || completion.parsed.projectName
            || input.projectSnapshot?.name
            || null,
          proposedProjectDescription:
            input.currentWorkflow?.proposedProjectDescription
            || completion.parsed.projectDescription
            || input.projectSnapshot?.description
            || null,
          recommendedNextStage: 'shot_review',
        },
        assetIds,
      ),
      imageModel: input.imageModel,
      videoModel: input.videoModel,
      preferredVideoResolution: input.preferredResolution,
      preferredVideoDuration: input.preferredDuration,
    });
    const workflow = this.ensureWanxR2vFirstShotReferenceImageIntent({
      workflow: sanitizedWorkflow,
      projectSnapshot: input.projectSnapshot,
      videoModel: input.videoModel,
    });

    return {
      workflow,
      modelSummary: completion.parsed.reply,
      providerData: completion.providerData,
    };
  }

  private async requestAutoProjectWorkflowDraft(input: {
    conversation: AutoProjectConversationContext;
    recentMessages: AutoProjectRecentMessage[];
    action: AutoProjectWorkflowAction;
    project: AutoProjectSnapshot | null;
    currentWorkflow: AutoProjectWorkflow | null;
    imageModel: AiModel;
    videoModel: AiModel;
    preferredShotDuration?: string | null;
  }) {
    const upstreamMessages = this.toUpstreamMessages(input.recentMessages, {
      includeImages: Boolean(input.conversation.model.supportsImageInput),
    });
    const completion = await this.requestChatCompletion(
      input.conversation,
      this.injectSystemContextIntoUpstream(
        upstreamMessages,
        input.conversation.model.systemPrompt,
        this.buildAutoProjectWorkflowSystemPrompt({
          action: input.action,
          project: input.project,
          imageModel: input.imageModel,
          videoModel: input.videoModel,
          currentWorkflow: input.currentWorkflow,
          preferredShotDuration: input.preferredShotDuration ?? null,
        }),
      ),
    );

    return {
      parsed: this.parseAutoProjectWorkflowResponse(completion.content, input.currentWorkflow),
      providerData:
        completion.providerData && typeof completion.providerData === 'object'
          ? { ...(completion.providerData as Record<string, unknown>) }
          : {},
    };
  }

  private async ensureAutoProjectExistsForSetup(input: {
    userId: bigint;
    autoProjectAgent: AutoProjectAgentContext;
    projectSnapshot: AutoProjectSnapshot | null;
    workflow: AutoProjectWorkflow;
    preferChinese: boolean;
    recentMessages: AutoProjectRecentMessage[];
  }) {
    const nextName = (input.workflow.proposedProjectName || input.projectSnapshot?.name || '').trim();
    const nextDescription = (
      input.workflow.proposedProjectDescription
      || input.projectSnapshot?.description
      || this.buildProjectDescriptionFallback(input.workflow)
      || ''
    ).trim();
    const conceptText = this.buildProjectConceptFromWorkflow(input.workflow)
      || this.extractLatestMeaningfulProjectIdea(input.recentMessages)
      || nextDescription
      || null;

    if (input.projectSnapshot) {
      const shouldUpdateName = Boolean(nextName) && nextName !== input.projectSnapshot.name;
      const shouldUpdateDescription = nextDescription !== (input.projectSnapshot.description ?? '');

      if (shouldUpdateName || shouldUpdateDescription) {
        const updated = await this.prisma.project.update({
          where: { id: BigInt(input.projectSnapshot.id) },
          data: {
            ...(shouldUpdateName ? { name: nextName.slice(0, 120) } : {}),
            ...(shouldUpdateDescription ? { description: nextDescription || null } : {}),
          },
        });

        return {
          autoCreatedProject: false,
          projectSnapshot: {
            ...input.projectSnapshot,
            name: updated.name,
            description: updated.description,
          },
        };
      }

      return {
        autoCreatedProject: false,
        projectSnapshot: input.projectSnapshot,
      };
    }

    if (!input.autoProjectAgent.createProjectIfMissing) {
      throw new BadRequestException('Project creation is disabled for the current auto workflow');
    }

    const created = await this.prisma.project.create({
      data: {
        userId: input.userId,
        name: (nextName || this.buildAutoProjectFallbackName(conceptText || '', input.preferChinese)).slice(0, 120),
        concept: this.truncateAutoProjectText(conceptText, 3000) || null,
        description: this.truncateAutoProjectText(nextDescription, 5000) || null,
      },
    });

    return {
      autoCreatedProject: true,
      projectSnapshot: {
        id: created.id.toString(),
        name: created.name,
        concept: created.concept,
        description: created.description,
        assets: [],
        inspirations: [],
      } satisfies AutoProjectSnapshot,
    };
  }

  private async resolvePreviousAutoProjectMetadata(input: {
    userId: bigint;
    recentMessages: AutoProjectRecentMessage[];
    autoProjectAgent: AutoProjectAgentContext;
    selectedProjectId: string | null;
  }) {
    const recentMetadata = this.extractLatestAutoProjectAgentMetadata(input.recentMessages);
    if (
      recentMetadata
      && this.isCompatibleWorkflowContext(recentMetadata, input.autoProjectAgent, input.selectedProjectId)
    ) {
      return recentMetadata;
    }

    if (input.selectedProjectId) {
      return this.findLatestStoredWorkflowForProject({
        userId: input.userId,
        projectId: input.selectedProjectId,
        imageModelId: input.autoProjectAgent.imageModelId,
        videoModelId: input.autoProjectAgent.videoModelId,
      });
    }

    return null;
  }

  private resolveLockedAutoProjectAgent(input: {
    autoProjectAgent: AutoProjectAgentContext;
    previousMetadata: AutoProjectAgentMetadata | null;
    preferChinese: boolean;
  }): AutoProjectAgentContext {
    const lockedPreferredResolution = input.previousMetadata?.preferredResolution ?? null;
    if (!lockedPreferredResolution) {
      return input.autoProjectAgent;
    }

    if (
      input.autoProjectAgent.preferredResolution
      && input.autoProjectAgent.preferredResolution !== lockedPreferredResolution
    ) {
      throw new BadRequestException(
        input.preferChinese
          ? `当前项目的视频生成分辨率已锁定为 ${lockedPreferredResolution}，后续不能修改。`
          : `The storyboard video resolution is already locked to ${lockedPreferredResolution} and cannot be changed.`,
      );
    }

    return {
      ...input.autoProjectAgent,
      preferredResolution: lockedPreferredResolution,
    };
  }

  private isCompatibleWorkflowContext(
    previousMetadata: AutoProjectAgentMetadata,
    autoProjectAgent: AutoProjectAgentContext,
    selectedProjectId: string | null,
  ) {
    const previousProjectId = previousMetadata.projectId ?? null;
    const currentProjectId = selectedProjectId ?? autoProjectAgent.projectId ?? null;

    return (
      previousMetadata.imageModelId === autoProjectAgent.imageModelId
      && previousMetadata.videoModelId === autoProjectAgent.videoModelId
      && previousProjectId === currentProjectId
    );
  }

  private async findLatestStoredWorkflowForProject(input: {
    userId: bigint;
    projectId: string;
    imageModelId: string;
    videoModelId: string;
  }) {
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId: input.userId,
        role: ChatMessageRole.assistant,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        providerData: true,
      },
    });

    for (const row of rows) {
      const metadata = extractAutoProjectAgentFromProviderData(row.providerData ?? null);
      if (!metadata?.workflow) continue;
      if (metadata.projectId !== input.projectId) continue;
      if (metadata.imageModelId !== input.imageModelId) continue;
      if (metadata.videoModelId !== input.videoModelId) continue;
      return metadata;
    }

    return null;
  }

  private async loadProjectSetupImageTaskEntries(userId: bigint, projectId: bigint): Promise<AutoProjectSetupImageTaskEntry[]> {
    const rows = await this.prisma.imageTask.findMany({
      where: {
        userId,
        projectId,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
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
        providerData: true,
      },
    });

    const out: AutoProjectSetupImageTaskEntry[] = [];

    for (const row of rows) {
      const metadata = extractAutoProjectAssetMetadata(row.providerData);
      if (!metadata) continue;
      if (metadata.workflowStage !== 'project_setup_confirmation' && metadata.finalStoryboard !== false) {
        continue;
      }

      out.push({
        metadata,
        createdAt: row.createdAt,
        taskRef: {
          kind: 'image',
          taskId: row.id.toString(),
          taskNo: row.taskNo,
          status:
            row.status === TaskStatus.pending
              ? 'pending'
              : row.status === TaskStatus.processing
                ? 'processing'
                : row.status === TaskStatus.completed
                  ? 'completed'
                  : row.status === TaskStatus.failed
                    ? 'failed'
                    : undefined,
          modelId: row.modelId?.toString(),
          provider: row.provider,
          prompt: row.prompt,
          thumbnailUrl: row.thumbnailUrl,
          resultUrl: row.resultUrl,
          errorMessage: row.errorMessage,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        },
      });
    }

    return out;
  }

  private async loadProjectSetupExecutionStatus(input: {
    userId: bigint;
    projectId: bigint;
    workflow: AutoProjectWorkflow;
  }): Promise<AutoProjectSetupExecutionStatus> {
    const taskEntries = await this.loadProjectSetupImageTaskEntries(input.userId, input.projectId);
    const matchedTasks = this.matchExistingProjectSetupTasks({
      plans: input.workflow.imagePlans,
      taskEntries,
    });
    const completedTaskRefs = matchedTasks.reusableTaskRefs.filter((taskRef) => this.isSetupTaskCompleted(taskRef));
    const pendingTaskRefs = matchedTasks.reusableTaskRefs.filter((taskRef) => this.isSetupTaskPending(taskRef));
    const expectedPlanCount = input.workflow.imagePlans.length;
    const hasCompletedCoverage = this.hasCompletedProjectSetupCoverage({
      workflow: input.workflow,
      taskEntries,
    });
    const readyToProceed =
      ((expectedPlanCount === 0 || completedTaskRefs.length >= expectedPlanCount) || hasCompletedCoverage)
      && pendingTaskRefs.length === 0
      && (matchedTasks.pendingPlans.length === 0 || hasCompletedCoverage);

    return {
      expectedPlanCount,
      reusableTaskRefs: matchedTasks.reusableTaskRefs,
      completedTaskRefs,
      pendingTaskRefs,
      pendingPlans: matchedTasks.pendingPlans,
      readyToProceed,
    };
  }

  private hasProjectSetupAssetCoverage(input: {
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot;
  }) {
    const imageAssets = input.projectSnapshot.assets.filter((asset) => asset.kind === 'image');
    if (imageAssets.length === 0) return false;

    const taggedRoleImageAssets = imageAssets.filter((asset) =>
      asset.workflowStage === 'project_setup_confirmation' || asset.finalStoryboard === false,
    );
    const expectedPlanCount = input.workflow.imagePlans.length;
    const expectedCharacterIds = [
      ...new Set(
        (
          input.workflow.imagePlans.flatMap((plan) => plan.referenceCharacterIds)
            .concat(input.workflow.characters.map((character) => character.id))
        )
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ];

    if (taggedRoleImageAssets.length > 0) {
      const coveredCharacterIds = new Set(
        taggedRoleImageAssets.flatMap((asset) => asset.referenceCharacterIds.map((id) => id.trim()).filter(Boolean)),
      );

      if (
        expectedCharacterIds.length > 0
        && coveredCharacterIds.size > 0
        && expectedCharacterIds.every((characterId) => coveredCharacterIds.has(characterId))
      ) {
        return true;
      }

      const expectedCount =
        expectedPlanCount
        || expectedCharacterIds.length
        || 0;
      if (expectedCount === 0) return true;
      if (taggedRoleImageAssets.length >= expectedCount) return true;
    }

    const visibleImageThreshold =
      expectedPlanCount
      || expectedCharacterIds.length
      || 1;

    return imageAssets.length >= visibleImageThreshold;
  }

  private hasCompletedProjectSetupCoverage(input: {
    workflow: AutoProjectWorkflow;
    taskEntries: AutoProjectSetupImageTaskEntry[];
  }) {
    const completedEntries = input.taskEntries.filter((entry) => this.isSetupTaskCompleted(entry.taskRef));
    if (completedEntries.length === 0) return false;

    const expectedPlanCount = input.workflow.imagePlans.length;
    const expectedCharacterSets = input.workflow.imagePlans
      .map((plan) => this.normalizeAutoProjectComparableList(plan.referenceCharacterIds))
      .filter((ids) => ids.length > 0);
    const completedCharacterSets = completedEntries
      .map((entry) => this.normalizeAutoProjectComparableList(entry.metadata.referenceCharacterIds ?? []))
      .filter((ids) => ids.length > 0);

    if (expectedCharacterSets.length > 0 && completedCharacterSets.length > 0) {
      const allCharacterSetsCovered = expectedCharacterSets.every((expectedIds) =>
        completedCharacterSets.some((completedIds) =>
          JSON.stringify(completedIds) === JSON.stringify(expectedIds),
        ),
      );

      if (allCharacterSetsCovered) {
        return true;
      }
    }

    return expectedPlanCount > 0 && completedEntries.length >= expectedPlanCount;
  }

  private matchExistingProjectSetupTasks(input: {
    plans: AutoProjectImagePlanItem[];
    taskEntries: AutoProjectSetupImageTaskEntry[];
  }): AutoProjectSetupTaskMatchResult {
    if (input.plans.length === 0 || input.taskEntries.length === 0) {
      return {
        reusableTaskRefs: [],
        pendingPlans: input.plans,
        totalMatchedPlans: 0,
      };
    }

    const usedTaskIds = new Set<string>();
    const reusableTaskRefs: ChatTaskRef[] = [];
    const pendingPlans: AutoProjectImagePlanItem[] = [];
    let totalMatchedPlans = 0;

    for (const plan of input.plans) {
      const matchedEntry = input.taskEntries
        .filter((entry) => !usedTaskIds.has(entry.taskRef.taskId))
        .filter((entry) => this.matchesProjectSetupTaskToPlan(plan, entry.metadata))
        .sort((left, right) => {
          const rankDiff = this.getProjectSetupTaskReuseRank(left.taskRef) - this.getProjectSetupTaskReuseRank(right.taskRef);
          if (rankDiff !== 0) return rankDiff;
          return right.createdAt.getTime() - left.createdAt.getTime();
        })[0];

      if (!matchedEntry) {
        pendingPlans.push(plan);
        continue;
      }

      usedTaskIds.add(matchedEntry.taskRef.taskId);
      totalMatchedPlans += 1;

      if (this.isReusableSetupTaskRef(matchedEntry.taskRef)) {
        reusableTaskRefs.push(matchedEntry.taskRef);
      } else {
        pendingPlans.push(plan);
      }
    }

    return {
      reusableTaskRefs,
      pendingPlans,
      totalMatchedPlans,
    };
  }

  private buildRecoveredProjectSetupWorkflow(input: {
    projectSnapshot: AutoProjectSnapshot;
    previousWorkflow: AutoProjectWorkflow | null;
    taskEntries: AutoProjectSetupImageTaskEntry[];
    preferChinese: boolean;
  }): AutoProjectWorkflow {
    const recoveredPlans = input.taskEntries
      .filter((entry) => this.isReusableSetupTaskRef(entry.taskRef))
      .map((entry, index) => ({
        id: entry.metadata.planId || `recovered-image-plan-${index + 1}`,
        title: entry.metadata.title,
        prompt:
          entry.metadata.sourcePrompt
          || entry.taskRef.prompt
          || entry.metadata.description
          || (input.preferChinese ? '已提交角色图任务' : 'Submitted role image task'),
        negativePrompt: null,
        referenceCharacterIds: entry.metadata.referenceCharacterIds ?? [],
        referenceAssetIds: entry.metadata.referenceAssetIds ?? [],
        preferredAspectRatio: null,
        preferredResolution: null,
      } satisfies AutoProjectImagePlanItem));

    const imagePlans = input.previousWorkflow?.imagePlans.length
      ? input.previousWorkflow.imagePlans
      : recoveredPlans;
    const hasPendingRoleTasks = input.taskEntries.some((entry) => this.isSetupTaskPending(entry.taskRef));
    const hasEnoughCompletedRoleTasks = recoveredPlans.length >= imagePlans.length;
    const hasAllRoleTasksCompleted =
      hasEnoughCompletedRoleTasks
      && input.taskEntries.length > 0
      && input.taskEntries.every((entry) => this.isSetupTaskCompleted(entry.taskRef));

    return {
      stage: 'project_setup_confirmation',
      progressLabel:
        hasPendingRoleTasks
          ? (input.preferChinese
            ? '角色图生成中，待全部完成后进入分镜阶段'
            : 'Role images generating, enter storyboard after all tasks finish')
          : hasAllRoleTasksCompleted
            ? (input.preferChinese
            ? '角色图已完成，可进入分镜阶段'
              : 'Role images completed, ready for storyboard drafting')
            : (input.preferChinese
              ? '角色图尚未全部就绪，可补齐或重新生成后再进入分镜阶段'
              : 'Role images are not fully ready yet. Complete or regenerate them before entering storyboard drafting.'),
      outlineTitle: input.previousWorkflow?.outlineTitle ?? input.projectSnapshot.name ?? null,
      outline: input.previousWorkflow?.outline ?? [],
      characters: input.previousWorkflow?.characters ?? [],
      imagePlans,
      shots: input.previousWorkflow?.shots ?? [],
      generationMode: input.previousWorkflow?.generationMode ?? null,
      generatedShotIds: input.previousWorkflow?.generatedShotIds ?? [],
      skippedShotIds: input.previousWorkflow?.skippedShotIds ?? [],
      proposedProjectName:
        input.previousWorkflow?.proposedProjectName
        || input.projectSnapshot.name
        || null,
      proposedProjectDescription:
        input.previousWorkflow?.proposedProjectDescription
        || input.projectSnapshot.description
        || null,
      recommendedNextStage: 'shot_review',
    };
  }

  private matchesProjectSetupTaskToPlan(
    plan: AutoProjectImagePlanItem,
    metadata: AutoProjectTaskAssetMetadata,
  ) {
    if (metadata.planId && metadata.planId === plan.id) {
      return true;
    }

    const planCharacterIds = this.normalizeAutoProjectComparableList(plan.referenceCharacterIds);
    const taskCharacterIds = this.normalizeAutoProjectComparableList(metadata.referenceCharacterIds ?? []);

    if (planCharacterIds.length > 0 && taskCharacterIds.length > 0) {
      return JSON.stringify(planCharacterIds) === JSON.stringify(taskCharacterIds);
    }

    if (this.normalizeAutoProjectCommand(metadata.title) !== this.normalizeAutoProjectCommand(plan.title)) {
      return false;
    }

    if (planCharacterIds.length === 0 || taskCharacterIds.length === 0) {
      return true;
    }

    return JSON.stringify(planCharacterIds) === JSON.stringify(taskCharacterIds);
  }

  private getProjectSetupTaskReuseRank(taskRef: ChatTaskRef) {
    if (taskRef.status === 'completed' || taskRef.resultUrl) return 0;
    if (taskRef.status === 'processing') return 1;
    if (taskRef.status === 'pending' || (!taskRef.status && !taskRef.resultUrl && !taskRef.errorMessage)) return 2;
    if (taskRef.status === 'failed') return 3;
    return 4;
  }

  private isReusableSetupTaskRef(taskRef: ChatTaskRef) {
    return this.getProjectSetupTaskReuseRank(taskRef) <= 2;
  }

  private isSetupTaskCompleted(taskRef: ChatTaskRef) {
    return taskRef.status === 'completed' || Boolean(taskRef.resultUrl);
  }

  private isSetupTaskPending(taskRef: ChatTaskRef) {
    return (
      taskRef.status === 'pending'
      || taskRef.status === 'processing'
      || (!taskRef.status && !taskRef.resultUrl && !taskRef.errorMessage)
    );
  }

  private isAutoProjectRegenerateRoleImagesCommand(value: string) {
    return this.matchesAutoProjectCommand(value, [
      '重新生成角色图',
      '重生成角色图',
      '重新生成全部角色图',
      '重做角色图',
      '重新出角色图',
      'regenerate role images',
      'regenerate characters',
      'rerun role images',
    ]);
  }

  private resolveAutoProjectWorkflowAction(input: {
    userInput: string;
    previousWorkflow: AutoProjectWorkflow | null;
    hasSelectedProject: boolean;
  }): AutoProjectWorkflowAction {
    const explicitCommand = this.resolveExplicitAutoProjectWorkflowCommand(
      input.userInput,
      input.previousWorkflow,
    );
    if (explicitCommand) return explicitCommand;

    const previousWorkflow = input.previousWorkflow;
    if (!previousWorkflow) {
      return input.hasSelectedProject ? 'start_project_plan' : 'start_outline';
    }

    if (
      this.matchesAutoProjectCommand(input.userInput, [
        '重新开始',
        '重开项目',
        '重新来',
        'restart workflow',
        'restart project',
        'new workflow',
      ])
    ) {
      return input.hasSelectedProject ? 'start_project_plan' : 'start_outline';
    }

    if (
      this.looksLikeFreshAutoProjectIdea(input.userInput)
      && !this.includesAutoProjectHint(input.userInput, [
        '大纲',
        '角色',
        '项目',
        '分镜',
        '镜头',
        '剧本',
        '时长',
        'outline',
        'character',
        'project',
        'shot',
        'storyboard',
        'script',
        'duration',
      ])
    ) {
      return input.hasSelectedProject ? 'start_project_plan' : 'start_outline';
    }

    if (this.isGenericAutoProjectContinueCommand(input.userInput)) {
      if (previousWorkflow.stage === 'project_plan_review') return 'confirm_project_plan';
      if (previousWorkflow.stage === 'outline_review') return 'approve_outline';
      if (previousWorkflow.stage === 'character_review') return 'approve_characters';
      if (previousWorkflow.stage === 'project_setup_confirmation') return 'confirm_project_setup';
    }

    const crossStageRevision = this.resolveCrossStageRevisionAction(
      input.userInput,
      previousWorkflow.stage,
    );
    if (crossStageRevision) return crossStageRevision;

    if (previousWorkflow.stage === 'project_plan_review') {
      return 'revise_project_plan';
    }
    if (previousWorkflow.stage === 'outline_review') {
      return 'revise_outline';
    }
    if (previousWorkflow.stage === 'character_review') {
      return 'revise_characters';
    }
    if (previousWorkflow.stage === 'project_setup_confirmation') {
      return 'revise_project_setup';
    }
    return 'revise_shots';
  }

  private resolveExplicitAutoProjectWorkflowCommand(
    value: string,
    previousWorkflow: AutoProjectWorkflow | null,
  ): AutoProjectWorkflowAction | null {
    if (
      this.matchesAutoProjectCommand(value, [
        '确认后续方案',
        '确认方案',
        '继续方案',
        'confirm plan',
        'confirm workflow plan',
        'continue plan',
      ])
    ) {
      return 'confirm_project_plan';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '确认大纲',
        '通过大纲',
        '大纲通过',
        'approve outline',
        'outline approved',
      ])
    ) {
      return 'approve_outline';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '确认角色设定',
        '确认角色',
        '通过角色',
        '角色通过',
        'approve characters',
        'characters approved',
      ])
    ) {
      return 'approve_characters';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '确认角色图生成+项目初始化',
        '确认项目初始化',
        '执行角色图生成',
        '确认角色图生成',
        '重新生成角色图',
        '重生成角色图',
        '重新生成全部角色图',
        'confirm project setup',
        'confirm setup',
        'regenerate role images',
      ])
    ) {
      return 'confirm_project_setup';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '进入分镜剧本+时长方案',
        '进入分镜方案',
        '准备分镜',
        '开始分镜',
        'proceed to storyboard',
        'enter storyboard',
        'prepare shots',
      ])
    ) {
      return 'prepare_shots';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '确认跳过当前分镜',
        '跳过当前分镜',
        'confirm skip shot',
        'confirm skip current shot',
      ])
    ) {
      return 'confirm_skip_shot';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '串行生成全部分镜',
        '生成全部分镜',
        '生成全部',
        'generate all',
        'generate all shots',
      ])
    ) {
      if (previousWorkflow?.stage !== 'shot_review') {
        return null;
      }

      return previousWorkflow.generatedShotIds.length > 0 ? 'generate_next' : 'generate_first';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '从第一镜开始生成',
        '生成第一镜',
        'generate first shot',
        'generate first',
      ])
    ) {
      return 'generate_first';
    }
    if (
      this.matchesAutoProjectCommand(value, [
        '生成下一镜',
        '继续生成下一镜',
        'generate next shot',
        'generate next',
      ])
    ) {
      return 'generate_next';
    }

    return null;
  }

  private resolveCrossStageRevisionAction(
    value: string,
    currentStage: AutoProjectWorkflowStage,
  ): AutoProjectWorkflowAction | null {
    const normalized = this.normalizeAutoProjectCommand(value);
    if (!normalized) return null;

    const candidates: Array<[AutoProjectWorkflowAction, string[]]> = [
      ['revise_outline', ['大纲', '结构', '节奏', '故事线', 'outline', 'beat', 'beats', 'story arc']],
      ['revise_characters', ['角色', '人物', '人设', 'character', 'characters', 'cast']],
      ['revise_project_setup', ['项目名', '项目名称', '项目描述', '角色图', '初始化', 'project name', 'project description', 'setup']],
      ['revise_shots', ['分镜', '镜头', '剧本', '脚本', '时长', 'storyboard', 'shot', 'shots', 'script', 'duration']],
    ];

    const stageOrder: Record<AutoProjectWorkflowStage, number> = {
      project_plan_review: 0,
      outline_review: 1,
      character_review: 2,
      project_setup_confirmation: 3,
      shot_review: 4,
    };
    const actionStageMap: Record<AutoProjectWorkflowAction, AutoProjectWorkflowStage> = {
      start_project_plan: 'project_plan_review',
      revise_project_plan: 'project_plan_review',
      confirm_project_plan: 'project_plan_review',
      start_outline: 'outline_review',
      revise_outline: 'outline_review',
      approve_outline: 'outline_review',
      revise_characters: 'character_review',
      approve_characters: 'character_review',
      revise_project_setup: 'project_setup_confirmation',
      confirm_project_setup: 'project_setup_confirmation',
      prepare_shots: 'shot_review',
      revise_shots: 'shot_review',
      generate_first: 'shot_review',
      generate_next: 'shot_review',
      confirm_skip_shot: 'shot_review',
    };

    for (const [action, hints] of candidates) {
      if (!this.includesAutoProjectHint(normalized, hints)) continue;
      const targetStage = actionStageMap[action];
      if (stageOrder[targetStage] <= stageOrder[currentStage]) {
        return action;
      }
    }

    return null;
  }

  private determineProjectPlanFollowupAction(
    workflow: AutoProjectWorkflow,
    projectSnapshot: AutoProjectSnapshot | null,
  ): AutoProjectWorkflowAction {
    const recommended = workflow.recommendedNextStage ?? 'outline_review';

    if (recommended === 'outline_review') {
      return workflow.outline.length > 0 ? 'revise_outline' : 'start_outline';
    }
    if (recommended === 'character_review') {
      if (workflow.characters.length > 0) return 'revise_characters';
      if (workflow.outline.length > 0) return 'approve_outline';
      return 'start_outline';
    }
    if (recommended === 'project_setup_confirmation') {
      if (
        workflow.imagePlans.length > 0
        || Boolean(workflow.proposedProjectName)
        || Boolean(workflow.proposedProjectDescription)
      ) {
        return 'revise_project_setup';
      }
      if (workflow.characters.length > 0) return 'approve_characters';
      if (workflow.outline.length > 0) return 'approve_outline';
      return 'start_outline';
    }
    if (recommended === 'shot_review') {
      if (workflow.shots.length > 0) return 'revise_shots';
      if (
        workflow.imagePlans.length > 0
        || Boolean(workflow.proposedProjectName)
        || Boolean(workflow.proposedProjectDescription)
      ) {
        return 'prepare_shots';
      }
      if (projectSnapshot && (projectSnapshot.assets.length > 0 || projectSnapshot.inspirations.length > 0)) {
        return 'prepare_shots';
      }
      if (workflow.characters.length > 0) return 'approve_characters';
      if (workflow.outline.length > 0) return 'approve_outline';
      return 'start_outline';
    }

    return workflow.outline.length > 0 ? 'revise_outline' : 'start_outline';
  }

  private buildProjectPlanFallbackStage(input: {
    projectSnapshot: AutoProjectSnapshot;
    currentWorkflow: AutoProjectWorkflow | null;
  }): AutoProjectWorkflowStage {
    const currentWorkflow = input.currentWorkflow;
    if (currentWorkflow?.shots.length) return 'shot_review';
    if (
      currentWorkflow?.imagePlans.length
      || currentWorkflow?.proposedProjectName
      || currentWorkflow?.proposedProjectDescription
    ) {
      return 'project_setup_confirmation';
    }
    if (currentWorkflow?.characters.length) return 'project_setup_confirmation';
    if (currentWorkflow?.outline.length) return 'character_review';
    if (input.projectSnapshot.assets.length > 0 || input.projectSnapshot.inspirations.length > 0) {
      return 'shot_review';
    }
    return 'outline_review';
  }

  private buildAutoProjectActionInstructions(action: AutoProjectWorkflowAction) {
    if (action === 'start_project_plan' || action === 'revise_project_plan') {
      return [
        '当前任务：读取现有项目状态，并推荐下一步明确的工作流阶段。',
        '不要生成任务，不要自动批准任何内容，也不要跳到图片或视频执行阶段。',
        '请返回简洁回复，说明当前已有内容、缺失内容，以及为什么 recommendedNextStage 是正确的下一步。',
        '只有当当前工作流里已经存在 outline/characters/imagePlans/shots 且你需要保留它们时，才填写这些字段。',
      ];
    }

    if (action === 'start_outline' || action === 'revise_outline') {
      return [
        '当前任务：为用户审阅准备项目大纲。',
        '返回 3 到 8 条大纲节拍。',
        '本次响应里的 characters、imagePlans、shots 必须保持为空。',
        '将 recommendedNextStage 设置为 "character_review"。',
      ];
    }

    if (action === 'approve_outline' || action === 'revise_characters') {
      return [
        '当前任务：为用户审阅准备完整的核心视觉主体名单。',
        '以已确认的大纲为唯一依据。',
        'characters[] 表示视频中核心且会反复出现的视觉主体。主体类型必须根据用户主题和片型来选择，可以是人物、动物、产品、车辆、星球、天体或其他非人主体。',
        '返回 1 到 8 个 characters。每个 characters[] 条目都必须包含 name、role、description、visualPrompt。role 可以描述主体功能或类别，不必限定为人物身份。',
        '当非人主体更符合题材时，禁止强行生成人类角色。',
        '这个阶段不能创建图片或场景。imagePlans 和 shots 必须保持为空。',
        '将 recommendedNextStage 设置为 "project_setup_confirmation"。',
      ];
    }

    if (action === 'approve_characters' || action === 'revise_project_setup') {
      return [
        '当前任务：准备项目初始化确认内容。',
        '返回 projectName、projectDescription，以及只面向核心主体建模/参考图的 imagePlans。',
        '这个阶段不要规划场景静帧、关键帧、内容图或视频素材任务。',
        '每个 imagePlan 都应对应一个核心主体建模/参考任务。',
        '即使主体不是人，也要继续使用 characters[] 和 referenceCharacterIds 作为通用主体锚点。',
        '每个主体图计划都必须是适合该主体类型的多视角建模/参考图。人物、动物、产品优先正面/侧面/背面/四分之三视角；星球、飞船或其他非人主体应使用最能保证一致性的多角度或正交参考视图，并明确写出所用视角组合。',
        '本次响应里的 shots 必须保持为空。',
        '将 recommendedNextStage 设置为 "shot_review"。',
      ];
    }

    return [
      '当前任务：为用户审阅准备分镜与时长方案。',
      '返回 1 到 12 个 shots。每个 shot 都对应一个未来可能创建的视频生成任务。',
      '如果故事长度超过 60 秒，请拆分成多个镜头，并明确控制每一镜时长。',
      '每个 shot 都必须包含 title、summary、script、duration、prompt、generationDecision、decisionReason。',
      '如果某一镜不应生成最终分镜视频，请将 generationDecision 设为 "skip"，并说明原因。',
      'referenceAssetIds 只能使用当前素材目录中已存在的 ID。',
      '如果当前视频模型要求首镜参考图，第一条 generationDecision 为 "generate" 的 shot 必须通过 referenceCharacterIds 或 referenceAssetIds 指向可用参考图片，并在 prompt 中写清使用参考图作为视觉锚点。',
      '不要创建任务，这仍然是审阅阶段。',
      '将 recommendedNextStage 设置为 "shot_review"。',
    ];
  }

  private buildAutoProjectWorkflowSystemPrompt(input: {
    action: AutoProjectWorkflowAction;
    project: AutoProjectSnapshot | null;
    imageModel: AiModel;
    videoModel: AiModel;
    currentWorkflow: AutoProjectWorkflow | null;
    preferredShotDuration?: string | null;
  }) {
    const imageCapabilities = buildModelCapabilities(input.imageModel as AiModel, null);
    const videoCapabilities = buildModelCapabilities(input.videoModel as AiModel, null);
    const imageOptions = getAutoProjectImageOptionCatalog(input.imageModel);
    const videoOptions = getAutoProjectVideoOptionCatalog(input.videoModel);
    const isWanxR2v = this.isWanxR2vVideoModel(input.videoModel);
    const projectAssetCatalog = input.project
      ? input.project.assets.map((asset, index) => {
          const parts = [
            this.buildAutoProjectReferenceLabel(asset.kind, index + 1),
            `[${asset.id}]`,
            asset.kind === 'video' ? '视频' : '图片',
            this.truncateAutoProjectText(asset.title, 80),
            this.truncateAutoProjectText(asset.description, 180),
            this.truncateAutoProjectText(asset.sourcePrompt, 200),
          ].filter((part) => part.length > 0);
          return parts.join(' | ');
        })
      : [];
    const inspirationCatalog = input.project
      ? input.project.inspirations.map((item) => {
          const episodeLabel = item.episodeNumber ? `第 ${item.episodeNumber} 集灵感` : '灵感';
          return [
            `${episodeLabel} | ${this.truncateAutoProjectText(item.title, 80)}`,
            this.truncateAutoProjectText(item.ideaText, 260),
            this.truncateAutoProjectText(item.contextText, 180),
            this.truncateAutoProjectText(item.plotText, 220),
            this.truncateAutoProjectText(item.generatedPrompt, 220),
          ]
            .filter((part) => part.length > 0)
            .join('\n');
        })
      : [];

    return [
      '你是一名分阶段创意导演，工作在一个必须由用户逐步确认的严格制作流程中。',
      `当前工作流动作（枚举值）："${input.action}"。必须严格按这个动作执行。`,
      '绝不能擅自假设用户已批准。除非执行层在草稿之外真的创建了任务，否则不要声称任务已经创建。',
      input.project
        ? `已选项目："${input.project.name}"。`
        : '当前还没有项目。你可以提出 projectName 和 projectDescription，但只有在用户确认后才会真正创建项目。',
      input.project?.concept
        ? `项目概念：\n${this.truncateAutoProjectText(input.project.concept, 1200)}`
        : null,
      input.project?.description
        ? `项目描述：\n${this.truncateAutoProjectText(input.project.description, 1800)}`
        : null,
      projectAssetCatalog.length > 0
        ? `当前素材目录（referenceAssetIds 只能使用这些 ID）：\n${projectAssetCatalog.join('\n')}`
        : '当前素材目录为空。',
      inspirationCatalog.length > 0
        ? `项目灵感记录：\n${inspirationCatalog.join('\n\n')}`
        : '当前还没有灵感记录。',
      `当前工作流 JSON：\n${JSON.stringify(input.currentWorkflow ?? null)}`,
      input.project?.description
        ? `最终提示词必须体现项目描述与主题：\n${this.truncateAutoProjectText(input.project.description, 1200)}`
        : input.currentWorkflow?.proposedProjectDescription
          ? `最终提示词必须体现拟定的项目描述与主题：\n${this.truncateAutoProjectText(input.currentWorkflow.proposedProjectDescription, 1200)}`
          : input.currentWorkflow?.outlineTitle
            ? `最终提示词必须体现大纲标题所暗示的项目主题："${this.truncateAutoProjectText(input.currentWorkflow.outlineTitle, 160)}"。`
            : null,
      `已选图片模型："${input.imageModel.name}"（${input.imageModel.provider}）。`,
      `图片模型是否支持上下文参考：${imageCapabilities.supports.contextualEdit ? '支持' : '不支持'}。`,
      `图片 preferredAspectRatio 可选值：${this.formatAutoProjectOptionList(imageOptions.aspectRatios)}。`,
      `图片 preferredResolution 可选值：${this.formatAutoProjectOptionList(imageOptions.resolutions)}。`,
      `已选视频模型："${input.videoModel.name}"（${input.videoModel.provider}）。`,
      `视频模型是否支持图片参考：${videoCapabilities.supports.imageInput ? '支持' : '不支持'}。`,
      `视频模型是否支持视频参考：${videoCapabilities.supports.videoInput ? '支持' : '不支持'}。`,
      `视频模型是否支持音频参考：${videoCapabilities.supports.audioInput ? '支持' : '不支持'}。`,
      `视频 preferredAspectRatio 可选值：${this.formatAutoProjectOptionList(videoOptions.aspectRatios)}。`,
      `视频 preferredResolution 可选值：${this.formatAutoProjectOptionList(videoOptions.resolutions)}。`,
      `视频 preferredDuration 可选值：${this.formatAutoProjectOptionList(videoOptions.durations)}。`,
      isWanxR2v
        ? '当前视频模型是万相 wan2.7-r2v：第一条需要生成的视频分镜必须有参考图片。规划阶段必须让首镜通过 referenceCharacterIds 绑定核心主体参考图；如果当前素材目录已经有合适图片，也可以同时填入对应 referenceAssetIds。首镜 shots[].prompt 必须明确写“使用参考图作为主体/场景视觉锚点并保持一致”。'
        : null,
      isWanxR2v
        ? '当前视频模型是万相 wan2.7-r2v：第二镜及以后系统会同时传入上一镜成片视频和上一镜尾帧图片。shots[].prompt 不要写成“重新开始的新画面”，必须承接上一镜尾段内容，并保持主体状态、动作方向、空间关系和情绪节奏连续。'
        : null,
      input.preferredShotDuration
        ? `本轮用户明确要求每个分镜时长为 ${input.preferredShotDuration} 秒；shots[].duration 必须统一填写 "${input.preferredShotDuration}"，shots[].prompt 内也必须以 ${input.preferredShotDuration} 秒为总时长拆成 3 段。`
        : null,
      '当某个 preference 字段没有可选值时，请返回 null。',
      '使用参考素材时，必须保留系统给出的方括号编号，例如 [图1]/[视频1]/[音频1]，并严格遵循上传顺序。数组索引 0 对应 [图1]/[视频1]/[音频1]。',
      'referenceAssetIds 与输入数组的映射顺序必须保持一致。',
      '禁止编造 referenceAssetIds。',
      'schema 字段名保持不变。characters[] 和 referenceCharacterIds 是通用主体锚点，既可以表示人物，也可以表示非人核心主体。',
      '必须根据用户主题与视频类型来选择核心主体，而不是强行设成人类角色。例如：纪录片可以聚焦动物或物种，广告片可以聚焦产品或包装，宇宙题材可以聚焦星球、恒星、飞船或其他天体。',
      'shots[].prompt 必须是实际可执行的分镜提示词，不能写成项目总结、阶段说明或角色/主体档案。',
      '避免空泛形容词堆砌。每条 prompt 都必须具体、可执行、可直接用于生产。',
      'shots[].prompt 不要求固定标题格式，但最终内容本身必须明确覆盖这些信息：镜头设定（景别、机位、单一主运镜、总时长）、剧情目标（主体是谁、做什么动作、保持什么情绪）、总时长拆成 3 段的执行逻辑（开场进入 / 中段主动作 / 结尾收束）、台词同步要求或无台词时的呼吸眼神肢体表达、可衔接下一镜头的结束姿态、一致性约束、风格补充、质量约束。',
      '每条 shots[].prompt 都必须把该镜总时长拆成 3 段来描述：开场进入、中段主动作、结尾收束。',
      '从第二镜开始，shots[].prompt 的“开场进入”必须直接承接上一镜 prompt 的“结尾收束”内容：上一镜尾段发生什么动作、场景变化或主体状态，下一镜首段就必须从同一动作后果、同一空间关系和同一主体状态继续，不能重新跳到无关开场。例如上一镜尾段是“水滴滴入池塘”，下一镜首段必须从水滴入水后的池塘、涟漪扩散或主体对该场景的反应继续。',
      '当 shots[].prompt 存在对白、口播或台词表演时，必须明确要求口型与停顿同步；当没有台词时，也要明确要求靠呼吸、眼神、肢体动作来表达情绪。',
      '当 shot 使用了参考图片、角色参考图或首帧参考图时，shots[].prompt 必须明确要求服装、场景、道具和主体造型保持稳定，不要漂移。',
      '风格词和基础动作描述不能丢，必须自然融入 shots[].prompt 的正文。',
      '质量约束必须明确强调动作连贯、物理合理、避免跳帧、避免面部或肢体变形。',
      '当 shots[].prompt 使用参考编号时，必须把编号绑定到明确主体描述上，例如“灰瓦[图1]”、“[图2]中的女孩”或“木纹香水瓶[图3]”。禁止把裸编号直接当主体。',
      '每一镜只保留一种主运镜方式。如存在互相冲突的推镜、左摇等指令，必须删到只剩一种清晰运镜。',
      '对于多主体或正面动态镜头，需要加入强空间锚点、服装/身份/造型锚点，并优先使用固定机位或简单单一运镜，以降低主体漂移。',
      'characters[].visualPrompt、imagePlans[].prompt、imagePlans[].negativePrompt、shots[].prompt 必须始终使用简体中文，必须体现项目主题/风格，并以质量与稳定性约束收尾，例如主体一致性、适用时的人脸一致性、结构或解剖干净、无变形、无穿模。',
      ...this.buildAutoProjectActionInstructions(input.action),
      '只返回合法 JSON。不要输出 markdown 代码块，不要在 JSON 对象之外输出任何说明文字。',
      '严格使用以下 JSON schema：',
      '{"reply":"string","recommendedNextStage":"project_plan_review|outline_review|character_review|project_setup_confirmation|shot_review|null","projectName":"string|null","projectDescription":"string|null","outlineTitle":"string|null","outline":[{"title":"string","summary":"string"}],"characters":[{"name":"string","role":"string","description":"string","visualPrompt":"string"}],"imagePlans":[{"title":"string","prompt":"string","negativePrompt":"string|null","referenceCharacterIds":["string"],"referenceAssetIds":["string"],"preferredAspectRatio":"string|null","preferredResolution":"string|null"}],"shots":[{"title":"string","summary":"string","script":"string","prompt":"string","duration":"string","referenceCharacterIds":["string"],"referenceAssetIds":["string"],"preferredAspectRatio":"string|null","preferredResolution":"string|null","generationDecision":"generate|skip","decisionReason":"string|null"}]}',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private parseAutoProjectWorkflowResponse(
    rawContent: string,
    previousWorkflow: AutoProjectWorkflow | null,
  ): ParsedAutoProjectWorkflowResponse {
    const raw = (rawContent || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || raw;
    const parsed = this.tryParseJson(candidate);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        reply: raw || 'Auto Project workflow updated.',
        projectName: previousWorkflow?.proposedProjectName ?? null,
        projectDescription: previousWorkflow?.proposedProjectDescription ?? null,
        outlineTitle: previousWorkflow?.outlineTitle ?? null,
        outline: previousWorkflow?.outline ?? [],
        characters: previousWorkflow?.characters ?? [],
        imagePlans: previousWorkflow?.imagePlans ?? [],
        shots: previousWorkflow?.shots ?? [],
        recommendedNextStage: previousWorkflow?.recommendedNextStage ?? null,
      };
    }

    const source = parsed as Record<string, unknown>;
    const recommendedNextStageRaw =
      typeof source.recommendedNextStage === 'string'
        ? source.recommendedNextStage.trim().toLowerCase()
        : '';

    return {
      reply:
        this.normalizeUpstreamContent(source.reply ?? source.message ?? source.summary).trim()
        || raw
        || 'Auto Project workflow updated.',
      projectName: this.normalizeAutoProjectShortText(source.projectName ?? source.name, 120) || null,
      projectDescription: this.normalizeUpstreamContent(source.projectDescription ?? source.description).trim() || null,
      outlineTitle:
        this.normalizeAutoProjectShortText(source.outlineTitle ?? source.title, 160)
        || previousWorkflow?.outlineTitle
        || null,
      outline: this.normalizeAutoProjectOutlineItems(
        Array.isArray(source.outline) ? source.outline : source.beats,
        previousWorkflow?.outline ?? [],
      ),
      characters: this.normalizeAutoProjectCharacters(
        Array.isArray(source.characters) ? source.characters : source.roles,
        previousWorkflow?.characters ?? [],
      ),
      imagePlans: this.normalizeAutoProjectImagePlans(
        Array.isArray(source.imagePlans)
          ? source.imagePlans
          : Array.isArray(source.imageTasks)
            ? source.imageTasks
            : source.imageTaskPlan,
        previousWorkflow?.imagePlans ?? [],
      ),
      shots: this.normalizeAutoProjectShots(
        Array.isArray(source.shots)
          ? source.shots
          : Array.isArray(source.shotList)
            ? source.shotList
            : source.storyboard,
        previousWorkflow?.shots ?? [],
      ),
      recommendedNextStage:
        recommendedNextStageRaw === 'project_plan_review'
          ? 'project_plan_review'
          : recommendedNextStageRaw === 'outline_review'
            ? 'outline_review'
            : recommendedNextStageRaw === 'character_review'
              ? 'character_review'
              : recommendedNextStageRaw === 'project_setup_confirmation'
                ? 'project_setup_confirmation'
                : recommendedNextStageRaw === 'shot_review'
                  ? 'shot_review'
                  : previousWorkflow?.recommendedNextStage ?? null,
    };
  }

  private buildCompletionResult(input: {
    autoProjectAgent: AutoProjectAgentContext;
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot | null;
    autoCreatedProject: boolean;
    providerData: Record<string, unknown>;
    content: string;
    taskRefs: ChatTaskRef[];
  }) {
    const providerData = {
      ...(input.providerData ?? {}),
      autoProjectAgent: {
        projectId: input.projectSnapshot?.id ?? null,
        projectName: input.projectSnapshot?.name ?? null,
        imageModelId: input.autoProjectAgent.imageModelId,
        videoModelId: input.autoProjectAgent.videoModelId,
        preferredResolution: input.autoProjectAgent.preferredResolution,
        autoCreatedProject: input.autoCreatedProject,
        createdTaskCount: input.taskRefs.length,
        stage: input.workflow.stage,
        workflow: input.workflow,
      } satisfies AutoProjectAgentMetadata,
    } as Record<string, unknown>;

    if (input.taskRefs.length > 0) {
      providerData.taskRefs = input.taskRefs;
    }

    return {
      content: input.content,
      providerData,
    };
  }

  private buildProjectPlanReviewReply(input: {
    projectSnapshot: AutoProjectSnapshot;
    workflow: AutoProjectWorkflow;
    taskStats: AutoProjectProjectTaskStats;
    modelSummary: string;
    preferChinese: boolean;
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];
    lines.push(
      input.preferChinese
        ? `项目：${input.projectSnapshot.name}`
        : `Project: ${input.projectSnapshot.name}`,
    );
    lines.push(
      input.preferChinese
        ? `现有内容：灵感 ${input.projectSnapshot.inspirations.length}｜图片 ${input.projectSnapshot.assets.filter((item) => item.kind === 'image').length}｜视频 ${input.projectSnapshot.assets.filter((item) => item.kind === 'video').length}｜角色图 ${input.taskStats.completedRoleImageCount}｜分镜视频 ${input.taskStats.completedShotVideoCount}`
        : `Current content: inspirations ${input.projectSnapshot.inspirations.length} | images ${input.projectSnapshot.assets.filter((item) => item.kind === 'image').length} | videos ${input.projectSnapshot.assets.filter((item) => item.kind === 'video').length} | role sheets ${input.taskStats.completedRoleImageCount} | storyboard videos ${input.taskStats.completedShotVideoCount}`,
    );
    if (input.projectSnapshot.description?.trim()) {
      lines.push(
        input.preferChinese
          ? `项目描述：${this.truncateAutoProjectText(input.projectSnapshot.description, 220)}`
          : `Description: ${this.truncateAutoProjectText(input.projectSnapshot.description, 220)}`,
      );
    }
    if (input.modelSummary.trim()) {
      lines.push(
        input.preferChinese
          ? `AI核验：${input.modelSummary.trim()}`
          : `AI review: ${input.modelSummary.trim()}`,
      );
    }
    if (input.workflow.recommendedNextStage) {
      lines.push(
        input.preferChinese
          ? `建议下一步：${this.describeAutoProjectStage(input.workflow.recommendedNextStage, true)}`
          : `Recommended next stage: ${this.describeAutoProjectStage(input.workflow.recommendedNextStage, false)}`,
      );
    }
    lines.push(
      input.preferChinese ? '回复：确认后续方案' : 'Reply: confirm plan',
    );

    return lines.join('\n');
  }

  private buildOutlineReviewReply(input: {
    workflow: AutoProjectWorkflow;
    preferChinese: boolean;
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];
    if (input.workflow.outlineTitle?.trim()) {
      lines.push(
        input.preferChinese
          ? `大纲标题：${input.workflow.outlineTitle}`
          : `Outline title: ${input.workflow.outlineTitle}`,
      );
    }

    input.workflow.outline.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}`);
      lines.push(
        input.preferChinese
          ? `内容：${item.summary}`
          : `Summary: ${item.summary}`,
      );
    });

    lines.push(
      input.preferChinese ? '回复：确认大纲' : 'Reply: approve outline',
    );
    return lines.join('\n');
  }

  private buildCharacterReviewReply(input: {
    workflow: AutoProjectWorkflow;
    preferChinese: boolean;
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];

    input.workflow.characters.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name}${item.role ? `｜${item.role}` : ''}`);
      if (item.description) {
        lines.push(
          input.preferChinese
            ? `设定：${item.description}`
            : `Profile: ${item.description}`,
        );
      }
      if (item.visualPrompt) {
        lines.push(
          input.preferChinese
            ? `建模提示词：${item.visualPrompt}`
            : `Visual prompt: ${item.visualPrompt}`,
        );
      }
    });

    lines.push(
      input.preferChinese ? '回复：确认角色设定' : 'Reply: approve characters',
    );
    return lines.join('\n');
  }

  private buildProjectSetupConfirmationReply(input: {
    projectSnapshot: AutoProjectSnapshot | null;
    workflow: AutoProjectWorkflow;
    preferChinese: boolean;
    executionSummary?: string;
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];

    if (input.executionSummary?.trim()) {
      lines.push(input.executionSummary.trim());
    }

    const effectiveProjectName =
      input.projectSnapshot?.name || input.workflow.proposedProjectName || (input.preferChinese ? '未命名项目' : 'Untitled project');
    lines.push(
      input.preferChinese
        ? `项目名称：${effectiveProjectName}`
        : `Project name: ${effectiveProjectName}`,
    );

    if (input.workflow.proposedProjectDescription?.trim()) {
      lines.push(
        input.preferChinese
          ? `项目描述：${input.workflow.proposedProjectDescription}`
          : `Project description: ${input.workflow.proposedProjectDescription}`,
      );
    }

    lines.push(input.preferChinese ? '待执行：' : 'Pending execution:');
    lines.push(
      input.preferChinese
        ? `1. ${input.projectSnapshot ? '更新' : '创建'}项目并归档角色图任务`
        : `1. ${input.projectSnapshot ? 'Update' : 'Create'} the project and archive role image tasks`,
    );
    lines.push(
      input.preferChinese
        ? '2. 仅生成角色建模图，不生成场景图或分镜图'
        : '2. Generate role-modeling images only, not scene stills or storyboard frames',
    );

    input.workflow.imagePlans.forEach((plan, index) => {
      lines.push(
        `${index + 1}. ${plan.title}${plan.preferredAspectRatio ? `｜${plan.preferredAspectRatio}` : ''}${plan.preferredResolution ? `｜${plan.preferredResolution}` : ''}`,
      );
      lines.push(
        input.preferChinese
          ? `提示词：${plan.prompt}`
          : `Prompt: ${plan.prompt}`,
      );
    });

    lines.push(
      input.preferChinese
        ? '角色图全部完成后，点击“进入分镜剧本+时长方案”'
        : 'After all role images finish, click "Proceed to Storyboard"',
    );

    return lines.join('\n');
  }

  private buildShotReviewReply(input: {
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot | null;
    preferChinese: boolean;
    executionSummary?: string;
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];

    if (input.executionSummary?.trim()) {
      lines.push(input.executionSummary.trim());
    }

    const totalSeconds = this.sumShotDurations(input.workflow.shots);
    if (totalSeconds > 0) {
      lines.push(
        input.preferChinese
          ? `全片时长：约 ${totalSeconds} 秒`
          : `Total runtime: about ${totalSeconds} seconds`,
      );
    }

    const assetMap = new Map(input.projectSnapshot?.assets.map((asset) => [asset.id, asset] as const) ?? []);
    input.workflow.shots.forEach((shot, index) => {
      lines.push(`${index + 1}. ${shot.title}｜${shot.duration}`);

      const referenceAssets = this.buildAutoProjectOrderedReferenceAssets(shot.referenceAssetIds, assetMap);
      if (referenceAssets.length > 0) {
        lines.push(
          input.preferChinese
            ? `参考素材：${referenceAssets.map((asset) => asset.mentionLabel).join(' ')}`
            : `References: ${referenceAssets.map((asset) => asset.mentionLabel).join(' ')}`,
        );
      }
      if (shot.summary) {
        lines.push(
          input.preferChinese
            ? `画面：${shot.summary}`
            : `Visual: ${shot.summary}`,
        );
      }
      if (shot.script) {
        lines.push(
          input.preferChinese
            ? `剧本：${shot.script}`
            : `Script: ${shot.script}`,
        );
      }
      lines.push(
        input.preferChinese
          ? `建议：${shot.generationDecision === 'skip' ? '跳过' : '生成'}`
          : `Decision: ${shot.generationDecision === 'skip' ? 'skip' : 'generate'}`,
      );
      if (shot.decisionReason) {
        lines.push(
          input.preferChinese
            ? `原因：${shot.decisionReason}`
            : `Reason: ${shot.decisionReason}`,
        );
      }
    });

    const nextPending = this.getNextPendingShot(input.workflow);
    if (nextPending?.shot.generationDecision === 'skip') {
      lines.push(
        input.preferChinese
          ? '回复：确认跳过当前分镜'
          : 'Reply: confirm skip current shot',
      );
    }

    lines.push(
      input.preferChinese
        ? '回复：从第一镜开始生成 / 生成下一镜'
        : 'Reply: generate first shot / generate next shot',
    );

    return lines.join('\n');
  }

  private buildShotGenerationReply(input: {
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot | null;
    preferChinese: boolean;
    createdShotIndex: number | null;
    createdShotTitle: string | null;
    taskRefs: ChatTaskRef[];
    failures: string[];
  }) {
    const lines: string[] = [this.buildAutoProjectProgressPrefix(input.workflow.progressLabel)];
    if (input.projectSnapshot?.name) {
      lines.push(
        input.preferChinese
          ? `项目：${input.projectSnapshot.name}`
          : `Project: ${input.projectSnapshot.name}`,
      );
    }

    lines.push(
      input.preferChinese
        ? '生成模式：逐镜推进'
        : 'Generation mode: step-by-step',
    );

    if (input.createdShotIndex !== null && input.createdShotTitle) {
      lines.push(
        input.preferChinese
          ? `本次已提交：第 ${input.createdShotIndex + 1} 镜｜${input.createdShotTitle}`
          : `Submitted this turn: shot #${input.createdShotIndex + 1} | ${input.createdShotTitle}`,
      );
    }

    if (input.taskRefs.length > 0) {
      lines.push(
        input.preferChinese
          ? `任务数：${input.taskRefs.length}`
          : `Tasks created: ${input.taskRefs.length}`,
      );
    }

    if (input.failures.length > 0) {
      input.failures.forEach((failure) => lines.push(failure));
    }

    const handledCount = input.workflow.generatedShotIds.length + input.workflow.skippedShotIds.length;
    const totalCount = input.workflow.shots.length;
    lines.push(
      input.preferChinese
        ? `当前分镜处理进度：${handledCount}/${totalCount}`
        : `Storyboard handling progress: ${handledCount}/${totalCount}`,
    );

    const nextPending = this.getNextPendingShot(input.workflow);
    if (!nextPending) {
      lines.push(
        input.preferChinese
          ? '全部分镜都已提交完成，等待视频任务结束后即可合并。'
          : 'All storyboard shots have been submitted. You can merge them after the video tasks finish.',
      );
    } else if (nextPending.shot.generationDecision === 'skip') {
      lines.push(
        input.preferChinese
          ? `下一条建议：第 ${nextPending.index + 1} 镜建议跳过，需先回复“确认跳过当前分镜”。`
          : `Next suggestion: shot #${nextPending.index + 1} is marked to skip. Reply "confirm skip current shot" first.`,
      );
    } else {
      lines.push(
        input.preferChinese
          ? `下一条待生成：第 ${nextPending.index + 1} 镜｜${nextPending.shot.title}`
          : `Next pending shot: #${nextPending.index + 1} | ${nextPending.shot.title}`,
      );
    }

    return lines.join('\n');
  }

  private buildProjectSetupExecutedSummary(input: {
    projectSnapshot: AutoProjectSnapshot;
    autoCreatedProject: boolean;
    taskRefs: ChatTaskRef[];
    failures: string[];
    reusedTaskCount: number;
    expectedPlanCount: number;
    preferChinese: boolean;
  }) {
    const lines: string[] = [];
    const newlySubmittedTaskCount = Math.max(0, input.taskRefs.length - input.reusedTaskCount);
    const hasPendingTask = input.taskRefs.some((taskRef) => this.isSetupTaskPending(taskRef));
    const allTasksCompleted =
      (input.expectedPlanCount === 0 || input.taskRefs.length >= input.expectedPlanCount)
      && input.taskRefs.length > 0
      && input.taskRefs.every((taskRef) => this.isSetupTaskCompleted(taskRef));

    lines.push(
      input.preferChinese
        ? `已执行：${input.autoCreatedProject ? '已创建项目。' : '已同步项目信息。'}`
        : `Executed: ${input.autoCreatedProject ? 'created the project.' : 'synced the project info.'}`,
    );
    if (input.reusedTaskCount > 0) {
      lines.push(
        input.preferChinese
          ? `检测到已有角色图任务 ${input.reusedTaskCount} 个，已直接复用，不会重复创建。`
          : `Detected ${input.reusedTaskCount} existing role image tasks and reused them without creating duplicates.`,
      );
    }
    if (newlySubmittedTaskCount > 0) {
      lines.push(
        input.preferChinese
          ? `本次新提交角色图任务：${newlySubmittedTaskCount}`
          : `New role image tasks submitted this turn: ${newlySubmittedTaskCount}`,
      );
    }
    lines.push(
      input.preferChinese
        ? `当前可追踪角色图任务：${input.taskRefs.length}/${input.expectedPlanCount || input.taskRefs.length}`
        : `Tracked role image tasks: ${input.taskRefs.length}/${input.expectedPlanCount || input.taskRefs.length}`,
    );
    if (input.expectedPlanCount > 0 && input.taskRefs.length < input.expectedPlanCount) {
      const missingCount = input.expectedPlanCount - input.taskRefs.length;
      lines.push(
        input.preferChinese
          ? `仍缺少 ${missingCount} 个角色图任务，暂时不能进入分镜阶段。`
          : `${missingCount} role image tasks are still missing, so storyboard drafting is not available yet.`,
      );
    }
    if (allTasksCompleted) {
      lines.push(
        input.preferChinese
          ? '角色图已全部完成，可直接进入分镜剧本阶段。'
          : 'All role images are complete and the storyboard stage is ready.',
      );
    } else if (hasPendingTask) {
      lines.push(
        input.preferChinese
          ? '请等待全部角色图任务完成，完成后再进入分镜剧本阶段。'
          : 'Wait for all role image tasks to finish before entering storyboard drafting.',
      );
    }

    if (input.failures.length > 0) {
      input.failures.forEach((failure) => lines.push(failure));
    }

    return lines.join('\n');
  }

  private buildProjectSetupConfirmationWorkflow(input: {
    previousWorkflow: AutoProjectWorkflow;
    taskRefs: ChatTaskRef[];
    expectedPlanCount: number;
    preferChinese: boolean;
  }): AutoProjectWorkflow {
    const hasPendingRoleTasks = input.taskRefs.some((taskRef) => this.isSetupTaskPending(taskRef));
    const hasEnoughRoleTasks = input.expectedPlanCount === 0 || input.taskRefs.length >= input.expectedPlanCount;
    const hasAllRoleTasksCompleted =
      hasEnoughRoleTasks
      && input.taskRefs.length > 0
      && input.taskRefs.every((taskRef) => this.isSetupTaskCompleted(taskRef));

    return {
      ...input.previousWorkflow,
      stage: 'project_setup_confirmation',
      progressLabel:
        hasPendingRoleTasks
          ? (input.preferChinese
            ? '角色图生成中，待全部完成后进入分镜阶段'
            : 'Role images generating, enter storyboard after all tasks finish')
          : hasAllRoleTasksCompleted
            ? (input.preferChinese
              ? '角色图已完成，可进入分镜阶段'
              : 'Role images completed, ready for storyboard drafting')
            : (input.preferChinese
              ? '角色图尚未全部就绪，可补齐或重新生成后再进入分镜阶段'
              : 'Role images are not fully ready yet. Complete or regenerate them before entering storyboard drafting.'),
      recommendedNextStage: 'shot_review',
    };
  }

  private buildAutoProjectProgressPrefix(label: string | null) {
    return `【当前进度：${label || '工作流处理中'}】`;
  }

  private getWorkflowProgressLabel(
    stage:
      | 'project_plan_review'
      | 'outline_review'
      | 'character_review'
      | 'project_setup_confirmation'
      | 'shot_review'
      | 'shot_generation',
    preferChinese: boolean,
  ) {
    if (!preferChinese) {
      if (stage === 'project_plan_review') return 'waiting to confirm next workflow plan';
      if (stage === 'outline_review') return 'outline ready for review';
      if (stage === 'character_review') return 'characters ready for review';
      if (stage === 'project_setup_confirmation') return 'waiting to confirm role image setup and project initialization';
      if (stage === 'shot_generation') return 'storyboard video generation in progress';
      return 'storyboard and duration plan ready for review';
    }

    if (stage === 'project_plan_review') return '待确认后续执行方案';
    if (stage === 'outline_review') return '项目大纲待审阅';
    if (stage === 'character_review') return '角色设定待审阅';
    if (stage === 'project_setup_confirmation') return '待确认是否执行角色图生成+项目初始化';
    if (stage === 'shot_generation') return '分镜视频生成中';
    return '分镜剧本+时长方案待审阅';
  }

  private describeAutoProjectStage(stage: AutoProjectWorkflowStage, preferChinese: boolean) {
    if (!preferChinese) {
      if (stage === 'project_plan_review') return 'plan review';
      if (stage === 'outline_review') return 'outline review';
      if (stage === 'character_review') return 'character review';
      if (stage === 'project_setup_confirmation') return 'project setup confirmation';
      return 'storyboard review';
    }

    if (stage === 'project_plan_review') return '待确认后续执行方案';
    if (stage === 'outline_review') return '项目大纲待审阅';
    if (stage === 'character_review') return '角色设定待审阅';
    if (stage === 'project_setup_confirmation') return '待确认是否执行角色图生成+项目初始化';
    return '分镜剧本+时长方案待审阅';
  }

  private getNextPendingShot(workflow: AutoProjectWorkflow) {
    for (let index = 0; index < workflow.shots.length; index += 1) {
      const shot = workflow.shots[index];
      if (workflow.generatedShotIds.includes(shot.id)) continue;
      if (workflow.skippedShotIds.includes(shot.id)) continue;
      return { shot, index };
    }
    return null;
  }

  private async resolveNextShotExecutionTarget(input: {
    userId: bigint;
    projectId: bigint;
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot;
    videoModel: AiModel;
    preferChinese: boolean;
  }):
    Promise<
      | { kind: 'ok'; value: AutoProjectShotExecutionTarget }
      | { kind: 'blocked'; message: string; progressLabel: string }
    > {
    const nextPending = this.getNextPendingShot(input.workflow);
    if (!nextPending) {
      return {
        kind: 'blocked',
        progressLabel: this.getWorkflowProgressLabel('shot_generation', input.preferChinese),
        message: input.preferChinese ? '没有剩余待处理的分镜。' : 'There are no remaining pending shots.',
      };
    }

    if (nextPending.shot.generationDecision === 'skip') {
      return {
        kind: 'blocked',
        progressLabel: this.getWorkflowProgressLabel('shot_review', input.preferChinese),
        message: input.preferChinese
          ? `第 ${nextPending.index + 1} 镜被标记为建议跳过，需先确认跳过或修改分镜方案。`
          : `Shot #${nextPending.index + 1} is marked to skip. Confirm skip or revise the storyboard first.`,
      };
    }

    let continuityReferences: AutoProjectOrderedReferenceAsset[] = [];
    if (nextPending.index > 0) {
      const previousShot = input.workflow.shots[nextPending.index - 1];
      const previousShotSkipped = input.workflow.skippedShotIds.includes(previousShot.id);
      const previousShotGenerated = input.workflow.generatedShotIds.includes(previousShot.id);
      if (!previousShotSkipped) {
        const videoCapabilities = buildModelCapabilities(input.videoModel as AiModel, null);
        const supportsVideoReference = videoCapabilities.supports.videoInput;

        const previousReference = await this.loadLatestCompletedShotVideoReference({
          userId: input.userId,
          projectId: input.projectId,
          shotId: previousShot.id,
          shotTitle: previousShot.title,
        });

        if (!previousReference) {
          if (!previousShotGenerated) {
            return {
              kind: 'blocked',
              progressLabel: this.getWorkflowProgressLabel('shot_generation', input.preferChinese),
              message: input.preferChinese
                ? `第 ${nextPending.index + 1} 镜必须等待上一镜完成后才能生成。`
                : `Shot #${nextPending.index + 1} must wait until the previous shot finishes.`,
            };
          }

          return {
            kind: 'blocked',
            progressLabel: this.getWorkflowProgressLabel('shot_generation', input.preferChinese),
            message: input.preferChinese
              ? `第 ${nextPending.index + 1} 镜需要引用上一镜成片，但上一镜尚未生成完成。`
              : `Shot #${nextPending.index + 1} requires the previous generated shot as continuity reference, but it is not ready yet.`,
          };
        }

        const continuityVideoReference: AutoProjectOrderedReferenceAsset | null = supportsVideoReference
          ? {
              id: `continuity:${previousReference.shotId}`,
              kind: 'video',
              title: previousReference.title,
              description: input.preferChinese ? '上一条已生成分镜视频' : 'Previous generated storyboard video',
              sourcePrompt: null,
              url: previousReference.resultUrl,
              thumbnailUrl: previousReference.thumbnailUrl,
              createdAt: new Date(0),
              referenceCharacterIds: [],
              workflowStage: 'shot_review',
              shotId: previousReference.shotId,
              finalStoryboard: true,
              ordinal: 0,
              mentionLabel: '',
            }
          : null;
        const useSeedance20VideoContinuity = this.isSeedance20VideoModel(input.videoModel) && Boolean(continuityVideoReference);
        const continuityThumbnailReference = useSeedance20VideoContinuity
          ? null
          : this.createAutoProjectContinuityThumbnailReference({
              previousReference,
              preferChinese: input.preferChinese,
            });

        if (!useSeedance20VideoContinuity && !continuityThumbnailReference) {
          return {
            kind: 'blocked',
            progressLabel: this.getWorkflowProgressLabel('shot_generation', input.preferChinese),
            message: input.preferChinese
              ? `第 ${nextPending.index + 1} 镜需要引用上一镜尾帧，但上一镜尾帧尚未就绪。`
              : `Shot #${nextPending.index + 1} needs the previous shot last frame, but it is not ready yet.`,
          };
        }

        continuityReferences = useSeedance20VideoContinuity && continuityVideoReference
          ? [continuityVideoReference]
          : [
              ...(continuityThumbnailReference ? [continuityThumbnailReference] : []),
              ...(continuityVideoReference ? [continuityVideoReference] : []),
            ];
      }
    }

    return {
      kind: 'ok',
      value: {
        shot: nextPending.shot,
        shotIndex: nextPending.index,
        continuityReferences,
      },
    };
  }

  private async loadLatestCompletedShotVideoReference(input: {
    userId: bigint;
    projectId: bigint;
    shotId: string;
    shotTitle: string;
  }): Promise<AutoProjectStoredShotVideoReference | null> {
    const tasks = await this.prisma.videoTask.findMany({
      where: {
        userId: input.userId,
        projectId: input.projectId,
        status: TaskStatus.completed,
        autoProjectFinalStoryboard: true,
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: {
        resultUrl: true,
        thumbnailUrl: true,
        providerTaskId: true,
        autoProjectShotId: true,
        providerData: true,
        prompt: true,
      },
    });

    let fallbackTask: {
      resultUrl: string;
      thumbnailUrl: string | null;
      providerTaskId: string | null;
      title: string;
    } | null = null;

    for (const task of tasks) {
      const metadata = extractAutoProjectAssetMetadata(task.providerData);
      if (!fallbackTask && task.resultUrl) {
        fallbackTask = {
          resultUrl: task.resultUrl,
          thumbnailUrl: task.thumbnailUrl,
          providerTaskId: task.providerTaskId,
          title: metadata?.title || input.shotTitle || this.truncateAutoProjectText(task.prompt, 80) || input.shotId,
        };
      }

      const shotId =
        (typeof task.autoProjectShotId === 'string' && task.autoProjectShotId.trim())
          ? task.autoProjectShotId.trim()
          : metadata?.shotId ?? null;
      if (!shotId || shotId !== input.shotId) continue;
      if (!task.resultUrl) continue;

      return {
        shotId,
        title: metadata?.title ?? input.shotTitle,
        resultUrl: task.resultUrl,
        thumbnailUrl: task.thumbnailUrl,
        providerTaskId: task.providerTaskId,
      };
    }

    if (!fallbackTask) return null;

    return {
      shotId: input.shotId,
      title: fallbackTask.title,
      resultUrl: fallbackTask.resultUrl,
      thumbnailUrl: fallbackTask.thumbnailUrl,
      providerTaskId: fallbackTask.providerTaskId,
    };
  }

  private async countActiveProjectVideoTasks(userId: bigint, projectId: bigint) {
    return this.prisma.videoTask.count({
      where: {
        userId,
        projectId,
        status: { in: [TaskStatus.pending, TaskStatus.processing] },
      },
    });
  }

  private async loadProjectWorkflowTaskStats(userId: bigint, projectId: bigint): Promise<AutoProjectProjectTaskStats> {
    const [activeImageTaskCount, activeVideoTaskCount, completedImageTasks, completedVideoTasks] = await Promise.all([
      this.prisma.imageTask.count({
        where: {
          userId,
          projectId,
          status: { in: [TaskStatus.pending, TaskStatus.processing] },
        },
      }),
      this.prisma.videoTask.count({
        where: {
          userId,
          projectId,
          status: { in: [TaskStatus.pending, TaskStatus.processing] },
        },
      }),
      this.prisma.imageTask.findMany({
        where: {
          userId,
          projectId,
          status: TaskStatus.completed,
        },
        select: {
          providerData: true,
        },
        take: 100,
      }),
      this.prisma.videoTask.findMany({
        where: {
          userId,
          projectId,
          status: TaskStatus.completed,
          autoProjectFinalStoryboard: true,
        },
        select: {
          id: true,
        },
        take: 100,
      }),
    ]);

    let completedRoleImageCount = 0;
    for (const task of completedImageTasks) {
      const metadata = extractAutoProjectAssetMetadata(task.providerData);
      if (metadata?.workflowStage === 'project_setup_confirmation' || metadata?.finalStoryboard === false) {
        completedRoleImageCount += 1;
      }
    }

    let completedShotVideoCount = 0;
    completedShotVideoCount = completedVideoTasks.length;

    return {
      activeImageTaskCount,
      activeVideoTaskCount,
      completedRoleImageCount,
      completedShotVideoCount,
    };
  }

  private formatAutoProjectOptionList(values: string[]) {
    return values.length > 0 ? values.map((item) => `"${item}"`).join('、') : '无';
  }

  private resolveAllowedShotDuration(value: string, allowedDurations: string[]) {
    const numericValue = value.trim().match(/\d{1,2}/)?.[0] ?? '';
    if (!numericValue) return null;

    if (allowedDurations.length === 0) {
      return numericValue;
    }

    for (const option of allowedDurations) {
      const optionNumeric = option.trim().match(/\d{1,2}/)?.[0] ?? '';
      if (optionNumeric === numericValue) return option;
    }

    return null;
  }

  private extractRequestedShotDuration(userInput: string, videoModel: AiModel) {
    const text = (userInput || '').trim();
    if (!text) return null;

    const patterns = [
      /(?:每(?:个)?(?:分镜|镜头|镜)|单(?:个)?(?:分镜|镜头|镜)|分镜(?:长度|时长)|镜头(?:长度|时长)|每条(?:分镜|镜头)|时长)\s*(?:控制|固定|设置|设为|为|是|=|:|：|在|到|约|大约|保持|长度)?\s*(\d{1,2})\s*(?:秒|s|sec|secs|second|seconds)/i,
      /(\d{1,2})\s*(?:秒|s|sec|secs|second|seconds)\s*(?:一(?:个)?(?:分镜|镜头|镜)|每(?:个)?(?:分镜|镜头|镜)|单(?:个)?(?:分镜|镜头|镜)|分镜|镜头)/i,
    ];
    const videoOptions = getAutoProjectVideoOptionCatalog(videoModel);

    for (const pattern of patterns) {
      const matched = text.match(pattern);
      if (!matched?.[1]) continue;

      const allowedDuration = this.resolveAllowedShotDuration(matched[1], videoOptions.durations);
      if (allowedDuration) return allowedDuration;
    }

    return null;
  }

  private normalizeAutoProjectCommand(value: string) {
    return value.trim().toLowerCase().replace(/[。.!！?？]+$/g, '').replace(/\s+/g, ' ');
  }

  private matchesAutoProjectCommand(value: string, commands: string[]) {
    const normalized = this.normalizeAutoProjectCommand(value);
    return commands.some((command) => normalized === this.normalizeAutoProjectCommand(command));
  }

  private includesAutoProjectHint(value: string, hints: string[]) {
    const normalized = this.normalizeAutoProjectCommand(value);
    return hints.some((hint) => normalized.includes(this.normalizeAutoProjectCommand(hint)));
  }

  private looksLikeFreshAutoProjectIdea(value: string) {
    const normalized = this.normalizeAutoProjectCommand(value);
    if (!normalized) return false;

    const directIdeaHints = [
      '帮我',
      '给我',
      '创建',
      '做一个',
      '做一条',
      '写一个',
      '策划',
      '想一个',
      '片名',
      '主题',
      '灵感',
      '故事',
      '短片',
      '创意片',
      '广告片',
      '宣传片',
      '剧情',
      '设定',
      '世界观',
      'new project',
      'new idea',
      'create a',
      'make a',
      'story about',
      'theme',
      'inspiration',
      'title is',
    ];

    if (this.includesAutoProjectHint(normalized, directIdeaHints)) {
      return true;
    }

    return normalized.length >= 16 && !this.resolveExplicitAutoProjectWorkflowCommand(normalized, null);
  }

  private isGenericAutoProjectContinueCommand(value: string) {
    return this.matchesAutoProjectCommand(value, [
      '继续',
      '下一步',
      '继续下一步',
      '继续执行',
      '继续吧',
      'go on',
      'continue',
      'next step',
    ]);
  }

  private normalizeAutoProjectShortText(value: unknown, maxLength = 160) {
    const text = this.normalizeUpstreamContent(value).trim();
    return text ? text.slice(0, maxLength) : '';
  }

  private normalizeAutoProjectOutlineItems(value: unknown, previous: AutoProjectOutlineItem[] = []) {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const source = item as Record<string, unknown>;
        const title =
          this.normalizeAutoProjectShortText(source.title ?? source.name ?? source.heading, 120)
          || previous[index]?.title
          || `Beat ${index + 1}`;
        const summary =
          this.normalizeAutoProjectShortText(source.summary ?? source.description ?? source.content ?? source.beat, 400)
          || previous[index]?.summary
          || '';

        if (!title && !summary) return null;

        return {
          id:
            (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
            || previous[index]?.id
            || `outline-${index + 1}`,
          title,
          summary: summary || title,
        } satisfies AutoProjectOutlineItem;
      })
      .filter((item): item is AutoProjectOutlineItem => Boolean(item))
      .slice(0, 8);
  }

  private normalizeAutoProjectCharacters(value: unknown, previous: AutoProjectCharacterItem[] = []) {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const source = item as Record<string, unknown>;
        const name =
          this.normalizeAutoProjectShortText(source.name ?? source.title, 80)
          || previous[index]?.name
          || `Character ${index + 1}`;
        const role =
          this.normalizeAutoProjectShortText(source.role ?? source.function ?? source.archetype, 120)
          || previous[index]?.role
          || '';
        const description =
          this.normalizeAutoProjectShortText(
            source.description ?? source.look ?? source.summary ?? source.personality,
            360,
          )
          || previous[index]?.description
          || '';
        const visualPrompt =
          this.normalizeAutoProjectShortText(
            source.visualPrompt ?? source.prompt ?? source.imagePrompt ?? source.visualDescription,
            1200,
          )
          || previous[index]?.visualPrompt
          || '';

        if (!name && !description && !visualPrompt) return null;

        return {
          id:
            (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
            || previous[index]?.id
            || `character-${index + 1}`,
          name,
          role,
          description,
          visualPrompt,
        } satisfies AutoProjectCharacterItem;
      })
      .filter((item): item is AutoProjectCharacterItem => Boolean(item))
      .slice(0, 8);
  }

  private normalizeAutoProjectImagePlans(value: unknown, previous: AutoProjectImagePlanItem[] = []) {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const source = item as Record<string, unknown>;
        const prompt =
          this.normalizeAutoProjectShortText(source.prompt ?? source.imagePrompt ?? source.finalPrompt, 2000)
          || previous[index]?.prompt
          || '';
        if (!prompt) return null;

        return {
          id:
            (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
            || previous[index]?.id
            || `image-plan-${index + 1}`,
          title:
            this.normalizeAutoProjectShortText(source.title ?? source.name, 120)
            || previous[index]?.title
            || `Image ${index + 1}`,
          prompt,
          negativePrompt:
            this.normalizeAutoProjectShortText(source.negativePrompt, 1200)
            || previous[index]?.negativePrompt
            || null,
          referenceCharacterIds: Array.isArray(source.referenceCharacterIds)
            ? source.referenceCharacterIds
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
                .slice(0, 8)
            : previous[index]?.referenceCharacterIds ?? [],
          referenceAssetIds: Array.isArray(source.referenceAssetIds)
            ? source.referenceAssetIds
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
                .slice(0, 12)
            : previous[index]?.referenceAssetIds ?? [],
          preferredAspectRatio:
            this.normalizeAutoProjectShortText(source.preferredAspectRatio, 40)
            || previous[index]?.preferredAspectRatio
            || null,
          preferredResolution:
            this.normalizeAutoProjectShortText(source.preferredResolution, 40)
            || previous[index]?.preferredResolution
            || null,
        } satisfies AutoProjectImagePlanItem;
      })
      .filter((item): item is AutoProjectImagePlanItem => Boolean(item))
      .slice(0, 8);
  }

  private normalizeAutoProjectShots(value: unknown, previous: AutoProjectShotPlanItem[] = []) {
    if (!Array.isArray(value)) return [];

    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const source = item as Record<string, unknown>;
        const prompt =
          this.normalizeAutoProjectShortText(source.prompt ?? source.videoPrompt ?? source.finalPrompt, 2200)
          || previous[index]?.prompt
          || '';
        if (!prompt) return null;

        return {
          id:
            (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
            || previous[index]?.id
            || `shot-${index + 1}`,
          title:
            this.normalizeAutoProjectShortText(source.title ?? source.name, 120)
            || previous[index]?.title
            || `Shot ${index + 1}`,
          summary:
            this.normalizeAutoProjectShortText(source.summary ?? source.description ?? source.visual, 360)
            || previous[index]?.summary
            || '',
          script:
            this.normalizeAutoProjectShortText(source.script ?? source.dialogue ?? source.voiceover, 800)
            || previous[index]?.script
            || '',
          prompt,
          duration:
            this.normalizeAutoProjectShortText(source.duration ?? source.preferredDuration ?? source.seconds, 40)
            || previous[index]?.duration
            || '5',
          referenceCharacterIds: Array.isArray(source.referenceCharacterIds)
            ? source.referenceCharacterIds
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
                .slice(0, 8)
            : previous[index]?.referenceCharacterIds ?? [],
          referenceAssetIds: Array.isArray(source.referenceAssetIds)
            ? source.referenceAssetIds
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry.length > 0)
                .slice(0, 12)
            : previous[index]?.referenceAssetIds ?? [],
          preferredAspectRatio:
            this.normalizeAutoProjectShortText(source.preferredAspectRatio, 40)
            || previous[index]?.preferredAspectRatio
            || null,
          preferredResolution:
            this.normalizeAutoProjectShortText(source.preferredResolution, 40)
            || previous[index]?.preferredResolution
            || null,
          generationDecision:
            source.generationDecision === 'skip' || source.decision === 'skip'
              ? 'skip'
              : previous[index]?.generationDecision === 'skip'
                ? 'skip'
                : 'generate',
          decisionReason:
            this.normalizeAutoProjectShortText(
              source.decisionReason ?? source.generationReason ?? source.reason,
              400,
            )
            || previous[index]?.decisionReason
            || null,
        } satisfies AutoProjectShotPlanItem;
      })
      .filter((item): item is AutoProjectShotPlanItem => Boolean(item))
      .slice(0, 12);
  }

  private normalizeAutoProjectReferenceCharacterIds(value: string[], characters: AutoProjectCharacterItem[]) {
    if (value.length === 0 || characters.length === 0) return [];

    const idSet = new Set(characters.map((item) => item.id));
    const nameMap = new Map(
      characters.map((item) => [this.normalizeAutoProjectCommand(item.name), item.id] as const),
    );

    return [...new Set(
      value
        .map((entry) => {
          const normalized = entry.trim();
          if (!normalized) return '';
          if (idSet.has(normalized)) return normalized;
          return nameMap.get(this.normalizeAutoProjectCommand(normalized)) ?? '';
        })
        .filter((entry) => entry.length > 0),
    )].slice(0, 8);
  }

  private normalizeAutoProjectReferenceAssetIds(value: string[], assetIds: Set<string>) {
    if (value.length === 0 || assetIds.size === 0) return [];

    return [...new Set(
      value
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && assetIds.has(entry)),
    )].slice(0, 12);
  }

  private sanitizeAutoProjectWorkflowReferences(
    workflow: AutoProjectWorkflow,
    assetIds: Set<string>,
  ): AutoProjectWorkflow {
    const imagePlans = workflow.imagePlans.map((plan) => ({
      ...plan,
      referenceCharacterIds: this.normalizeAutoProjectReferenceCharacterIds(plan.referenceCharacterIds, workflow.characters),
      referenceAssetIds: this.normalizeAutoProjectReferenceAssetIds(plan.referenceAssetIds, assetIds),
    }));
    const shots = workflow.shots.map((shot) => ({
      ...shot,
      referenceCharacterIds: this.normalizeAutoProjectReferenceCharacterIds(shot.referenceCharacterIds, workflow.characters),
      referenceAssetIds: this.normalizeAutoProjectReferenceAssetIds(shot.referenceAssetIds, assetIds),
    }));

    const shotIdSet = new Set(shots.map((item) => item.id));

    return {
      ...workflow,
      imagePlans,
      shots,
      generatedShotIds: workflow.generatedShotIds.filter((shotId) => shotIdSet.has(shotId)),
      skippedShotIds: workflow.skippedShotIds.filter((shotId) => shotIdSet.has(shotId)),
    };
  }

  private sanitizeAutoProjectWorkflowPreferences(input: {
    workflow: AutoProjectWorkflow;
    imageModel: AiModel;
    videoModel: AiModel;
    preferredVideoResolution?: string | null;
    preferredVideoDuration?: string | null;
  }): AutoProjectWorkflow {
    const videoOptions = getAutoProjectVideoOptionCatalog(input.videoModel);

    return {
      ...input.workflow,
      imagePlans: input.workflow.imagePlans.map((plan) => {
        const preferences = sanitizeAutoProjectImagePreferences(input.imageModel, {
          preferredAspectRatio: plan.preferredAspectRatio,
          preferredResolution: plan.preferredResolution,
        });

        return {
          ...plan,
          preferredAspectRatio: preferences.preferredAspectRatio,
          preferredResolution: preferences.preferredResolution,
        };
      }),
      shots: input.workflow.shots.map((shot) => {
        const preferences = sanitizeAutoProjectVideoPreferences(input.videoModel, {
          preferredAspectRatio: shot.preferredAspectRatio,
          preferredResolution: input.preferredVideoResolution ?? shot.preferredResolution,
          preferredDuration: input.preferredVideoDuration ?? shot.duration,
        });

        return {
          ...shot,
          preferredAspectRatio: preferences.preferredAspectRatio,
          preferredResolution: preferences.preferredResolution,
          duration:
            preferences.preferredDuration ||
            (input.preferredVideoDuration && videoOptions.durations.length === 0
              ? input.preferredVideoDuration
              : videoOptions.durations[0] ?? shot.duration),
        };
      }),
    };
  }

  private ensureWanxR2vFirstShotReferenceImageIntent(input: {
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot | null;
    videoModel: AiModel;
  }): AutoProjectWorkflow {
    if (!this.isWanxR2vVideoModel(input.videoModel) || input.workflow.shots.length === 0) {
      return input.workflow;
    }

    const firstGeneratedShotIndex = input.workflow.shots.findIndex((shot) => shot.generationDecision !== 'skip');
    if (firstGeneratedShotIndex < 0) return input.workflow;

    const imageAssetIds = new Set(
      (input.projectSnapshot?.assets ?? [])
        .filter((asset) => asset.kind === 'image')
        .map((asset) => asset.id),
    );
    const firstShot = input.workflow.shots[firstGeneratedShotIndex];
    if (input.workflow.generatedShotIds.includes(firstShot.id)) {
      return input.workflow;
    }

    const hasImageAssetReference = firstShot.referenceAssetIds.some((assetId) => imageAssetIds.has(assetId));
    const hasCharacterReference = firstShot.referenceCharacterIds.length > 0;
    const inferredCharacterIds = this.inferAutoProjectShotCharacterIds(firstShot, input.workflow.characters);
    const fallbackCharacterId = inferredCharacterIds[0] ?? input.workflow.characters[0]?.id ?? null;
    const fallbackImageAssetId = imageAssetIds.values().next().value as string | undefined;

    const nextReferenceCharacterIds = hasCharacterReference
      ? firstShot.referenceCharacterIds
      : fallbackCharacterId
        ? [fallbackCharacterId]
        : firstShot.referenceCharacterIds;
    const nextReferenceAssetIds = hasImageAssetReference || fallbackCharacterId
      ? firstShot.referenceAssetIds
      : fallbackImageAssetId
        ? [...new Set([fallbackImageAssetId, ...firstShot.referenceAssetIds])]
        : firstShot.referenceAssetIds;
    const hasReferenceImageIntent =
      hasCharacterReference
      || hasImageAssetReference
      || nextReferenceCharacterIds.length > 0
      || nextReferenceAssetIds.some((assetId) => imageAssetIds.has(assetId));
    if (!hasReferenceImageIntent) return input.workflow;

    const promptHasReferenceIntent = /参考图|参考图片|视觉锚点|主体锚点/.test(firstShot.prompt);
    const nextPrompt = promptHasReferenceIntent
      ? firstShot.prompt
      : `首镜使用所选参考图作为主体/场景视觉锚点，保持主体造型、场景关系和风格一致。${firstShot.prompt}`;

    const shots = input.workflow.shots.map((shot, index) =>
      index === firstGeneratedShotIndex
        ? {
            ...shot,
            prompt: nextPrompt,
            referenceCharacterIds: nextReferenceCharacterIds,
            referenceAssetIds: nextReferenceAssetIds,
          }
        : shot,
    );

    return {
      ...input.workflow,
      shots,
    };
  }

  private normalizeAutoProjectComparableList(values: string[]) {
    return [...new Set(
      values
        .map((entry) => this.normalizeAutoProjectCommand(entry))
        .filter((entry) => entry.length > 0),
    )].sort();
  }

  private hasSameAutoProjectShotExecutionInputs(
    left: AutoProjectShotPlanItem | undefined,
    right: AutoProjectShotPlanItem | undefined,
  ) {
    if (!left || !right) return false;

    return (
      this.normalizeAutoProjectCommand(left.prompt) === this.normalizeAutoProjectCommand(right.prompt)
      && this.normalizeAutoProjectCommand(left.duration) === this.normalizeAutoProjectCommand(right.duration)
      && this.normalizeAutoProjectCommand(left.preferredAspectRatio ?? '')
        === this.normalizeAutoProjectCommand(right.preferredAspectRatio ?? '')
      && this.normalizeAutoProjectCommand(left.preferredResolution ?? '')
        === this.normalizeAutoProjectCommand(right.preferredResolution ?? '')
      && JSON.stringify(this.normalizeAutoProjectComparableList(left.referenceAssetIds))
        === JSON.stringify(this.normalizeAutoProjectComparableList(right.referenceAssetIds))
    );
  }

  private preserveAutoProjectGeneratedShotIds(input: {
    previousWorkflow: AutoProjectWorkflow | null;
    nextShots: AutoProjectShotPlanItem[];
  }) {
    if (!input.previousWorkflow || input.previousWorkflow.generatedShotIds.length === 0) {
      return [];
    }

    const previousShotMap = new Map(
      input.previousWorkflow.shots.map((shot) => [shot.id, shot] as const),
    );
    const nextShotMap = new Map(
      input.nextShots.map((shot) => [shot.id, shot] as const),
    );

    return input.previousWorkflow.generatedShotIds.filter((shotId) =>
      this.hasSameAutoProjectShotExecutionInputs(
        previousShotMap.get(shotId),
        nextShotMap.get(shotId),
      ),
    );
  }

  private preserveAutoProjectSkippedShotIds(input: {
    previousWorkflow: AutoProjectWorkflow | null;
    nextShots: AutoProjectShotPlanItem[];
  }) {
    if (!input.previousWorkflow || input.previousWorkflow.skippedShotIds.length === 0) {
      return [];
    }

    const previousShotMap = new Map(
      input.previousWorkflow.shots.map((shot) => [shot.id, shot] as const),
    );
    const nextShotMap = new Map(
      input.nextShots.map((shot) => [shot.id, shot] as const),
    );

    return input.previousWorkflow.skippedShotIds.filter((shotId) =>
      this.hasSameAutoProjectShotExecutionInputs(
        previousShotMap.get(shotId),
        nextShotMap.get(shotId),
      ),
    );
  }

  private buildProjectDescriptionFallback(workflow: AutoProjectWorkflow | null) {
    if (!workflow) return '';
    if (workflow.proposedProjectDescription?.trim()) return workflow.proposedProjectDescription.trim();
    if (workflow.outline.length > 0) {
      return workflow.outline
        .map((item, index) => `${index + 1}. ${item.title} ${item.summary}`.trim())
        .join('\n')
        .slice(0, 2000);
    }
    return '';
  }

  private buildProjectConceptFromWorkflow(workflow: AutoProjectWorkflow | null) {
    if (!workflow) return '';
    const parts: string[] = [];
    if (workflow.outlineTitle?.trim()) parts.push(workflow.outlineTitle.trim());
    if (workflow.outline.length > 0) {
      parts.push(
        workflow.outline
          .map((item, index) => `${index + 1}. ${item.title} ${item.summary}`.trim())
          .join('\n'),
      );
    }
    if (workflow.characters.length > 0) {
      parts.push(
        workflow.characters
          .map((item) => `${item.name}${item.role ? `(${item.role})` : ''} ${item.description}`.trim())
          .join('\n'),
      );
    }
    return parts.join('\n').trim();
  }

  private extractLatestMeaningfulProjectIdea(messages: AutoProjectRecentMessage[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== ChatMessageRole.user) continue;
      const content = this.normalizeUpstreamContent(message.content).trim();
      if (!content) continue;
      if (this.resolveExplicitAutoProjectWorkflowCommand(content, null)) continue;
      return content;
    }
    return '';
  }

  private sumShotDurations(shots: AutoProjectShotPlanItem[]) {
    return shots.reduce((total, shot) => {
      const numeric = Number((shot.duration || '').match(/\d+/)?.[0] ?? 0);
      return total + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }

  private extractLatestAutoProjectAgentMetadata(messages: Array<{
    role: string;
    providerData?: unknown;
  }>) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== ChatMessageRole.assistant) continue;

      const metadata = extractAutoProjectAgentFromProviderData(message.providerData ?? null);
      if (metadata) return metadata;
    }

    return null;
  }

  private buildAutoProjectImageTaskParametersForPlan(input: {
    plan: AutoProjectImagePlanItem;
    imageModel: AiModel;
    projectSnapshot: AutoProjectSnapshot | null;
  }) {
    const imageCapabilities = buildModelCapabilities(input.imageModel as AiModel, null);
    const assetMap = new Map((input.projectSnapshot?.assets ?? []).map((asset) => [asset.id, asset] as const));
    const referenceAssetIds = imageCapabilities.supports.contextualEdit
      ? input.plan.referenceAssetIds.filter((assetId) => assetMap.get(assetId)?.kind === 'image')
      : [];
    const referenceAssets = this.buildAutoProjectOrderedReferenceAssets(referenceAssetIds, assetMap);
    const mergedParameters = {
      ...buildChatImageTaskParameters(input.imageModel, {
        preferredAspectRatio: input.plan.preferredAspectRatio ?? null,
        preferredResolution: input.plan.preferredResolution ?? null,
        hasReferenceImages: referenceAssets.length > 0,
      }),
    };
    const maxInputImages = Math.max(1, imageCapabilities.limits.maxInputImages ?? 1);
    const contextImages = referenceAssets
      .map((asset) => asset.url.trim())
      .filter((asset) => asset.length > 0)
      .slice(0, maxInputImages);

    if (contextImages.length > 0) {
      Object.assign(
        mergedParameters,
        this.buildChatContextImageParameters(input.imageModel.provider, contextImages),
      );
    }

    return mergedParameters;
  }

  private async executeAutoProjectImagePlans(params: {
    userId: bigint;
    conversationId: bigint;
    projectId: bigint;
    projectSnapshot: AutoProjectSnapshot;
    imageModel: AiModel;
    autoProjectAgent: AutoProjectAgentContext;
    plans: AutoProjectImagePlanItem[];
    workflow: AutoProjectWorkflow;
    preferChinese: boolean;
    onStatus?: (message: string) => void;
  }) {
    const imageCapabilities = buildModelCapabilities(params.imageModel as AiModel, null);
    const assetMap = new Map(params.projectSnapshot.assets.map((asset) => [asset.id, asset] as const));
    const taskRefs: ChatTaskRef[] = [];
    const failures: string[] = [];

    for (const [index, plan] of params.plans.entries()) {
      try {
        params.onStatus?.(
          params.preferChinese
            ? `正在创建角色图任务 ${index + 1}/${params.plans.length}...`
            : `Creating role image task ${index + 1}/${params.plans.length}...`,
        );

        const referenceAssetIds = imageCapabilities.supports.contextualEdit
          ? plan.referenceAssetIds.filter((assetId) => assetMap.get(assetId)?.kind === 'image')
          : [];
        const referenceAssets = this.buildAutoProjectOrderedReferenceAssets(referenceAssetIds, assetMap);
        const referenceImages = referenceAssets.map((asset) => asset.url);
        const prompt = this.buildAutoProjectPromptWithReferences({
          prompt: this.buildAutoProjectImageExecutionPrompt(plan, params.preferChinese),
          references: referenceAssets,
          preferChinese: params.preferChinese,
          projectContext: null,
        });

        const { createdTask } = await this.generateAutoProjectImageTask({
          userId: params.userId,
          projectId: params.projectId,
          imageModelIdRaw: params.autoProjectAgent.imageModelId,
          prompt,
          negativePrompt: plan.negativePrompt ?? undefined,
          currentImages: referenceImages,
          preferredAspectRatio: plan.preferredAspectRatio,
          preferredResolution: plan.preferredResolution,
        });

        await this.attachAutoProjectAssetMetadataToTask({
          kind: 'image',
          taskId: createdTask.id,
          metadata: {
            planId: plan.id,
            title: plan.title,
            description: this.buildAutoProjectImageAssetDescription(
              plan,
              referenceAssets.map((asset) => asset.mentionLabel),
              params.preferChinese,
            ),
            sourcePrompt: prompt,
            referenceLabels: referenceAssets.map((asset) => asset.mentionLabel),
            referenceAssetIds: referenceAssets.map((asset) => asset.id),
            referenceCharacterIds: plan.referenceCharacterIds,
            workflowStage: 'project_setup_confirmation',
            finalStoryboard: false,
          },
        });

        taskRefs.push(this.toChatImageTaskRef(createdTask));
      } catch (error) {
        const reason = this.normalizeExceptionMessage(error);
        failures.push(
          params.preferChinese
            ? `第 ${index + 1} 个角色图任务创建失败：${reason}`
            : `Role image task ${index + 1} failed: ${reason}`,
        );
      }
    }

    return { taskRefs, failures };
  }

  private async executeAutoProjectShotPlans(params: {
    userId: bigint;
    conversationId: bigint;
    conversation: AutoProjectConversationContext;
    projectId: bigint;
    projectSnapshot: AutoProjectSnapshot;
    videoModel: AiModel;
    autoProjectAgent: AutoProjectAgentContext;
    shots: AutoProjectShotPlanItem[];
    preferChinese: boolean;
    onStatus?: (message: string) => void;
    workflow: AutoProjectWorkflow;
    continuityReferences: AutoProjectOrderedReferenceAsset[];
  }) {
    const videoCapabilities = buildModelCapabilities(params.videoModel as AiModel, null);
    const assetMap = new Map(params.projectSnapshot.assets.map((asset) => [asset.id, asset] as const));
    const taskRefs: ChatTaskRef[] = [];
    const failures: string[] = [];
    const generatedShotIds: string[] = [];

    for (const [index, shot] of params.shots.entries()) {
      try {
        params.onStatus?.(
          params.preferChinese
            ? `正在创建视频任务 ${index + 1}/${params.shots.length}...`
            : `Creating video task ${index + 1}/${params.shots.length}...`,
        );

        const referenceAssetIds = shot.referenceAssetIds.filter((assetId) => {
          const asset = assetMap.get(assetId);
          if (!asset) return false;
          if (asset.kind === 'image') return videoCapabilities.supports.imageInput;
          return videoCapabilities.supports.videoInput;
        });
        const autoCharacterReferenceAssets = this.resolveAutoProjectShotCharacterReferenceAssets({
          shot,
          projectSnapshot: params.projectSnapshot,
          workflow: params.workflow,
          supportsImageInput: videoCapabilities.supports.imageInput,
        });
        const explicitReferenceAssets = referenceAssetIds
          .map((assetId) => assetMap.get(assetId) ?? null)
          .filter((asset): asset is AutoProjectAssetSnapshot => Boolean(asset));
        const fallbackReferenceImageAssets = [...params.projectSnapshot.assets]
          .reverse()
          .filter((asset) => asset.kind === 'image' && !asset.finalStoryboard);
        const firstFrameImage = this.isWanxR2vVideoModel(params.videoModel)
          ? (
              params.continuityReferences.find((asset) => this.isAutoProjectContinuityThumbnailAsset(asset))?.url
              ?? null
            )
          : null;
        const referenceAssets = this.prepareAutoProjectShotExecutionReferences({
          videoModel: params.videoModel,
          continuityReferences: params.continuityReferences,
          autoCharacterReferenceAssets,
          explicitReferenceAssets,
          fallbackReferenceImageAssets,
        });

        const currentImages = referenceAssets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => asset.url);
        const currentVideos = referenceAssets
          .filter((asset) => asset.kind === 'video')
          .map((asset) => asset.url);
        const orderedReferences: AutoProjectOrderedMediaInput[] = referenceAssets.map((asset) => ({
          kind: asset.kind,
          url: asset.url,
        }));
        const prompt = await this.requestAutoProjectShotExecutionPrompt({
          conversation: params.conversation,
          projectSnapshot: params.projectSnapshot,
          workflow: params.workflow,
          shot,
          videoModel: params.videoModel,
          references: referenceAssets,
          preferChinese: params.preferChinese,
        });

        const { createdTask } = await this.generateAutoProjectVideoTask({
          userId: params.userId,
          projectId: params.projectId,
          videoModelIdRaw: params.autoProjectAgent.videoModelId,
          prompt,
          currentImages,
          currentVideos,
          currentAudios: [],
          orderedReferences,
          preferredAspectRatio: shot.preferredAspectRatio,
          preferredResolution: params.autoProjectAgent.preferredResolution ?? shot.preferredResolution,
          preferredDuration: shot.duration,
          firstFrameImage,
        });

        await this.attachAutoProjectAssetMetadataToTask({
          kind: 'video',
          taskId: createdTask.id,
          metadata: {
            title: shot.title,
            description: this.buildAutoProjectShotAssetDescription(
              shot,
              referenceAssets.map((asset) => asset.mentionLabel),
              params.preferChinese,
            ),
            sourcePrompt: prompt,
            referenceLabels: referenceAssets.map((asset) => asset.mentionLabel),
            referenceAssetIds: referenceAssets.map((asset) => asset.id),
            referenceCharacterIds: shot.referenceCharacterIds,
            workflowStage: 'shot_review',
            shotId: shot.id,
            finalStoryboard: true,
          },
        });

        taskRefs.push(this.toChatVideoTaskRef(createdTask, {
          shotId: shot.id,
          finalStoryboard: true,
        }));
        generatedShotIds.push(shot.id);
      } catch (error) {
        const reason = this.normalizeExceptionMessage(error);
        failures.push(
          params.preferChinese
            ? `第 ${this.findShotDisplayIndex(params.workflow, shot.id)} 个视频任务创建失败：${reason}`
            : `Video task ${this.findShotDisplayIndex(params.workflow, shot.id)} failed: ${reason}`,
        );
      }
    }

    return { taskRefs, failures, generatedShotIds };
  }

  private findShotDisplayIndex(workflow: AutoProjectWorkflow, shotId: string) {
    const index = workflow.shots.findIndex((shot) => shot.id === shotId);
    return index >= 0 ? index + 1 : 1;
  }

  private buildAutoProjectFallbackName(userInput: string, preferChinese: boolean) {
    const compact = userInput.replace(/\s+/g, ' ').trim();
    if (!compact) {
      return preferChinese ? '新项目' : 'New Project';
    }

    return compact.length > 28 ? `${compact.slice(0, 28)}…` : compact;
  }

  private truncateAutoProjectText(value: string | null | undefined, maxLength: number) {
    const normalized = (value ?? '').trim();
    if (!normalized) return '';
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  private async loadAutoProjectSnapshot(userId: bigint, projectId: bigint): Promise<AutoProjectSnapshot> {
    const [project, rawAssets, rawInspirations] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id: projectId, userId },
        select: {
          id: true,
          name: true,
          concept: true,
          description: true,
        },
      }),
      this.prisma.projectAsset.findMany({
        where: { projectId, userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 24,
        select: {
          id: true,
          kind: true,
          title: true,
          description: true,
          sourcePrompt: true,
          url: true,
          thumbnailUrl: true,
          createdAt: true,
          imageTask: {
            select: {
              providerData: true,
            },
          },
          videoTask: {
            select: {
              providerData: true,
            },
          },
        },
      }),
      this.prisma.projectInspiration.findMany({
        where: { projectId, userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 16,
        select: {
          id: true,
          title: true,
          episodeNumber: true,
          ideaText: true,
          contextText: true,
          plotText: true,
          generatedPrompt: true,
          createdAt: true,
        },
      }),
    ]);

    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const inspirations = [...rawInspirations].sort((left, right) => {
      const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (leftEpisode !== rightEpisode) return leftEpisode - rightEpisode;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
    const assets = [...rawAssets].sort((left, right) => {
      const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return Number(left.id - right.id);
    });

    return {
      id: project.id.toString(),
      name: project.name,
      concept: project.concept,
      description: project.description,
      assets: assets.map((asset) => {
        const autoProjectMetadata = extractAutoProjectAssetMetadata(
          asset.imageTask?.providerData ?? asset.videoTask?.providerData,
        );

        return {
          id: asset.id.toString(),
          kind: asset.kind === 'video' ? 'video' : 'image',
          title: asset.title,
          description: asset.description,
          sourcePrompt: asset.sourcePrompt,
          url: asset.url,
          thumbnailUrl: asset.thumbnailUrl,
          createdAt: asset.createdAt,
          referenceCharacterIds: autoProjectMetadata?.referenceCharacterIds ?? [],
          workflowStage: autoProjectMetadata?.workflowStage ?? null,
          shotId: autoProjectMetadata?.shotId ?? null,
          finalStoryboard: autoProjectMetadata?.finalStoryboard === true,
        };
      }),
      inspirations: inspirations.map((item) => ({
        id: item.id.toString(),
        title: item.title,
        episodeNumber: item.episodeNumber,
        ideaText: item.ideaText,
        contextText: item.contextText,
        plotText: item.plotText,
        generatedPrompt: item.generatedPrompt,
        createdAt: item.createdAt,
      })),
    };
  }

  private buildAutoProjectReferenceLabel(kind: AutoProjectAssetSnapshot['kind'], ordinal: number) {
    return `@${kind === 'video' ? '视频' : '图'}${ordinal}`;
  }

  private buildAutoProjectOrderedReferenceAssets(
    referenceAssetIds: string[],
    assetMap: Map<string, AutoProjectAssetSnapshot>,
  ): AutoProjectOrderedReferenceAsset[] {
    return this.buildAutoProjectOrderedReferenceAssetsFromAssets(
      referenceAssetIds
        .map((assetId) => assetMap.get(assetId) ?? null)
        .filter((asset): asset is AutoProjectAssetSnapshot => Boolean(asset)),
    );
  }

  private buildAutoProjectOrderedReferenceAssetsFromAssets(
    assets: AutoProjectAssetSnapshot[],
  ): AutoProjectOrderedReferenceAsset[] {
    const orderedAssets: AutoProjectOrderedReferenceAsset[] = [];
    const seenAssetIds = new Set<string>();

    for (const asset of assets) {
      if (seenAssetIds.has(asset.id)) continue;
      seenAssetIds.add(asset.id);
      orderedAssets.push({
        ...asset,
        ordinal: orderedAssets.length + 1,
        mentionLabel: '',
      });
    }

    return this.assignAutoProjectReferenceLabels(orderedAssets);
  }

  private prepareAutoProjectShotExecutionReferences(input: {
    videoModel: AiModel;
    continuityReferences: AutoProjectOrderedReferenceAsset[];
    autoCharacterReferenceAssets: AutoProjectAssetSnapshot[];
    explicitReferenceAssets: AutoProjectAssetSnapshot[];
    fallbackReferenceImageAssets: AutoProjectAssetSnapshot[];
  }) {
    const videoCapabilities = buildModelCapabilities(input.videoModel as AiModel, null);
    const remoteModel = String((input.videoModel as any).modelKey ?? '').trim().toLowerCase();
    const isSeedance15Pro = remoteModel.includes('seedance-1-5-pro');
    const isSeedance20 = this.isSeedance20VideoModel(input.videoModel);
    const isWanxR2v = this.isWanxR2vVideoModel(input.videoModel);
    const maxInputImages = Math.max(1, videoCapabilities.limits.maxInputImages ?? 1);
    const maxInputVideos = Math.max(1, videoCapabilities.limits.maxInputVideos ?? 1);

    const continuityThumbnail = input.continuityReferences.find((asset) =>
      this.isAutoProjectContinuityThumbnailAsset(asset),
    );
    const continuityVideos = input.continuityReferences.filter((asset) =>
      this.isAutoProjectContinuityVideoAsset(asset),
    );
    const otherContinuityAssets = input.continuityReferences.filter((asset) =>
      !this.isAutoProjectContinuityThumbnailAsset(asset) && !this.isAutoProjectContinuityVideoAsset(asset),
    );
    const explicitCharacterReferenceAssets = input.explicitReferenceAssets.filter((asset) =>
      asset.kind === 'image' && asset.referenceCharacterIds.length > 0,
    );
    const otherExplicitReferenceAssets = input.explicitReferenceAssets.filter((asset) =>
      !(asset.kind === 'image' && asset.referenceCharacterIds.length > 0),
    );
    const isFirstWanxR2vShot = isWanxR2v && input.continuityReferences.length === 0;
    const explicitWanxImageReferences = [
      ...input.autoCharacterReferenceAssets,
      ...explicitCharacterReferenceAssets,
      ...otherExplicitReferenceAssets.filter((asset) => asset.kind === 'image'),
    ];
    const wanxFallbackImageReferences = isFirstWanxR2vShot && explicitWanxImageReferences.length === 0
      ? input.fallbackReferenceImageAssets
      : [];

    // Seedance 1.5 Pro stays in reference-image mode:
    // only pass the previous-shot last frame plus the current shot's necessary character sheets.
    const prioritizedAssets: AutoProjectAssetSnapshot[] = isWanxR2v
      ? isFirstWanxR2vShot
        ? [
            ...input.autoCharacterReferenceAssets,
            ...explicitCharacterReferenceAssets,
            ...otherExplicitReferenceAssets.filter((asset) => asset.kind === 'image'),
            ...wanxFallbackImageReferences,
            ...otherExplicitReferenceAssets.filter((asset) => asset.kind !== 'image'),
            ...otherContinuityAssets,
          ]
        : [
            ...continuityVideos,
            ...input.autoCharacterReferenceAssets,
            ...explicitCharacterReferenceAssets,
            ...otherExplicitReferenceAssets,
            ...otherContinuityAssets,
          ]
      : isSeedance15Pro
      ? [
          ...(continuityThumbnail ? [continuityThumbnail] : []),
          ...input.autoCharacterReferenceAssets,
          ...explicitCharacterReferenceAssets,
        ]
      : isSeedance20
      ? [
          ...input.autoCharacterReferenceAssets,
          ...explicitCharacterReferenceAssets,
          ...continuityVideos,
          ...otherContinuityAssets,
          ...otherExplicitReferenceAssets,
        ]
      : [
          ...input.autoCharacterReferenceAssets,
          ...explicitCharacterReferenceAssets,
          ...(continuityThumbnail ? [continuityThumbnail] : []),
          ...continuityVideos,
          ...otherContinuityAssets,
          ...otherExplicitReferenceAssets,
        ];

    const selectedAssets: AutoProjectAssetSnapshot[] = [];
    const seenAssetIds = new Set<string>();
    const maxVisualAssetCount = isWanxR2v
      ? Math.max(0, 5 - (continuityThumbnail?.url?.trim() ? 1 : 0))
      : Number.MAX_SAFE_INTEGER;
    let imageCount = 0;
    let videoCount = 0;

    for (const asset of prioritizedAssets) {
      if (!asset.url?.trim()) continue;
      if (seenAssetIds.has(asset.id)) continue;
      if (isWanxR2v && imageCount + videoCount >= maxVisualAssetCount) continue;

      if (asset.kind === 'image') {
        if (!videoCapabilities.supports.imageInput) continue;
        if (imageCount >= maxInputImages) continue;
        imageCount += 1;
      } else {
        if (!videoCapabilities.supports.videoInput) continue;
        if (videoCount >= maxInputVideos) continue;
        videoCount += 1;
      }

      seenAssetIds.add(asset.id);
      selectedAssets.push(asset);
    }

    return this.buildAutoProjectOrderedReferenceAssetsFromAssets(selectedAssets);
  }

  private resolveAutoProjectShotCharacterReferenceAssets(input: {
    shot: AutoProjectShotPlanItem;
    projectSnapshot: AutoProjectSnapshot;
    workflow: AutoProjectWorkflow;
    supportsImageInput: boolean;
  }) {
    if (!input.supportsImageInput) {
      return [] as AutoProjectAssetSnapshot[];
    }

    const explicitCharacterIds = input.shot.referenceCharacterIds;
    const inferredCharacterIds = explicitCharacterIds.length > 0
      ? explicitCharacterIds
      : this.inferAutoProjectShotCharacterIds(input.shot, input.workflow.characters);
    if (inferredCharacterIds.length === 0) return [] as AutoProjectAssetSnapshot[];

    const latestAssetByCharacterId = new Map<string, AutoProjectAssetSnapshot>();

    for (const asset of [...input.projectSnapshot.assets].reverse()) {
      if (asset.kind !== 'image') continue;
      if (asset.finalStoryboard) continue;
      if (asset.workflowStage !== 'project_setup_confirmation' && asset.referenceCharacterIds.length === 0) {
        continue;
      }

      const assetCharacterIds = asset.referenceCharacterIds.length > 0
        ? asset.referenceCharacterIds
        : this.inferAutoProjectAssetCharacterIds(asset, input.workflow.characters);

      for (const characterId of assetCharacterIds) {
        if (!inferredCharacterIds.includes(characterId)) continue;
        if (!latestAssetByCharacterId.has(characterId)) {
          latestAssetByCharacterId.set(characterId, asset);
        }
      }
    }

    const orderedAssets: AutoProjectAssetSnapshot[] = [];
    const seenAssetIds = new Set<string>();

    for (const characterId of inferredCharacterIds) {
      const asset = latestAssetByCharacterId.get(characterId);
      if (!asset || seenAssetIds.has(asset.id)) continue;
      seenAssetIds.add(asset.id);
      orderedAssets.push(asset);
    }

    return orderedAssets;
  }

  private inferAutoProjectShotCharacterIds(
    shot: AutoProjectShotPlanItem,
    characters: AutoProjectCharacterItem[],
  ) {
    if (characters.length === 0) return [] as string[];

    const haystack = this.normalizeAutoProjectCommand(
      [shot.title, shot.summary, shot.script, shot.prompt].filter(Boolean).join('\n'),
    );
    if (!haystack) return [] as string[];

    return characters
      .filter((character) => {
        const normalizedName = this.normalizeAutoProjectCommand(character.name);
        return normalizedName.length > 0 && haystack.includes(normalizedName);
      })
      .map((character) => character.id)
      .slice(0, 8);
  }

  private inferAutoProjectAssetCharacterIds(
    asset: AutoProjectAssetSnapshot,
    characters: AutoProjectCharacterItem[],
  ) {
    if (characters.length === 0) return [] as string[];

    const haystack = this.normalizeAutoProjectCommand(
      [asset.title, asset.description, asset.sourcePrompt].filter(Boolean).join('\n'),
    );
    if (!haystack) return [] as string[];

    return characters
      .filter((character) => {
        const normalizedName = this.normalizeAutoProjectCommand(character.name);
        return normalizedName.length > 0 && haystack.includes(normalizedName);
      })
      .map((character) => character.id)
      .slice(0, 8);
  }

  private assignAutoProjectReferenceLabels(assets: AutoProjectOrderedReferenceAsset[]) {
    let imageIndex = 0;
    let videoIndex = 0;

    return assets.map((asset, index) => {
      const nextIndex = asset.kind === 'video' ? ++videoIndex : ++imageIndex;
      return {
        ...asset,
        ordinal: index + 1,
        mentionLabel: this.buildAutoProjectReferenceLabel(asset.kind, nextIndex),
      };
    });
  }

  private isAutoProjectContinuityThumbnailAsset(asset: AutoProjectOrderedReferenceAsset) {
    return asset.id.startsWith('continuity-thumb:');
  }

  private isAutoProjectContinuityVideoAsset(asset: AutoProjectOrderedReferenceAsset) {
    return asset.id.startsWith('continuity:');
  }

  private buildAutoProjectPromptWithReferences(input: {
    prompt: string;
    references: AutoProjectOrderedReferenceAsset[];
    preferChinese: boolean;
    projectContext?: string | null;
    inlineCharacterLabels?: Array<{ name: string; label: string }> | null;
  }) {
    const prompt = this.annotateAutoProjectPromptWithInlineLabels(
      this.sanitizeAutoProjectGenerationPrompt(input.prompt),
      input.inlineCharacterLabels ?? [],
    );
    if (!prompt && input.references.length === 0) return prompt;

    const referenceLine = this.buildAutoProjectReferencePromptLine(input.references, input.preferChinese);

    return [referenceLine, prompt]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join('\n');
  }

  private async requestAutoProjectShotExecutionPrompt(input: {
    conversation: AutoProjectConversationContext;
    projectSnapshot: AutoProjectSnapshot;
    workflow: AutoProjectWorkflow;
    shot: AutoProjectShotPlanItem;
    videoModel: AiModel;
    references: AutoProjectOrderedReferenceAsset[];
    preferChinese: boolean;
  }) {
    const completion = await this.requestChatCompletion(
      input.conversation,
      this.injectSystemContextIntoUpstream(
        [
          {
            role: 'user',
            content: this.buildAutoProjectShotExecutionPlannerUserPrompt(input),
          },
        ],
        input.conversation.model.systemPrompt,
        this.buildAutoProjectShotExecutionPlannerSystemPrompt({
          preferChinese: input.preferChinese,
          videoModel: input.videoModel,
        }),
      ),
    );

    const raw = (completion.content || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || raw;
    const parsed = this.tryParseJson(candidate);
    const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;

    const prompt =
      this.normalizeUpstreamContent(
        source?.prompt
        ?? source?.finalPrompt
        ?? source?.videoPrompt
        ?? source?.text,
      ).trim()
      || raw;

    if (!prompt) {
      throw new BadRequestException(
        input.preferChinese
          ? '分镜最终提示词生成失败：上游返回为空。'
          : 'Failed to generate the final shot prompt: upstream returned empty content.',
      );
    }

    const constrainedPrompt = this.enforceAutoProjectShotExecutionPromptConstraints({
      prompt: this.annotateAutoProjectPromptWithInlineLabels(
        prompt,
        this.buildAutoProjectInlineCharacterLabels({
          references: input.references,
          workflow: input.workflow,
        }),
      ),
      videoModel: input.videoModel,
      references: input.references,
      preferChinese: input.preferChinese,
    });

    return this.applyAutoProjectPreviousShotOpeningContinuityPrefix({
      prompt: constrainedPrompt,
      workflow: input.workflow,
      projectSnapshot: input.projectSnapshot,
      shot: input.shot,
      videoModel: input.videoModel,
    });
  }

  private buildAutoProjectShotExecutionPlannerSystemPrompt(input: {
    preferChinese: boolean;
    videoModel: AiModel;
  }) {
    const isWanxR2v = this.isWanxR2vVideoModel(input.videoModel);
    const isSeedance20 = this.isSeedance20VideoModel(input.videoModel);

    return [
      '你是一个逐镜视频提示词规划助手，只负责生成当前这一镜最终提交给视频模型的提示词。',
      '你必须根据当前镜头剧本、项目剧情、主体设定和本次实际会上传的参考素材编号，生成工程化、高可执行、低歧义的最终提示词。',
      '你的目标不是堆砌形容词，而是把当前一镜改写成可直接提交给视频模型的高质量制作提示词。',
      '最终提示词必须由你自己直接写出系统已提供的编号标记，严禁依赖后端补写编号。',
      '只能使用输入里给出的参考编号，不能发明新的图片、视频或音频编号，也不能改写当前编号体系。',
      '如果某个主体参考图被使用，必须把编号和明确主体绑定在一起，例如“灰瓦[图1]”或“[图1]中的灰瓦”。',
      '只要正文里出现某个已引用主体名，这个主体名的每一次出现都必须保持同一个编号绑定，不能只标第一次。',
      '禁止把编号当成裸主体使用，例如不要写“[图1]冲向镜头”。必须写成“灰瓦[图1]冲向镜头”或“[图1]中的主体冲向镜头”。',
      isWanxR2v
        ? '如果系统单独提供了上一镜尾帧作为 firstFrame 参数，不要在正文里额外写“请严格以[图n]作为首帧”或“接着[视频n]继续生成”之类句式；首帧续镜由系统参数处理，正文只需围绕当前镜头内容、角色绑定和一致性约束来写。'
        : isSeedance20
        ? 'Seedance 2.0 的第二镜及以后是独立新镜头，不要把上一镜尾帧或上一镜视频写成首帧约束；严禁写“请严格以[图n]作为首帧”“从上一镜尾帧开始生成”“接着[视频n]继续生成”之类句式。'
        : '如果存在上一镜尾帧图片，这是一条硬约束：你必须把这张尾帧图当作当前镜头唯一的首帧基准，并在提示词正文里明确写出“请严格以[图3]作为首帧开始生成，并自然延续上一镜主体状态、动作方向与镜头运动”这一类表述。',
      isWanxR2v
        ? '如果系统单独提供了上一镜尾帧作为 firstFrame 参数，第二镜及以后仍然要自然延续上一镜主体状态、动作方向、速度节奏与镜头运动，但不要在正文里重复声明该系统级首帧约束。'
        : isSeedance20
        ? 'Seedance 2.0 第二镜及以后只需作为下一独立镜头自然承接上一镜：延续主体状态、动作方向、速度节奏、空间关系和情绪，但允许重新组织当前镜头的开场构图、机位、景别与运镜。'
        : '第二镜及以后一旦提供了上一镜尾帧图片，就禁止重新设计开场构图、机位、景别、主体姿态、主体朝向、站位关系或光线关系，必须从该尾帧自然续接。',
      isWanxR2v
        ? '如果系统参数没有把上一镜视频作为参考输入，就不要在正文里主动补写“接着[视频n]继续生成”之类句式。'
        : isSeedance20
        ? '如果系统上传了上一镜视频作为参考，正文应写“参考[视频n]的主体状态、动作方向、节奏与空间关系，当前镜头作为下一独立镜头自然衔接”，不要写“接着[视频n]继续生成”。'
        : '如果同时存在上一镜成片视频，也必须在正文里继续明确写出“接着[视频1]继续生成，声音也要与[视频1]末尾连续”这一类表述，延续主体状态、动作方向、速度节奏、镜头运动与声音音效。',
      '提示词不要求固定标题格式，但正文内容必须明确覆盖这些要求：镜头设定要写清景别、机位、单一主运镜、总时长；剧情目标要写清主体是谁、做什么动作、保持什么情绪；总时长必须拆成 3 段执行：开场进入、中段主动作、结尾收束。',
      '如果输入中提供了上一镜内容，当前提示词的“开场进入”必须直接承接上一镜“结尾收束”的具体内容：上一镜尾段的动作、场景变化、主体朝向、空间关系和情绪状态，要成为当前镜头首段的起点。不要把下一镜写成无关的新开场。',
      '即使是 Seedance 2.0 这类独立新镜头，也必须在叙事、动作和空间上承接上一镜尾段；区别只是不能写成首帧约束或“接着视频继续生成”。',
      '如果有对白、口播或台词表演，必须明确要求口型与停顿同步；如果没有台词，必须明确要求依靠呼吸、眼神、肢体动作表达情绪。',
      '结尾必须明确要求形成可接下一镜头的结束姿态。',
      '如果本镜使用了参考图片，必须明确要求服装、场景、道具和主体造型保持稳定，不要漂移。',
      '风格词和基础动作描述不能丢，必须自然塞进最终提示词里。',
      '质量约束必须明确强调动作连贯、物理合理、避免跳帧、避免面部或肢体变形。',
      '同一镜内只保留一种主运镜方式。禁止同时出现互相冲突的推、拉、摇、移、跟拍要求。',
      '镜头内可以使用“开场进入 / 中段主动作 / 结尾收束”或语义等价的自然表达来组织时间推进，不需要固定标题，但 3 段逻辑不能缺失。',
      '多人或多主体正面动态镜头必须加入强方位约束、服装/身份/造型锚点，优先使用固定机位或简单单一运镜，降低跳脸、漂移和穿模。',
      '结尾必须补充画质与防崩约束，例如 4K 高清、细节丰富、主体稳定、结构清晰、无变形、无穿模、动作连贯、物理合理、避免跳帧。',
      '提示词必须是简体中文。',
      '提示词必须聚焦当前一镜，不要输出解释、审稿意见、项目总结或 JSON 之外的文字，不要输出 markdown 代码块。',
      '返回 JSON：{"prompt":"string"}',
    ].join('\n');
  }

  private buildAutoProjectShotExecutionPlannerUserPrompt(input: {
    projectSnapshot: AutoProjectSnapshot;
    workflow: AutoProjectWorkflow;
    shot: AutoProjectShotPlanItem;
    videoModel: AiModel;
    references: AutoProjectOrderedReferenceAsset[];
    preferChinese: boolean;
  }) {
    const isWanxR2v = this.isWanxR2vVideoModel(input.videoModel);
    const isSeedance20 = this.isSeedance20VideoModel(input.videoModel);
    const continuityThumbnail = input.references.find((asset) =>
      this.isAutoProjectContinuityThumbnailAsset(asset),
    ) ?? null;
    const continuityVideo = input.references.find((asset) =>
      this.isAutoProjectContinuityVideoAsset(asset),
    ) ?? null;
    const continuityThumbnailLabel = continuityThumbnail
      ? this.buildAutoProjectPromptReferenceTag(continuityThumbnail.mentionLabel)
      : '';
    const continuityVideoLabel = continuityVideo
      ? this.buildAutoProjectPromptReferenceTag(continuityVideo.mentionLabel)
      : '';
    const hasImageReferences = input.references.some((asset) => asset.kind === 'image');
    const previousShotContinuity = this.resolveAutoProjectPreviousShotContinuityContext({
      workflow: input.workflow,
      projectSnapshot: input.projectSnapshot,
      shot: input.shot,
    });

    const outlineText = input.workflow.outline.length > 0
      ? input.workflow.outline
          .map((item, index) => `${index + 1}. ${item.title}｜${item.summary}`)
          .join('\n')
      : '无';

    const characterText = input.workflow.characters.length > 0
      ? input.workflow.characters
          .map((item, index) => `${index + 1}. ${item.name}${item.role ? `｜${item.role}` : ''}\n设定：${item.description}\n视觉：${item.visualPrompt}`)
          .join('\n\n')
      : '无';

    const shotText = input.workflow.shots.length > 0
      ? input.workflow.shots
          .map((item, index) => `${index + 1}. ${item.title}\n画面：${item.summary}\n剧本：${item.script}\n时长：${item.duration}\n草稿提示词：${this.truncateAutoProjectText(item.prompt, 700)}`)
          .join('\n\n')
      : '无';
    const previousShotText = previousShotContinuity
      ? [
          `上一镜序号：${previousShotContinuity.index + 1}`,
          `上一镜标题：${previousShotContinuity.shot.title}`,
          `上一镜画面：${previousShotContinuity.shot.summary}`,
          `上一镜剧本：${previousShotContinuity.shot.script}`,
          `上一镜时长：${previousShotContinuity.shot.duration}`,
          `上一镜可参考提示词：${previousShotContinuity.sourcePrompt}`,
          `上一镜尾段承接点：${previousShotContinuity.endingText}`,
        ].join('\n')
      : '无';

    const projectAssetText = input.projectSnapshot.assets.length > 0
      ? input.projectSnapshot.assets
          .map((asset) =>
            [
              asset.kind === 'video' ? '视频' : '图片',
              this.truncateAutoProjectText(asset.title, 80),
              this.truncateAutoProjectText(asset.description, 200),
              this.truncateAutoProjectText(asset.sourcePrompt, 200),
            ]
              .filter((part) => part && part.length > 0)
              .join(' | '),
          )
          .join('\n')
      : '无';

    const executionReferenceText = input.references.length > 0
      ? input.references
          .map((asset) => {
            const label = asset.mentionLabel.replace(/^@/, '');
            const extraNotes: string[] = [];
            if (this.isAutoProjectContinuityThumbnailAsset(asset)) {
              extraNotes.push('上一镜尾帧');
            }
            if (this.isAutoProjectContinuityVideoAsset(asset)) {
              extraNotes.push('上一镜成片');
            }
            if (asset.referenceCharacterIds.length > 0) {
              const names = asset.referenceCharacterIds
                .map((characterId) => input.workflow.characters.find((item) => item.id === characterId)?.name ?? '')
                .filter((name) => name.trim().length > 0);
              if (names.length > 0) {
                extraNotes.push(`主体：${names.join('、')}`);
              }
            }

            return [
              label,
              asset.kind === 'video' ? '视频' : '图片',
              this.truncateAutoProjectText(asset.title, 80),
              this.truncateAutoProjectText(asset.description, 220),
              this.truncateAutoProjectText(asset.sourcePrompt, 220),
              extraNotes.join(' | '),
            ]
              .filter((part) => part && part.length > 0)
              .join(' | ');
          })
          .join('\n')
      : '无';

    return [
      `项目名称：${input.projectSnapshot.name}`,
      input.projectSnapshot.description ? `项目描述：${input.projectSnapshot.description}` : '项目描述：',
      input.projectSnapshot.concept ? `项目概念：${input.projectSnapshot.concept}` : '项目概念：',
      `故事大纲：\n${outlineText}`,
      `主体设定：\n${characterText}`,
      `全部分镜：\n${shotText}`,
      `上一镜尾段连续性：\n${previousShotText}`,
      `项目全部素材：\n${projectAssetText}`,
      `当前目标分镜：\n标题：${input.shot.title}\n画面：${input.shot.summary}\n剧本：${input.shot.script}\n时长：${input.shot.duration}\n草稿提示词：${input.shot.prompt}`,
      `本次实际上传的参考素材及最终编号（只能使用这些编号）：\n${executionReferenceText}`,
      `主体名与参考编号映射：\n${this.buildAutoProjectInlineCharacterLabelSummary(input.references, input.workflow, input.preferChinese)}`,
      '请返回当前这一镜最终提交给视频模型的中文提示词，不要返回说明文字。',
      '要求：提示词要工程化，避免空泛形容词堆砌，不强制固定标题格式，但正文里必须自然写清景别、机位、单一主运镜、总时长、主体、动作、情绪、风格、画质与防崩约束。',
      `请把当前镜头总时长 ${input.shot.duration} 拆成 3 段来写：开场进入、中段主动作、结尾收束。`,
      previousShotContinuity
        ? `连续性硬要求：当前提示词的“开场进入”必须直接承接上一镜尾段承接点“${previousShotContinuity.endingText}”。也就是上一镜结尾发生了什么，当前镜头首段就从这个动作后果、同一空间关系、同一主体状态继续；如果上一镜尾段是“水滴滴入池塘”，当前首段就必须从水滴入水后的池塘、涟漪扩散或主体对该场景的后续反应开始。`
        : null,
      '如果有对白、口播或台词表演，提示词里必须要求口型与停顿同步；如果没有台词，也必须要求通过呼吸、眼神、肢体动作表达情绪。',
      '结尾必须形成可接下一镜头的结束姿态。',
      hasImageReferences
        ? '由于本镜实际会上传参考图片，提示词里必须明确要求服装、场景、道具和主体造型不要漂移。'
        : '如本镜依赖参考图片，请在提示词里明确要求服装、场景、道具和主体造型不要漂移。',
      isWanxR2v && !previousShotContinuity && hasImageReferences
        ? '万相首镜参考图硬要求：当前是第一条生成分镜，提示词正文必须直接写出会使用本次上传的参考图片编号作为主体/场景视觉锚点，并要求主体造型、关键道具、空间关系和风格保持一致。'
        : null,
      '把草稿中的风格词和基础动作描述自然融入最终提示词，不要丢失。',
      '质量约束里必须强调动作连贯、物理合理、避免跳帧和变形。',
      isSeedance20 && continuityVideoLabel
        ? `续镜参考：${continuityVideoLabel}是上一镜成片，只作为当前镜头的连续性参考。提示词必须表达“参考${continuityVideoLabel}的主体状态、动作方向、节奏与空间关系，当前镜头作为下一独立镜头自然衔接”，不要写“接着${continuityVideoLabel}继续生成”。`
        : continuityThumbnailLabel && !isWanxR2v
        ? `续镜硬约束：当前镜头不是第一镜，必须严格以${continuityThumbnailLabel}作为本镜头首帧开始生成，不得重写开场构图、机位、景别、主体姿态、主体朝向、站位关系或光线关系。`
        : '提示词正文必须直接包含系统给出的参考编号，不得遗漏、替换或自造编号。',
      isSeedance20
        ? 'Seedance 2.0 本镜是独立新镜头：严禁在正文写“以[图n]作为首帧”“从上一镜尾帧开始”“接着[视频n]继续生成”等首帧化或单镜头续写句式；只写镜头之间的叙事、动作和空间连续性。'
        : continuityThumbnailLabel && !isWanxR2v
        ? continuityVideoLabel
          ? `正文里必须明确写出类似“请严格以${continuityThumbnailLabel}作为首帧开始生成，接着${continuityVideoLabel}继续生成”的句式，体现上一镜尾帧首帧对齐和上一镜视频续接。`
          : `正文里必须明确写出类似“请严格以${continuityThumbnailLabel}作为首帧开始生成，并自然延续上一镜主体状态、动作方向与镜头运动”的句式，把上一镜尾帧图作为唯一首帧基准。`
        : isWanxR2v
          ? '如果系统通过 firstFrame 单独传入上一镜尾帧，不要在正文里再写“请严格以[图n]作为首帧”或“接着[视频n]继续生成”的句式；正文只需要自然描述当前镜头并保持角色与造型一致。'
          : '如果有续镜尾帧和上一镜视频，必须明确写出首帧对齐和续接生成关系。',
      '如果正文里出现主体名，则该主体名每次出现都必须和同一个参考编号绑定。',
      '镜头内可用“开场进入 / 中段主动作 / 结尾收束”或自然等价表达来组织时序。',
      '多人或多主体正面动态场景请加入左右站位、服装/身份/造型锚点，优先使用固定机位或单一运镜。',
      '提示词结尾补充高画质和稳定性约束，例如面部稳定、肢体自然、无变形、无穿模、动作连贯、物理合理、避免跳帧。',
    ].join('\n\n');
  }

  private resolveAutoProjectPreviousShotContinuityContext(input: {
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot;
    shot: AutoProjectShotPlanItem;
  }) {
    const currentShotIndex = input.workflow.shots.findIndex((item) => item.id === input.shot.id);
    if (currentShotIndex <= 0) return null;

    let previousShotIndex = currentShotIndex - 1;
    while (
      previousShotIndex >= 0
      && input.workflow.skippedShotIds.includes(input.workflow.shots[previousShotIndex].id)
    ) {
      previousShotIndex -= 1;
    }
    if (previousShotIndex < 0) return null;

    const previousShot = input.workflow.shots[previousShotIndex];
    const previousVideoAsset = [...input.projectSnapshot.assets]
      .reverse()
      .find((asset) =>
        asset.kind === 'video'
        && asset.finalStoryboard
        && asset.shotId === previousShot.id
        && typeof asset.sourcePrompt === 'string'
        && asset.sourcePrompt.trim().length > 0,
      );
    const rawSourcePrompt =
      previousVideoAsset?.sourcePrompt
      || previousShot.prompt
      || previousShot.script
      || previousShot.summary;
    const sourcePrompt = this.truncateAutoProjectText(rawSourcePrompt, 1200);
    const endingText = this.extractAutoProjectEndingSegmentText(rawSourcePrompt);

    return {
      index: previousShotIndex,
      shot: previousShot,
      sourcePrompt,
      endingText,
    };
  }

  private extractAutoProjectEndingSegmentText(value: string | null | undefined) {
    const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const markers = ['结尾收束', '尾段', '结尾', '结束时', '最后', '末尾'];
    const markerIndex = markers.reduce((latestIndex, marker) => {
      const index = normalized.lastIndexOf(marker);
      return index > latestIndex ? index : latestIndex;
    }, -1);
    const endingCandidate = markerIndex >= 0 ? normalized.slice(markerIndex) : normalized.slice(-320);
    return this.truncateAutoProjectText(endingCandidate, 320);
  }

  private applyAutoProjectPreviousShotOpeningContinuityPrefix(input: {
    prompt: string;
    workflow: AutoProjectWorkflow;
    projectSnapshot: AutoProjectSnapshot;
    shot: AutoProjectShotPlanItem;
    videoModel: AiModel;
  }) {
    const prompt = (input.prompt || '').trim();
    if (!prompt) return prompt;
    if (prompt.includes('开场进入承接上一镜尾段')) return prompt;

    const previousShotContinuity = this.resolveAutoProjectPreviousShotContinuityContext({
      workflow: input.workflow,
      projectSnapshot: input.projectSnapshot,
      shot: input.shot,
    });
    if (!previousShotContinuity?.endingText) return prompt;

    const continuityModeNote = this.isSeedance20VideoModel(input.videoModel)
      ? '当前镜头仍是独立新镜头，只承接叙事、动作和空间关系，不写首帧约束或“接着视频继续生成”。'
      : this.isWanxR2vVideoModel(input.videoModel)
        ? '系统参数会传入万相所需参考素材，不在正文里重复写 firstFrame 首帧约束。'
        : '当前镜头首段必须从上一镜尾段自然续接。';

    return [
      `开场进入承接上一镜尾段：当前镜头第一段必须从上一镜尾段“${previousShotContinuity.endingText}”继续，保持同一动作后果、同一空间关系、同一主体状态和情绪节奏。${continuityModeNote}`,
      prompt,
    ].join('\n\n');
  }

  private buildAutoProjectPromptReferenceTag(label: string) {
    const normalized = label.replace(/^@/, '').trim();
    return normalized ? `[${normalized}]` : '';
  }

  private enforceAutoProjectShotExecutionPromptConstraints(input: {
    prompt: string;
    videoModel: AiModel;
    references: AutoProjectOrderedReferenceAsset[];
    preferChinese: boolean;
  }) {
    const basePrompt = (input.prompt || '').trim();
    if (!basePrompt) return basePrompt;
    if (this.isWanxR2vVideoModel(input.videoModel)) {
      return basePrompt;
    }
    if (this.isSeedance20VideoModel(input.videoModel)) {
      return this.enforceSeedance20AutoProjectShotPromptConstraints(input);
    }

    const continuityThumbnail = input.references.find((asset) =>
      this.isAutoProjectContinuityThumbnailAsset(asset),
    ) ?? null;
    const continuityVideo = input.references.find((asset) =>
      this.isAutoProjectContinuityVideoAsset(asset),
    ) ?? null;

    const prefixLines: string[] = [];
    const continuityThumbnailLabel = continuityThumbnail
      ? this.buildAutoProjectPromptReferenceTag(continuityThumbnail.mentionLabel)
      : '';
    const continuityVideoLabel = continuityVideo
      ? this.buildAutoProjectPromptReferenceTag(continuityVideo.mentionLabel)
      : '';

    if (continuityThumbnailLabel && !this.hasAutoProjectFirstFrameConstraint(basePrompt, continuityThumbnailLabel)) {
      prefixLines.push(
        `请严格以${continuityThumbnailLabel}作为首帧开始生成，并自然延续上一镜主体状态、动作方向、速度节奏与镜头运动，不得重写开场构图、机位、景别、主体姿态、主体朝向、站位关系或光线关系。`,
      );
    }

    if (continuityVideoLabel && !this.hasAutoProjectVideoContinuationConstraint(basePrompt, continuityVideoLabel)) {
      prefixLines.push(
        `接着${continuityVideoLabel}继续生成，严格延续上一镜主体状态、动作方向、速度节奏与镜头运动。`,
      );
    }

    if (prefixLines.length === 0) {
      return basePrompt;
    }

    return [...prefixLines, basePrompt].join('\n');
  }

  private enforceSeedance20AutoProjectShotPromptConstraints(input: {
    prompt: string;
    videoModel: AiModel;
    references: AutoProjectOrderedReferenceAsset[];
    preferChinese: boolean;
  }) {
    const basePrompt = (input.prompt || '').trim();
    const continuityVideo = input.references.find((asset) =>
      this.isAutoProjectContinuityVideoAsset(asset),
    ) ?? null;
    const continuityThumbnail = input.references.find((asset) =>
      this.isAutoProjectContinuityThumbnailAsset(asset),
    ) ?? null;
    const continuityVideoLabel = continuityVideo
      ? this.buildAutoProjectPromptReferenceTag(continuityVideo.mentionLabel)
      : '';
    const continuityThumbnailLabel = continuityThumbnail
      ? this.buildAutoProjectPromptReferenceTag(continuityThumbnail.mentionLabel)
      : '';

    let prompt = basePrompt;

    if (continuityThumbnailLabel) {
      const escapedThumbnailLabel = continuityThumbnailLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      prompt = prompt.replace(
        new RegExp(`[^\\n。！？]*${escapedThumbnailLabel}[^\\n。！？]*(?:首帧|尾帧|开始生成)[^\\n。！？]*(?:[。！？]|\\n|$)`, 'gi'),
        '',
      );
    }

    prompt = prompt
      .replace(/[^。\n！？]*(?:请)?(?:严格)?以\s*\[(?:图|图片)\d+\]\s*作为首帧[^。\n！？]*(?:[。！？]|\n|$)/gi, '')
      .replace(/[^。\n！？]*(?:从|以)\s*(?:上一镜|上一个镜头|上一条分镜)?\s*尾帧\s*(?:开始|作为首帧)[^。\n！？]*(?:[。！？]|\n|$)/gi, '')
      .trim();

    if (continuityVideoLabel) {
      const escapedVideoLabel = continuityVideoLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const continuityPhrase = `参考${continuityVideoLabel}的主体状态、动作方向、速度节奏与空间关系，当前镜头作为下一独立镜头自然衔接。`;
      prompt = prompt.replace(
        new RegExp(`接着\\s*${escapedVideoLabel}\\s*继续生成`, 'gi'),
        continuityPhrase,
      );

      if (!prompt.includes(continuityVideoLabel)) {
        prompt = [continuityPhrase, prompt].filter(Boolean).join('\n');
      }
    }

    return prompt.replace(/\n{3,}/g, '\n\n').trim() || basePrompt;
  }

  private hasAutoProjectFirstFrameConstraint(prompt: string, referenceTag: string) {
    const escapedTag = referenceTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nearbyPattern = new RegExp(
      `${escapedTag}[^\\n。！？]{0,40}(?:首帧|开始生成)|(?:首帧|开始生成)[^\\n。！？]{0,40}${escapedTag}`,
      'i',
    );

    return nearbyPattern.test(prompt);
  }

  private hasAutoProjectVideoContinuationConstraint(prompt: string, referenceTag: string) {
    const escapedTag = referenceTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nearbyPattern = new RegExp(
      `${escapedTag}[^\\n。！？]{0,40}(?:继续生成|续接|延续)|(?:继续生成|续接|延续)[^\\n。！？]{0,40}${escapedTag}`,
      'i',
    );

    return nearbyPattern.test(prompt);
  }

  private buildAutoProjectInlineCharacterLabels(input: {
    references: AutoProjectOrderedReferenceAsset[];
    workflow: AutoProjectWorkflow;
  }) {
    const labels = new Map<string, string>();

    for (const asset of input.references) {
      if (asset.kind !== 'image') continue;
      if (asset.referenceCharacterIds.length === 0) continue;

      const label = asset.mentionLabel.replace(/^@/, '').trim();
      if (!label) continue;

      for (const characterId of asset.referenceCharacterIds) {
        if (labels.has(characterId)) continue;
        const characterName = input.workflow.characters.find((item) => item.id === characterId)?.name?.trim() ?? '';
        if (!characterName) continue;
        labels.set(characterId, label);
      }
    }

    return [...labels.entries()].map(([characterId, label]) => ({
      name: input.workflow.characters.find((item) => item.id === characterId)?.name?.trim() ?? '',
      label,
    }))
      .filter((item) => item.name.length > 0 && item.label.length > 0);
  }

  private buildAutoProjectInlineCharacterLabelSummary(
    references: AutoProjectOrderedReferenceAsset[],
    workflow: AutoProjectWorkflow,
    _preferChinese: boolean,
  ) {
    const mappings = this.buildAutoProjectInlineCharacterLabels({ references, workflow })
      .map((item) => `${item.name}=${item.label}`);

    if (mappings.length === 0) {
      return '无';
    }

    return mappings.join('，');
  }

  private annotateAutoProjectPromptWithInlineLabels(
    prompt: string,
    inlineCharacterLabels: Array<{ name: string; label: string }>,
  ) {
    let annotated = prompt;

    for (const item of inlineCharacterLabels) {
      const name = item.name.trim();
      const label = item.label.trim();
      if (!name || !label) continue;

      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${escapedName}(?:\\s*\\[(?:(?:图|图片|视频|音频)\\d+)\\])?`, 'g');
      if (pattern.test(annotated)) {
        annotated = annotated.replace(pattern, `${name}[${label}]`);
      }
    }

    return annotated;
  }

  private buildAutoProjectProjectContext(input: {
    projectSnapshot: AutoProjectSnapshot | null;
    workflow: AutoProjectWorkflow | null;
    preferChinese: boolean;
  }) {
    const title = input.workflow?.outlineTitle
      || input.workflow?.proposedProjectName
      || input.projectSnapshot?.name
      || '';
    const description = input.workflow?.proposedProjectDescription
      || input.projectSnapshot?.description
      || input.projectSnapshot?.concept
      || '';
    if (!title && !description) return null;

    return [
      title ? `项目主题：${title}` : null,
      description ? `项目描述：${description}` : null,
      '风格必须严格贴合项目主题与描述。',
      '主体设定参考图必须是适合该主体类型的多视角一致性参考图。人物、动物、产品优先正面/侧面/背面/三分之四视角；星球、飞船或其他非人主体可使用多角度或正交参考视图。',
    ]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join('\n');
  }

  private sanitizeAutoProjectGenerationPrompt(prompt: string) {
    const noisePatterns = [
      /^项目主题[:：]/i,
      /^项目描述[:：]/i,
      /^project theme[:：]/i,
      /^project description[:：]/i,
      /^风格必须严格贴合/i,
      /^the style must strictly align/i,
      /^角色建模图必须/i,
      /^主体设定参考图必须/i,
      /^role modeling images must/i,
      /^primary-subject modeling\/reference images must/i,
      /^参考素材按顺序引用[:：]?/i,
      /^use ordered references[:：]?/i,
      /^编号规则[:：]?/i,
      /^label rule[:：]?/i,
      /^请严格按这些编号理解素材/i,
      /^interpret these references strictly/i,
    ];

    return (prompt || '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !noisePatterns.some((pattern) => pattern.test(line)))
      .join('\n')
      .trim();
  }

  private buildAutoProjectReferencePromptLine(
    references: AutoProjectOrderedReferenceAsset[],
    _preferChinese: boolean,
  ) {
    if (references.length === 0) return '';

    const normalizeLabel = (asset: AutoProjectOrderedReferenceAsset) => asset.mentionLabel.replace(/^@/, '');
    const continuityThumbnail = references.find((asset) => this.isAutoProjectContinuityThumbnailAsset(asset)) ?? null;
    const continuityVideo = references.find((asset) => this.isAutoProjectContinuityVideoAsset(asset)) ?? null;
    const roleImages = references.filter(
      (asset) => asset.kind === 'image' && !this.isAutoProjectContinuityThumbnailAsset(asset),
    );

    if (continuityThumbnail || continuityVideo) {
      const orderedMappings = references.map((asset) => {
        const promptLabel = normalizeLabel(asset);
        if (this.isAutoProjectContinuityThumbnailAsset(asset)) {
          return `${promptLabel}=上一镜尾帧`;
        }
        if (this.isAutoProjectContinuityVideoAsset(asset)) {
          return `${promptLabel}=上一镜成片`;
        }

        const title = this.truncateAutoProjectText(asset.title, 24);
        return title ? `${promptLabel}=${title}` : promptLabel;
      });

      const usageInstructions: string[] = [];
      if (continuityThumbnail) {
        usageInstructions.push(
          `使用${normalizeLabel(continuityThumbnail)}作为首帧。`,
        );
      }
      if (continuityVideo) {
        usageInstructions.push(
          `${continuityThumbnail ? `请以${normalizeLabel(continuityThumbnail)}为首帧，` : ''}接着${normalizeLabel(continuityVideo)}继续生成，延续主体状态、动作方向与镜头运动。`,
        );
      }
      if (roleImages.length > 0) {
        const roleMappings = roleImages.map((asset) => {
          const title = this.truncateAutoProjectText(asset.title, 24) || '主体参考';
          return `${title}为${normalizeLabel(asset)}`;
        });
        usageInstructions.push(
          `主体设定参考：${roleMappings.join('，')}。`,
        );
      }

      return [`素材顺序：${orderedMappings.join('，')}。`, ...usageInstructions].join(' ');
    }

    const labels = references.map((asset) => {
      const promptLabel = normalizeLabel(asset);
      const title = this.truncateAutoProjectText(asset.title, 24);
      return title ? `${promptLabel}（${title}）` : promptLabel;
    });

    return `参考${labels.join('、')}，保持对应主体特征、动作与构图信息一致。`;
  }

  private buildAutoProjectShotPrompt(shot: AutoProjectShotPlanItem, _preferChinese: boolean) {
    const base = this.sanitizeAutoProjectGenerationPrompt(shot.prompt || '');
    const summary = (shot.summary || '').trim();
    const script = (shot.script || '').trim();

    const normalizedBase = this.normalizeAutoProjectCommand(base);
    const parts: string[] = [];
    if (base) parts.push(base);

    if (summary && !normalizedBase.includes(this.normalizeAutoProjectCommand(summary))) {
      parts.push(`分镜画面：${summary}`);
    }
    if (script && !normalizedBase.includes(this.normalizeAutoProjectCommand(script))) {
      parts.push(`分镜剧本：${script}`);
    }

    if (parts.length === 0) {
      return '分镜提示词：请根据当前分镜描述生成视频。';
    }

    return parts.join('\n');
  }

  private createAutoProjectContinuityThumbnailReference(input: {
    previousReference: AutoProjectStoredShotVideoReference;
    preferChinese: boolean;
  }): AutoProjectOrderedReferenceAsset | null {
    if (!input.previousReference.thumbnailUrl) return null;

    return {
      id: `continuity-thumb:${input.previousReference.shotId}`,
      kind: 'image',
      title: '上一镜尾帧',
      description: '上一条已生成分镜尾帧',
      sourcePrompt: null,
      url: input.previousReference.thumbnailUrl,
      thumbnailUrl: input.previousReference.thumbnailUrl,
      createdAt: new Date(0),
      referenceCharacterIds: [],
      workflowStage: 'shot_review',
      shotId: input.previousReference.shotId,
      finalStoryboard: true,
      ordinal: 0,
      mentionLabel: '',
    };
  }

  private buildAutoProjectImageExecutionPrompt(
    plan: AutoProjectImagePlanItem,
    preferChinese: boolean,
  ) {
    return this.sanitizeAutoProjectGenerationPrompt(
      this.applyRoleModelingSheetHint(plan.prompt, preferChinese),
    );
  }

  private applyRoleModelingSheetHint(prompt: string, _preferChinese: boolean) {
    const normalized = this.normalizeAutoProjectCommand(prompt);
    const hasMultiViewHint =
      normalized.includes('多视角')
      || normalized.includes('多角度')
      || normalized.includes('三视图')
      || normalized.includes('四视图')
      || normalized.includes('建模图')
      || normalized.includes('主体设定图')
      || normalized.includes('主体参考图')
      || normalized.includes('正交参考')
      || normalized.includes('turnaround')
      || normalized.includes('multi-view')
      || normalized.includes('model sheet')
      || normalized.includes('character sheet')
      || normalized.includes('subject sheet')
      || normalized.includes('reference sheet')
      || normalized.includes('orthographic');

    if (hasMultiViewHint) return prompt;

    const hint =
      '主体设定参考图（多视角）：根据主体类型提供一致性参考视角。人物、动物、产品优先正面/侧面/背面/三分之四视角；星球、飞船或其他非人主体可使用多角度或正交参考视图。背景简洁，主体比例与关键特征保持一致。';

    return [hint, prompt].filter((item) => item.trim().length > 0).join('\n');
  }

  private buildAutoProjectImageAssetDescription(
    plan: AutoProjectImagePlanItem,
    referenceLabels: string[],
    _preferChinese: boolean,
  ) {
    return [
      plan.prompt,
      plan.negativePrompt
        ? `负向提示词：${plan.negativePrompt}`
        : null,
      referenceLabels.length > 0
        ? `参考素材：${referenceLabels.join(' ')}`
        : null,
    ]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join('\n');
  }

  private buildAutoProjectShotAssetDescription(
    shot: AutoProjectShotPlanItem,
    referenceLabels: string[],
    _preferChinese: boolean,
  ) {
    return [
      shot.summary,
      shot.script ? `剧本：${shot.script}` : null,
      `时长：${shot.duration}`,
      referenceLabels.length > 0
        ? `参考素材：${referenceLabels.join(' ')}`
        : null,
    ]
      .filter((item): item is string => Boolean(item && item.trim()))
      .join('\n');
  }

  private async attachAutoProjectAssetMetadataToTask(input: {
    kind: 'image' | 'video';
    taskId: string;
    metadata: AutoProjectTaskAssetMetadata;
  }) {
    const providerData = attachAutoProjectAssetMetadata(null, input.metadata);
    const taskId = BigInt(input.taskId);

    if (input.kind === 'image') {
      await this.prisma.imageTask.update({
        where: { id: taskId },
        data: { providerData: toSqliteJson(providerData) },
      });
      return;
    }

    await this.prisma.videoTask.update({
      where: { id: taskId },
      data: {
        providerData: toSqliteJson(providerData),
        ...buildAutoProjectTaskColumnData(input.metadata),
      },
    });
  }

  private async generateAutoProjectImageTask(params: {
    userId: bigint;
    projectId: bigint;
    imageModelIdRaw: string;
    prompt: string;
    negativePrompt?: string;
    currentImages: string[];
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
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
    const supportsContextImageEditing = imageModel.type === AiModelType.image && imageModelCapabilities.supports.contextualEdit;

    if (params.currentImages.length > 0 && !supportsContextImageEditing) {
      throw new BadRequestException('Current image model does not support context editing in chat');
    }

    const mergedParameters = {
      ...buildChatImageTaskParameters(imageModel, {
        preferredAspectRatio: params.preferredAspectRatio ?? null,
        preferredResolution: params.preferredResolution ?? null,
        hasReferenceImages: params.currentImages.length > 0,
      }),
    };
    const maxInputImages = Math.max(1, imageModelCapabilities.limits.maxInputImages ?? 1);
    const contextImages = params.currentImages
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, maxInputImages);

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
      projectId: params.projectId.toString(),
    });

    return {
      createdTask,
      imageModel,
    };
  }

  private async generateAutoProjectVideoTask(params: {
    userId: bigint;
    projectId: bigint;
    videoModelIdRaw: string;
    prompt: string;
    currentImages: string[];
    currentVideos: string[];
    currentAudios: string[];
    orderedReferences?: AutoProjectOrderedMediaInput[];
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
    preferredDuration?: string | null;
    firstFrameImage?: string | null;
  }) {
    const videoModelId = this.parseBigInt(params.videoModelIdRaw, 'modelId');
    const videoModel = await this.prisma.aiModel.findFirst({
      where: {
        id: videoModelId,
        type: AiModelType.video,
        isActive: true,
      },
    });
    if (!videoModel) {
      throw new BadRequestException('Video model not found or inactive');
    }

    const videoModelCapabilities = buildModelCapabilities(videoModel as AiModel, null);
    const supportsContextVideoEditing = videoModel.type === AiModelType.video && videoModelCapabilities.supports.contextualEdit;

    if (
      (params.currentImages.length > 0 || params.currentVideos.length > 0 || params.currentAudios.length > 0)
      && !supportsContextVideoEditing
    ) {
      throw new BadRequestException('Current video model does not support context editing in chat');
    }

    if (params.currentImages.length > 0 && !videoModelCapabilities.supports.imageInput) {
      throw new BadRequestException('Current video model does not support image references');
    }
    if (params.currentVideos.length > 0 && !videoModelCapabilities.supports.videoInput) {
      throw new BadRequestException('Current video model does not support video references');
    }
    if (params.currentAudios.length > 0 && !videoModelCapabilities.supports.audioInput) {
      throw new BadRequestException('Current video model does not support audio references');
    }

    const mergedParameters = {
      ...buildChatVideoTaskParameters(videoModel, {
        preferredAspectRatio: params.preferredAspectRatio ?? null,
        preferredResolution: params.preferredResolution ?? null,
        preferredDuration: params.preferredDuration ?? null,
      }),
    };
    const maxInputImages = Math.max(1, videoModelCapabilities.limits.maxInputImages ?? 1);
    const maxInputVideos = Math.max(1, videoModelCapabilities.limits.maxInputVideos ?? 1);
    const maxInputAudios = Math.max(1, videoModelCapabilities.limits.maxInputAudios ?? 1);

    const currentImages = params.currentImages
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, maxInputImages);
    const currentVideos = params.currentVideos
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, maxInputVideos);
    const currentAudios = params.currentAudios
      .map((item) => item.trim())
      .filter((item) => Boolean(item))
      .slice(0, maxInputAudios);

    Object.assign(
      mergedParameters,
      this.buildChatContextVideoParameters(videoModel, {
        currentImages,
        currentVideos,
        currentAudios,
        orderedReferences: params.orderedReferences ?? [],
        firstFrameImage: params.firstFrameImage ?? null,
        latestContextAsset: null,
      }),
    );

    const createdTask = await this.videosService.generate(params.userId, {
      modelId: params.videoModelIdRaw,
      prompt: params.prompt,
      parameters: Object.keys(mergedParameters).length > 0 ? mergedParameters : undefined,
      projectId: params.projectId.toString(),
    });

    return {
      createdTask,
      videoModel,
    };
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
    if (providerKey.includes('nanobanana') || providerKey.includes('gemini') || providerKey.includes('google')) {
      return { images, imageFirst: true };
    }
    return {};
  }

  private isWanxR2vVideoModel(model: {
    provider: string;
    modelKey?: string | null;
  }) {
    const providerKey = normalizeProviderKey(model.provider);
    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    return (
      (providerKey.includes('wanx') || providerKey.includes('wanxiang'))
      && remoteModel.includes('wan2.7')
      && remoteModel.includes('-r2v')
    );
  }

  private isSeedance20VideoModel(model: {
    provider: string;
    modelKey?: string | null;
  }) {
    const providerKey = normalizeProviderKey(model.provider);
    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    return (
      (providerKey.includes('doubao') || providerKey.includes('bytedance') || providerKey.includes('ark'))
      && remoteModel.includes('seedance-2-0')
    );
  }

  private buildWanxR2vContextVideoParameters(input: {
    currentImages: string[];
    currentVideos: string[];
    currentAudios: string[];
    firstFrameImage?: string | null;
  }) {
    const parameters: Record<string, unknown> = {};
    const firstFrame = input.firstFrameImage?.trim() || null;
    const totalVisualBudget = Math.max(0, 5 - (firstFrame ? 1 : 0));

    let referenceImages = input.currentImages
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
    let referenceVideos = input.currentVideos
      .map((item) => item.trim())
      .filter((item) => Boolean(item));

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

    if (firstFrame) {
      parameters.firstFrame = firstFrame;
    }
    if (cappedImages.length > 0) {
      parameters.referenceImages = cappedImages;
    }
    if (cappedVideos.length > 0) {
      parameters.referenceVideos = cappedVideos;
    }
    if (cappedAudios.length > 0) {
      parameters.referenceAudios = cappedAudios;
    }

    return parameters;
  }

  private buildChatContextVideoParameters(
    model: AiModel,
    input: {
      currentImages: string[];
      currentVideos: string[];
      currentAudios: string[];
      orderedReferences?: AutoProjectOrderedMediaInput[];
      firstFrameImage?: string | null;
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
      return this.buildWanxR2vContextVideoParameters({
        currentImages: input.currentImages,
        currentVideos: input.currentVideos,
        currentAudios: input.currentAudios,
        firstFrameImage: input.firstFrameImage ?? fallbackImage,
      });
    }

    if (providerKey.includes('doubao') || providerKey.includes('bytedance') || providerKey.includes('ark')) {
      const isSeedance15Pro = remoteModel.includes('seedance-1-5-pro');
      if (isSeedance15Pro) {
        const mergedReferenceImages = [...input.currentImages];
        if (mergedReferenceImages.length === 0 && fallbackImage) {
          mergedReferenceImages.push(fallbackImage);
        }

        if (mergedReferenceImages.length > 0) parameters.referenceImages = mergedReferenceImages;

        const orderedReferences = (input.orderedReferences ?? []).filter((item) => item.kind === 'image');
        if (orderedReferences.length > 0) {
          parameters.referenceSequence = orderedReferences
            ?.map((item) => ({
              kind: item.kind,
              url: item.url,
            }))
            .filter((item) => typeof item.url === 'string' && item.url.trim().length > 0);
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

      if (mergedReferenceImages.length > 0) parameters.referenceImages = mergedReferenceImages;
      if (mergedReferenceVideos.length > 0) {
        parameters.referenceVideos = mergedReferenceVideos;
      }
      if (input.currentAudios.length > 0) {
        parameters.referenceAudios = input.currentAudios;
      }

      const orderedReferences = input.orderedReferences ?? [];
      if (orderedReferences.length > 0) {
        parameters.referenceSequence = orderedReferences
          ?.map((item) => ({
            kind: item.kind,
            url: item.url,
          }))
          .filter((item) => typeof item.url === 'string' && item.url.trim().length > 0);
      }
      return parameters;
    }

    return parameters;
  }

  private isAutoProjectSupportedModel(model: {
    type: string;
    provider: string;
    modelKey?: string | null;
    supportsAutoMode?: boolean | null;
  }) {
    if (typeof model.supportsAutoMode === 'boolean') {
      return model.supportsAutoMode;
    }

    if (model.type === AiModelType.image) {
      return true;
    }

    const providerKey = normalizeProviderKey(model.provider);
    return (
      providerKey.includes('doubao')
      || providerKey.includes('bytedance')
      || providerKey.includes('ark')
      || this.isWanxR2vVideoModel(model)
    );
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

  private async requestChatCompletion(
    conversation: AutoProjectConversationContext,
    messages: UpstreamMessage[],
  ) {
    const decryptedApiKey = this.encryption.decryptString(conversation.model.channel.apiKey);
    if (!decryptedApiKey) {
      throw new BadRequestException('Channel API key is not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

    const timeoutBase = Math.max(5_000, Math.min(conversation.model.channel.timeout ?? 60_000, 600_000));
    const timeoutMs = Math.max(timeoutBase, 180_000);
    const requestBody = {
      ...defaultParams,
      model: conversation.model.modelKey,
      messages,
      stream: false,
    };

    const response = await this.requestChatCompletionWithRetry({
      url: this.buildChatCompletionUrl(conversation.model.channel.baseUrl),
      body: requestBody,
      headers,
      timeoutMs,
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

    return {
      content: source.replace(regex, '').trim(),
      reasoning: reasoningParts.join('\n\n').trim(),
    };
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

  private toUpstreamMessages(
    messages: Array<{ role: string; content: string; images: unknown; files?: unknown }>,
    options?: { includeImages?: boolean },
  ) {
    const includeImages = options?.includeImages !== false;

    return messages
      .map((msg): UpstreamMessage | null => {
        const role = msg.role as UpstreamMessage['role'];
        if (role !== 'assistant' && role !== 'system' && role !== 'user') return null;

        if (role !== 'user') {
          return { role, content: msg.content };
        }

        const images = includeImages ? this.extractImages(msg.images) : [];
        if (!includeImages) {
          const plainText = msg.content.trim();
          if (plainText) return { role, content: msg.content };

          const previousImageCount = this.extractImages(msg.images).length;
          if (previousImageCount > 0) {
            return {
              role,
              content: previousImageCount > 1 ? `[${previousImageCount} images omitted]` : '[image omitted]',
            };
          }

          const fileCount = this.extractMessageFileCount(msg.files ?? null);
          if (fileCount > 0) {
            return {
              role,
              content: fileCount > 1 ? `[${fileCount} files attached]` : '[file attached]',
            };
          }

          return null;
        }

        if (images.length === 0) {
          return { role, content: msg.content };
        }

        const parts: UpstreamMessagePart[] = [];
        if (msg.content.trim()) {
          parts.push({ type: 'text', text: msg.content });
        }
        for (const url of images) {
          parts.push({ type: 'image_url', image_url: { url } });
        }

        return { role, content: parts };
      })
      .filter((item): item is UpstreamMessage => Boolean(item));
  }

  private injectSystemContextIntoUpstream(
    messages: UpstreamMessage[],
    ...contexts: Array<string | null | undefined>
  ): UpstreamMessage[] {
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

  private extractImages(value: unknown): string[] {
    value = parseSqliteJson(value);
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => Boolean(item));
  }

  private extractMessageFileCount(value: unknown) {
    value = parseSqliteJson(value);
    return Array.isArray(value) ? value.length : 0;
  }

  private buildChatCompletionUrl(baseUrl: string): string {
    const normalized = baseUrl.replace(/\/+$/, '');
    if (normalized.endsWith('/v1/chat/completions')) return normalized;
    if (normalized.endsWith('/chat/completions')) return normalized;
    if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`;
    return `${normalized}/v1/chat/completions`;
  }

  private normalizeExtraHeaders(raw: unknown): Record<string, string> {
    raw = parseSqliteJson(raw);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const headerName = key.trim();
      if (!headerName) continue;
      if (typeof value !== 'string') continue;
      const headerValue = value.trim();
      if (!headerValue) continue;
      out[headerName] = headerValue;
    }
    return out;
  }

  private async requestChatCompletionWithRetry(input: {
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
    timeoutMs: number;
  }) {
    const attemptOnce = (timeoutMs: number) =>
      axios.post(
        input.url,
        input.body,
        {
          headers: input.headers,
          timeout: timeoutMs,
          validateStatus: () => true,
        },
      );

    try {
      return await attemptOnce(input.timeoutMs);
    } catch (error) {
      if (!this.isTimeoutError(error)) {
        throw error;
      }
      // Retry once with a longer timeout to absorb slow model responses.
      return await attemptOnce(Math.min(input.timeoutMs + 60_000, 600_000));
    }
  }

  private isTimeoutError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const source = error as { code?: string; message?: string };
    if (source.code === 'ECONNABORTED') return true;
    if (typeof source.message === 'string' && source.message.toLowerCase().includes('timeout')) return true;
    return false;
  }

  private isLikelyChineseText(value: string) {
    return /[\u4e00-\u9fff]/.test(value);
  }

  private normalizeExceptionMessage(error: unknown) {
    if (error instanceof BadRequestException) {
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
}
