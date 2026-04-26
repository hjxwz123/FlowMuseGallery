import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { join } from 'node:path';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseWrapperInterceptor } from './common/interceptors/response-wrapper.interceptor';

// Ensure JSON serialization works with Prisma BigInt fields
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function toJSON() {
  return this.toString();
};

async function bootstrap() {
  // bodyParser: false — 禁用 NestJS 内置解析器，自己配置以便同时支持 rawBody 和 50mb 限制
  const app = await NestFactory.create(AppModule, {
    cors: true,
    rawBody: true,
    bodyParser: false,
  });

  // 自定义 JSON 解析：50mb 限制 + 同步保存 rawBody Buffer（供本地回调验签扩展使用）
  app.use(
    express.json({
      limit: '50mb',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verify: (req: any, _res: any, buf: any) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.setGlobalPrefix('api');
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseWrapperInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.HOST || '127.0.0.1';
  await app.listen(port, host);
}

bootstrap();
