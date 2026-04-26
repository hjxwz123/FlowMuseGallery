import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

type ApiErrorResponse = {
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
  if (Array.isArray(msg)) return msg.filter((x) => typeof x === 'string').join(', ') || fallback;
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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let msg = 'Internal Server Error';
    let data: unknown | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      msg = normalizeMessage(response, exception.message);
      data = normalizeData(response);
    } else if (exception && typeof exception === 'object' && 'message' in exception) {
      const maybeMsg = (exception as any).message;
      if (typeof maybeMsg === 'string' && maybeMsg.trim()) msg = maybeMsg;
    }

    const body: ApiErrorResponse = {
      code: status,
      msg,
      data,
    };

    // Always return HTTP 200; frontends use `code` + `msg`.
    if (res?.status) res.status(200);
    return res.json(body);
  }
}
