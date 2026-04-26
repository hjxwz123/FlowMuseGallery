import { ApiChannel } from '@prisma/client';

import { asSqliteJsonRecord } from '../../common/utils/sqlite-json.util';
import { HttpService } from './http.service';

export abstract class BaseImageAdapter {
  protected channel: ApiChannel;
  protected httpClient: HttpService;

  constructor(channel: ApiChannel) {
    this.channel = channel;
    this.httpClient = this.createHttpClient();
  }

  protected createHttpClient(): HttpService {
    const extraHeaders = asSqliteJsonRecord(this.channel.extraHeaders) ?? {};
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') headers[key] = value;
      else if (typeof value === 'number' || typeof value === 'boolean') headers[key] = String(value);
    }
    if (this.channel.apiKey) {
      headers.Authorization = `Bearer ${this.channel.apiKey}`;
    }

    return new HttpService({
      baseURL: this.channel.baseUrl,
      timeout: this.channel.timeout,
      headers,
    });
  }

  abstract submitTask(params: ImageGenerateParams): Promise<string>;
  abstract queryTaskStatus(taskId: string): Promise<TaskStatusResponse>;
  abstract getTaskResult(taskId: string): Promise<string[]>;
  abstract cancelTask(taskId: string): Promise<void>;
  abstract validateParams(params: unknown): ValidationResult;
  abstract transformParams(params: ImageGenerateParams): unknown;
}

export interface ImageGenerateParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  style?: string;
  aspectRatio?: string;
  [key: string]: unknown;
}

export interface TaskStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  resultUrls?: string[];
  errorMessage?: string;
  providerData?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
