import { Global, Module } from '@nestjs/common';

import { CacheService } from './cache.service';
import { RedisCacheService } from './redis-cache.service';

/**
 * 全局缓存模块：业务侧只注入 CacheService，换实现只改这里的 useClass。
 */
@Global()
@Module({
  providers: [{ provide: CacheService, useClass: RedisCacheService }],
  exports: [CacheService],
})
export class CacheModule {}
