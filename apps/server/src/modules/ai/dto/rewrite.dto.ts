import { IsString, Length } from 'class-validator';

/** POST /api/ai/copywriting/rewrite/stream 请求体 */
export class RewriteRequestDto {
  @IsString()
  @Length(1, 2000)
  original!: string;

  @IsString()
  @Length(2, 200)
  instruction!: string;
}
