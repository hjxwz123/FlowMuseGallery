import { ApiChannel } from '@prisma/client';

import { asSqliteJsonRecord } from '../../common/utils/sqlite-json.util';
import { HttpService } from './http.service';
import { TaskStatusResponse, ValidationResult } from './base-image.adapter';

export abstract class BaseVideoAdapter {
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

  abstract submitTask(params: VideoGenerateParams): Promise<string>;
  abstract queryTaskStatus(taskId: string): Promise<TaskStatusResponse>;
  abstract getTaskResult(taskId: string): Promise<string>;
  abstract cancelTask(taskId: string): Promise<void>;
  abstract validateParams(params: unknown): ValidationResult;
  abstract transformParams(params: VideoGenerateParams): unknown;
}

export interface VideoGenerateParams {
  prompt: string;
  duration?: number;
  fps?: number;
  resolution?: string;
  referenceImage?: string;
  [key: string]: unknown;
}
