import { Controller, Get } from '@nestjs/common';

import { SERVER_VERSION } from '../../common/constants/app';
import type { HealthStatusDto } from './health.dto';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthStatusDto {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      version: SERVER_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
