import {
  AD_CHANNELS,
  COPYWRITING_MAX_VARIANTS,
  COPYWRITING_TONES,
  type AdChannel,
  type CopywritingTone,
} from '@ai-ad-copilot/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** POST /api/ai/copywriting/stream 请求体 */
export class CopywritingRequestDto {
  @IsString()
  @Length(2, 100)
  product!: string;

  @IsString()
  @Length(2, 100)
  audience!: string;

  @IsOptional()
  @IsIn(AD_CHANNELS)
  channel?: AdChannel;

  @IsIn(COPYWRITING_TONES)
  tone!: CopywritingTone;

  /** 版本数：上限 COPYWRITING_MAX_VARIANTS(=3)，也就是并发上游请求数的硬上限 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COPYWRITING_MAX_VARIANTS)
  variants?: number;
}
