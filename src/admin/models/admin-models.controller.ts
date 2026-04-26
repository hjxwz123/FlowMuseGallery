import { BadRequestException, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { Request } from 'express';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminModelsService } from './admin-models.service';
import { CreateModelDto } from './dto/create-model.dto';
import { ReorderModelsDto } from './dto/reorder-models.dto';
import { UpdateModelDto } from './dto/update-model.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/models')
export class AdminModelsController {
  constructor(private readonly modelsService: AdminModelsService) {}

  private extractMessages(errors: ValidationError[]): string[] {
    const out: string[] = [];
    for (const err of errors) {
      if (err.constraints) out.push(...Object.values(err.constraints));
      if (err.children && err.children.length > 0) out.push(...this.extractMessages(err.children));
    }
    return out;
  }

  private normalizeIcon(raw: unknown): string | null | undefined {
    if (raw === null) return null;
    if (typeof raw === 'string') return raw;
    return undefined;
  }

  private parseCreateDto(body: Record<string, unknown>): CreateModelDto {
    const dto = plainToInstance(CreateModelDto, body);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      throw new BadRequestException(this.extractMessages(errors).join(', ') || 'Invalid request body');
    }

    const normalizedIcon = this.normalizeIcon(body.icon);
    if (normalizedIcon !== undefined) dto.icon = normalizedIcon;
    return dto;
  }

  private parseUpdateDto(body: Record<string, unknown>): UpdateModelDto {
    const dto = plainToInstance(UpdateModelDto, body);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      throw new BadRequestException(this.extractMessages(errors).join(', ') || 'Invalid request body');
    }

    const normalizedIcon = this.normalizeIcon(body.icon);
    if (normalizedIcon !== undefined) dto.icon = normalizedIcon;
    return dto;
  }

  private parseReorderDto(body: Record<string, unknown>): ReorderModelsDto {
    const dto = plainToInstance(ReorderModelsDto, body);
    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      throw new BadRequestException(this.extractMessages(errors).join(', ') || 'Invalid request body');
    }

    return dto;
  }

  @Get()
  list() {
    return this.modelsService.list();
  }

  @Post()
  create(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return this.modelsService.create(this.parseCreateDto(body));
  }

  @Post('reorder')
  reorder(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return this.modelsService.reorder(this.parseReorderDto(body));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.modelsService.detail(BigInt(id));
  }

  @Put(':id')
  update(@Param('id') id: string, @Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    return this.modelsService.update(BigInt(id), this.parseUpdateDto(body));
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.modelsService.remove(BigInt(id));
  }
}
