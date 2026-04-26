import {
  Body,
  Controller,
  Delete,
  HttpException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectInspirationDto } from './dto/create-project-inspiration.dto';
import { CreateProjectPromptDto } from './dto/create-project-prompt.dto';
import { GenerateProjectDescriptionDto } from './dto/generate-project-description.dto';
import { GenerateProjectInspirationPromptDto } from './dto/generate-project-inspiration-prompt.dto';
import { ImportProjectAssetsDto } from './dto/import-project-assets.dto';
import { ListImportableWorksDto } from './dto/list-importable-works.dto';
import { MergeProjectStoryboardDto } from './dto/merge-project-storyboard.dto';
import { UpdateProjectAssetDto } from './dto/update-project-asset.dto';
import { UpdateProjectInspirationDto } from './dto/update-project-inspiration.dto';
import { UpdateProjectPromptDto } from './dto/update-project-prompt.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UploadProjectAssetsDto } from './dto/upload-project-assets.dto';
import { ProjectsService } from './projects.service';

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

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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

  private async respondWithHeartbeatJson<T>(
    res: Response,
    task: () => Promise<T>,
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

    try {
      res.write(' ');
      wroteHeartbeat = true;
    } catch {
      // Ignore early disconnects and let close handling stop follow-up writes.
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
      const data = await task();
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

  @Get()
  list(@CurrentUser('id') userId: bigint) {
    return this.projectsService.listProjects(userId);
  }

  @Post()
  create(@CurrentUser('id') userId: bigint, @Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(userId, dto);
  }

  @Post('generate-description')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async generateDescription(
    @CurrentUser('id') userId: bigint,
    @Body() dto: GenerateProjectDescriptionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    await this.respondWithHeartbeatJson(res, () =>
      this.projectsService.generateProjectDescription(userId, dto, files),
    );
  }

  @Get('importable-works')
  importableWorks(@CurrentUser('id') userId: bigint, @Query() query: ListImportableWorksDto) {
    return this.projectsService.listImportableWorks(userId, query);
  }

  @Get('quota')
  quota(@CurrentUser('id') userId: bigint) {
    return this.projectsService.getProjectQuota(userId);
  }

  @Get(':id')
  getOne(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.projectsService.getProject(userId, BigInt(id));
  }

  @Patch(':id')
  update(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(userId, BigInt(id), dto);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.projectsService.deleteProject(userId, BigInt(id));
  }

  @Get(':id/assets')
  listAssets(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.projectsService.listAssets(userId, BigInt(id));
  }

  @Get(':id/storyboard-status')
  getStoryboardStatus(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Query('shotIds') shotIds?: string | string[],
  ) {
    return this.projectsService.getProjectStoryboardStatus(userId, BigInt(id), shotIds);
  }

  @Get(':id/inspirations')
  listInspirations(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.projectsService.listInspirations(userId, BigInt(id));
  }

  @Post(':id/inspirations')
  createInspiration(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: CreateProjectInspirationDto,
  ) {
    return this.projectsService.createInspiration(userId, BigInt(id), dto);
  }

  @Patch(':id/inspirations/:inspirationId')
  updateInspiration(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('inspirationId') inspirationId: string,
    @Body() dto: UpdateProjectInspirationDto,
  ) {
    return this.projectsService.updateInspiration(userId, BigInt(id), BigInt(inspirationId), dto);
  }

  @Delete(':id/inspirations/:inspirationId')
  removeInspiration(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('inspirationId') inspirationId: string,
  ) {
    return this.projectsService.deleteInspiration(userId, BigInt(id), BigInt(inspirationId));
  }

  @Get(':id/prompts')
  listPrompts(@CurrentUser('id') userId: bigint, @Param('id') id: string) {
    return this.projectsService.listPrompts(userId, BigInt(id));
  }

  @Post(':id/prompts')
  createPrompt(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: CreateProjectPromptDto,
  ) {
    return this.projectsService.createPrompt(userId, BigInt(id), dto);
  }

  @Patch(':id/prompts/:promptId')
  updatePrompt(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('promptId') promptId: string,
    @Body() dto: UpdateProjectPromptDto,
  ) {
    return this.projectsService.updatePrompt(userId, BigInt(id), BigInt(promptId), dto);
  }

  @Delete(':id/prompts/:promptId')
  removePrompt(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('promptId') promptId: string,
  ) {
    return this.projectsService.deletePrompt(userId, BigInt(id), BigInt(promptId));
  }

  @Post(':id/inspirations/:inspirationId/generate-video-prompt')
  async generateInspirationPrompt(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('inspirationId') inspirationId: string,
    @Body() dto: GenerateProjectInspirationPromptDto,
    @Res() res: Response,
  ) {
    await this.respondWithHeartbeatJson(res, () =>
      this.projectsService.generateInspirationVideoPrompt(
        userId,
        BigInt(id),
        BigInt(inspirationId),
        dto,
      ),
    );
  }

  @Post(':id/assets/import')
  importAssets(@CurrentUser('id') userId: bigint, @Param('id') id: string, @Body() dto: ImportProjectAssetsDto) {
    return this.projectsService.importAssets(userId, BigInt(id), dto);
  }

  @Post(':id/assets/upload')
  @UseInterceptors(
    FilesInterceptor('files', 12, {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  uploadAssets(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: UploadProjectAssetsDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.projectsService.uploadAssets(userId, BigInt(id), dto.kind, files);
  }

  @Post(':id/merge-storyboard')
  async mergeStoryboard(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Body() dto: MergeProjectStoryboardDto,
    @Res() res: Response,
  ) {
    await this.respondWithHeartbeatJson(res, () =>
      this.projectsService.mergeStoryboardVideos(userId, BigInt(id), dto),
    );
  }

  @Patch(':id/assets/:assetId')
  updateAsset(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() dto: UpdateProjectAssetDto,
  ) {
    return this.projectsService.updateAsset(userId, BigInt(id), BigInt(assetId), dto);
  }

  @Delete(':id/assets/:assetId')
  removeAsset(
    @CurrentUser('id') userId: bigint,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
  ) {
    return this.projectsService.deleteAsset(userId, BigInt(id), BigInt(assetId));
  }
}
