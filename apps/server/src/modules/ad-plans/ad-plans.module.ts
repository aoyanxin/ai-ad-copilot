import { Module } from '@nestjs/common';

import { AdPlansController } from './ad-plans.controller';
import { AdPlansRepository } from './ad-plans.repository';
import { AdPlansService } from './ad-plans.service';

@Module({
  controllers: [AdPlansController],
  providers: [AdPlansService, AdPlansRepository],
})
export class AdPlansModule {}
