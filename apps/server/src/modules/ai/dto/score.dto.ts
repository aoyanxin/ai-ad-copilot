import { COPYWRITING_MAX_VARIANTS } from '@ai-ad-copilot/shared';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

/** POST /api/ai/copywriting/score 请求体 */
export class ScoreRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(COPYWRITING_MAX_VARIANTS)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  copies!: string[];
}
