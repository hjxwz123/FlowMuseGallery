import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export type ApiResponse<T> = {
  code: number;
  msg: string;
  data: T;
};

function isAlreadyWrapped(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'number' && typeof v.msg === 'string' && 'data' in v;
}

@Injectable()
export class ResponseWrapperInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const res = http.getResponse();

    return next.handle().pipe(
      map((data) => {
        // Normalize to HTTP 200, rely on `code` for app-level success/failure.
        if (res?.status) res.status(200);
        if (isAlreadyWrapped(data)) return data;
        return { code: 0, msg: 'ok', data };
      }),
    );
  }
}

