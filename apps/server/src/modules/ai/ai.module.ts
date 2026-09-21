import { Module } from '@nestjs/common';

import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { llmClientProvider } from './llm/llm-client.factory';

@Module({
  controllers: [AiController],
  providers: [AiService, llmClientProvider],
})
export class AiModule {}
