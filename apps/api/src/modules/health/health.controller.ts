import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@teu-jardim/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse & { db: 'up' | 'down' }> {
    let db: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }

    return {
      status: 'ok',
      service: 'teu-jardim-api',
      timestamp: new Date().toISOString(),
      db,
    };
  }
}
