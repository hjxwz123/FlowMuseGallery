import { Body, Controller, HttpException, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptimizePromptDto } from './dto/optimize-prompt.dto';
import { PromptOptimizeService } from './prompt-optimize.service';

type WrappedErrorResponse = {
  code: number;
  msg: string;
  data: unknown | null;
};

function normalizeMessage(payload: unknown, fallback: string) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return fallback;

  const obj = payload as Record<string, unknown>;
  const msg = obj.message;
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) return msg.filter((item) => typeof item === 'string').join(', ') || fallback;
  return fallback;
}

function normalizeData(payload: unknown): unknown | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const obj = payload as Record<string, unknown>;
  if ('data' in obj) {
    return obj.data ?? null;
  }

  const extraEntries = Object.entries(obj).filter(
    ([key]) => key !== 'message' && key !== 'statusCode' && key !== 'error',
  );

  return extraEntries.length > 0 ? Object.fromEntries(extraEntries) : null;
}

@Controller('prompt')
export class PromptOptimizeController {
  constructor(private readonly service: PromptOptimizeService) {}

  private buildWrappedError(error: unknown): WrappedErrorResponse {
    let code = 500;
    let msg = 'Internal Server Error';
    let data: unknown | null = null;

    if (error instanceof HttpException) {
      code = error.getStatus();
      const response = error.getResponse();
      msg = normalizeMessage(response, error.message);
      data = normalizeData(response);
    } else if (error && typeof error === 'object' && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
        msg = maybeMessage;
      }
    }

    return { code, msg, data };
  }

  @Post('optimize')
  @UseGuards(JwtAuthGuard)
  async optimize(
    @CurrentUser('id') userId: bigint,
    @Body() dto: OptimizePromptDto,
    @Res() res: Response,
  ) {
    let closed = false;
    let wroteHeartbeat = false;

    res.on('close', () => {
      closed = true;
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Write an ignorable JSON-leading whitespace byte immediately so CDN/proxy
    // layers don't treat a slow upstream model call as a totally silent origin.
    try {
      res.write(' ');
      wroteHeartbeat = true;
    } catch {
      // Ignore early disconnects and let the regular close handling take over.
    }

    const heartbeat = setInterval(() => {
      if (closed || res.writableEnded) return;
      try {
        res.write(' ');
        wroteHeartbeat = true;
      } catch {
        // Client may have gone away.
      }
    }, 10_000);

    try {
      const data = await this.service.optimizePrompt(
        userId,
        dto.prompt,
        dto.images,
        dto.modelType,
        dto.projectDescription,
        dto.task,
      );

      if (closed || res.writableEnded) return;

      const body = JSON.stringify({ code: 0, msg: 'ok', data });
      res.write((wroteHeartbeat ? '\n' : '') + body);
      res.end();
    } catch (error) {
      if (closed || res.writableEnded) return;

      const body = JSON.stringify(this.buildWrappedError(error));
      res.write((wroteHeartbeat ? '\n' : '') + body);
      res.end();
    } finally {
      clearInterval(heartbeat);
    }
  }
}
