import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AiSettingsService } from '../settings/ai-settings.service';
import {
  MIDJOURNEY_SYSTEM_PROMPT,
  PROJECT_DESCRIPTION_BUNDLE_SYSTEM_PROMPT,
  PROJECT_DESCRIPTION_SYSTEM_PROMPT,
  PROJECT_IMAGE_PROMPT_SYSTEM_PROMPT,
  PROJECT_STORYBOARD_SYSTEM_PROMPT,
  VIDEO_DIRECTOR_ASSISTANT_SYSTEM_PROMPT,
} from '../settings/system-settings.constants';

type PromptOptimizeTask =
  | 'default'
  | 'video_director'
  | 'project_description'
  | 'project_description_bundle'
  | 'project_storyboard'
  | 'project_image_prompt';

type PromptRequestInput = {
  userId: bigint;
  prompt: string;
  images?: string[];
  modelType?: string;
  projectDescription?: string;
  task?: PromptOptimizeTask;
};

@Injectable()
export class PromptOptimizeService {
  private readonly logger = new Logger(PromptOptimizeService.name);

  constructor(private readonly aiSettings: AiSettingsService) {}

  private normalizeContent(value: any): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            if (typeof item.text === 'string') return item.text;
            if (typeof item.content === 'string') return item.content;
            if (typeof item.delta === 'string') return item.delta;
            if (item.delta && typeof item.delta === 'object' && typeof item.delta.text === 'string') return item.delta.text;
          }
          return '';
        })
        .join('');
    }
    if (value && typeof value === 'object') {
      if (typeof value.text === 'string') return value.text;
      if (typeof value.content === 'string') return value.content;
      if (Array.isArray(value.content)) return this.normalizeContent(value.content);
      if (typeof value.delta === 'string') return value.delta;
      if (value.delta && typeof value.delta === 'object' && typeof value.delta.text === 'string') return value.delta.text;
    }
    return '';
  }

  private extractError(payload: any): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const err = payload.error;
    if (!err) return null;
    if (typeof err === 'string') return err;
    if (typeof err === 'object' && typeof err.message === 'string') return err.message;
    return 'AI 服务返回错误';
  }

  private extractContent(payload: any): string {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return '';

    const firstChoice = payload.choices?.[0];
    const candidates = [
      firstChoice?.delta?.content,
      firstChoice?.message?.content,
      firstChoice?.text,
      payload.delta?.text,
      payload.content_block?.text,
      payload.output_text,
      payload.content,
      payload.text,
    ];

    for (const candidate of candidates) {
      const text = this.normalizeContent(candidate);
      if (text) return text;
    }

    return '';
  }

  private resolveSystemPrompt(
    task: PromptOptimizeTask | undefined,
    modelType: string | undefined,
    defaultSystemPrompt: string,
  ) {
    const isMidjourney = modelType?.toLowerCase().includes('midjourney') || modelType?.toLowerCase().includes('mj');

    if (task === 'video_director') {
      return VIDEO_DIRECTOR_ASSISTANT_SYSTEM_PROMPT;
    }
    if (task === 'project_description') {
      return PROJECT_DESCRIPTION_SYSTEM_PROMPT;
    }
    if (task === 'project_description_bundle') {
      return PROJECT_DESCRIPTION_BUNDLE_SYSTEM_PROMPT;
    }
    if (task === 'project_storyboard') {
      return PROJECT_STORYBOARD_SYSTEM_PROMPT;
    }
    if (task === 'project_image_prompt') {
      return PROJECT_IMAGE_PROMPT_SYSTEM_PROMPT;
    }
    if (isMidjourney) {
      return MIDJOURNEY_SYSTEM_PROMPT;
    }

    return defaultSystemPrompt;
  }

  async generateInternalPrompt(input: {
    userId: bigint;
    prompt: string;
    images?: string[];
    modelType?: string;
    projectDescription?: string;
    task?: Exclude<PromptOptimizeTask, 'project_description'>;
  }) {
    return this.requestPrompt({
      ...input,
    });
  }

  async optimizePrompt(
    userId: bigint,
    prompt: string,
    images: string[] | undefined,
    modelType: string | undefined,
    projectDescription: string | undefined,
    task: PromptOptimizeTask | undefined,
  ) {
    return this.requestPrompt({
      userId,
      prompt,
      images,
      modelType,
      projectDescription,
      task,
    });
  }

  private async requestPrompt(input: PromptRequestInput) {
    const {
      userId,
      prompt,
      images,
      modelType,
      projectDescription,
      task,
    } = input;

    const settings = await this.aiSettings.getAiSettings();
    if (!settings.apiBaseUrl || !settings.apiKey || !settings.modelName) {
      throw new BadRequestException('AI 优化功能未配置，请联系管理员');
    }

    try {
      const userContent: any[] = [{ type: 'text', text: prompt }];
      const normalizedProjectDescription = typeof projectDescription === 'string' ? projectDescription.trim() : '';
      if (normalizedProjectDescription) {
        userContent.push({
          type: 'text',
          text: `项目背景描述：${normalizedProjectDescription}`,
        });
      }
      if (images?.length) {
        for (const img of images) {
          const base64Data = img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;
          userContent.push({ type: 'image_url', image_url: { url: base64Data } });
        }
      }

      const messages = [
        {
          role: 'system',
          content: this.resolveSystemPrompt(task, modelType, settings.systemPrompt),
        },
        { role: 'user', content: userContent },
      ];

      const apiUrl = `${settings.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.modelName,
          messages,
          stream: false,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text().catch(() => 'Unknown error');
        this.logger.error(`AI API error: ${apiRes.status} ${errText}`);
        throw new BadRequestException(`AI 服务请求失败 (${apiRes.status})`);
      }

      const contentType = (apiRes.headers.get('content-type') ?? '').toLowerCase();
      const raw = await apiRes.text();
      const trimmed = raw.trim();
      let fullText = '';

      if (trimmed) {
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            const payloadError = this.extractError(parsed);
            if (payloadError) {
              throw new BadRequestException(payloadError);
            }
            fullText = this.extractContent(parsed).trim();
          } catch (error) {
            if (error instanceof BadRequestException) {
              throw error;
            }
            fullText = trimmed;
          }
        } else {
          fullText = trimmed;
        }
      }

      if (!fullText.trim()) {
        this.logger.error(`Prompt optimization empty result. contentType=${contentType || 'unknown'}`);
        throw new BadRequestException('AI 服务未返回可用内容');
      }

      return { content: fullText };
    } catch (error: any) {
      this.logger.error('Prompt optimization failed', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('优化失败，请重试');
    }
  }
}
