import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type MjSubmitResponse = {
  code: number;
  description: string;
  result?: string | number;
  properties?: Record<string, unknown>;
};

type MjTaskButton = {
  customId: string;
  emoji?: string;
  label?: string;
  type?: number;
  style?: number;
};

type MjTask = {
  id: string;
  action?: string;
  status?: string;
  prompt?: string;
  promptEn?: string;
  description?: string;
  submitTime?: number;
  startTime?: number;
  finishTime?: number;
  progress?: string;
  imageUrl?: string;
  failReason?: string | null;
  properties?: Record<string, unknown>;
  buttons?: MjTaskButton[];
};

const MIDJOURNEY_PROMPT_MAX_LENGTH = 16000;

function parseProgress(progress: unknown): number | undefined {
  if (typeof progress === 'number') return progress;
  if (typeof progress !== 'string') return undefined;
  const m = progress.trim().match(/^(\d+)%$/);
  if (!m) return undefined;
  return Number(m[1]);
}

export class MidjourneyImageAdapter extends BaseImageAdapter {
  async submitTask(params: ImageGenerateParams): Promise<string> {
    const op = (params as any).mjOperation ?? 'imagine';

    if (op === 'action') {
      const body = {
        taskId: (params as any).taskId,
        customId: (params as any).customId,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/action', body);
      return this.ensureSubmitResult(response.data);
    }

    // 新的图片编辑 API（一步到位，不再需要 modal）
    if (op === 'edits') {
      const body = {
        prompt: params.prompt,
        image: (params as any).image,
        maskBase64: (params as any).maskBase64,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/edits', body);
      return this.ensureSubmitResult(response.data);
    }

    // 保留旧的 modal 操作（兼容性）
    if (op === 'modal') {
      const body = {
        taskId: (params as any).taskId,
        prompt: params.prompt || undefined,
        maskBase64: (params as any).maskBase64,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/modal', body);
      return this.ensureSubmitResult(response.data);
    }

    if (op === 'describe') {
      const body = {
        base64: (params as any).base64,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/describe', body);
      return this.ensureSubmitResult(response.data);
    }

    if (op === 'shorten') {
      const body = {
        prompt: params.prompt,
        botType: (params as any).botType,
        accountFilter: (params as any).accountFilter,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/shorten', body);
      return this.ensureSubmitResult(response.data);
    }

    if (op === 'blend') {
      const body = {
        base64Array: (params as any).base64Array,
        dimensions: (params as any).dimensions,
        notifyHook: (params as any).notifyHook,
        state: (params as any).state,
      };
      const response = await this.httpClient.post<MjSubmitResponse>('/submit/blend', body);
      return this.ensureSubmitResult(response.data);
    }

    // Default: imagine
    const mjParams = this.transformParams(params) as Record<string, unknown>;
    const response = await this.httpClient.post<MjSubmitResponse>('/submit/imagine', mjParams);
    return this.ensureSubmitResult(response.data);
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const response = await this.httpClient.get<MjTask>(`/task/${taskId}/fetch`);
    const data = response.data ?? ({} as MjTask);

    return {
      status: this.mapStatus(data.status),
      progress: parseProgress(data.progress),
      resultUrls: data.imageUrl ? [data.imageUrl] : [],
      errorMessage: data.failReason ?? undefined,
      providerData: data,
    };
  }

  async getTaskResult(taskId: string): Promise<string[]> {
    const status = await this.queryTaskStatus(taskId);
    if (status.status !== 'completed') throw new Error('Task not completed');
    return status.resultUrls ?? [];
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Midjourney typically does not support cancel
  }

  validateParams(params: unknown): ValidationResult {
    const errors: string[] = [];
    const p = params as ImageGenerateParams;
    const op = (p as any)?.mjOperation ?? 'imagine';

    if (op === 'action') {
      if (!(p as any)?.taskId) errors.push('taskId is required');
      if (!(p as any)?.customId) errors.push('customId is required');
      return { valid: errors.length === 0, errors };
    }

    if (op === 'edits') {
      if (!p?.prompt) errors.push('prompt is required');
      if (!(p as any)?.image) errors.push('image is required');
      if (!(p as any)?.maskBase64) errors.push('maskBase64 is required');
      return { valid: errors.length === 0, errors };
    }

    if (op === 'modal') {
      if (!(p as any)?.taskId) errors.push('taskId is required');
      return { valid: errors.length === 0, errors };
    }

    if (op === 'describe') {
      if (!(p as any)?.base64) errors.push('base64 is required');
      return { valid: errors.length === 0, errors };
    }

    if (op === 'blend') {
      const arr = (p as any)?.base64Array;
      if (!Array.isArray(arr) || arr.length === 0) errors.push('base64Array is required');
      return { valid: errors.length === 0, errors };
    }

    if (op === 'shorten') {
      if (!p?.prompt) errors.push('prompt is required');
      return { valid: errors.length === 0, errors };
    }

    // imagine
    if (!p?.prompt) errors.push('prompt is required');
    if (p?.prompt && p.prompt.length > MIDJOURNEY_PROMPT_MAX_LENGTH) errors.push('prompt too long');
    return { valid: errors.length === 0, errors };
  }

  transformParams(params: ImageGenerateParams): unknown {
    let prompt = params.prompt;
    const p = params as any;

    // MJ 参数通过拼接到 prompt 后面实现
    if (params.aspectRatio) prompt += ` --ar ${params.aspectRatio}`;
    if (p.version) prompt += ` --v ${p.version}`;
    if (p.stylize !== undefined && p.stylize !== '') prompt += ` --s ${p.stylize}`;
    if (p.chaos !== undefined && p.chaos !== '') prompt += ` --c ${p.chaos}`;
    if (p.quality) prompt += ` --q ${p.quality}`;
    if (p.weird !== undefined && p.weird !== '') prompt += ` --weird ${p.weird}`;
    if (p.iw) prompt += ` --iw ${p.iw}`;
    if (p.no) prompt += ` --no ${p.no}`;
    if (params.style) prompt += ` --style ${params.style}`;
    if (params.seed) prompt += ` --seed ${params.seed}`;
    if (p.tile) prompt += ' --tile';
    if (p.personalize) prompt += ' --p';

    return {
      botType: p.botType ?? 'MID_JOURNEY',
      prompt,
      base64Array: p.base64Array ?? [],
      notifyHook: p.notifyHook,
      state: p.state,
    };
  }

  private mapStatus(mjStatus: string | undefined): TaskStatusResponse['status'] {
    if (!mjStatus) return 'pending';
    const statusMap: Record<string, TaskStatusResponse['status']> = {
      NOT_START: 'pending',
      SUBMITTED: 'pending',
      MODAL: 'processing',
      IN_PROGRESS: 'processing',
      SUCCESS: 'completed',
      FAILURE: 'failed',
      CANCEL: 'failed',
    };

    return statusMap[mjStatus] ?? 'pending';
  }

  private ensureSubmitResult(data: MjSubmitResponse) {
    const code = data?.code;
    if (typeof code !== 'number') throw new Error('Invalid midjourney response');

    if (code === 1 || code === 21 || code === 22) {
      const result = data.result;
      if (result === undefined || result === null || result === '') throw new Error('Missing task id');
      return String(result);
    }

    throw new Error(data.description || `Midjourney submit failed: ${code}`);
  }
}
