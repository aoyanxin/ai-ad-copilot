import { randomUUID } from 'node:crypto';

import {
  COPYWRITING_MAX_VARIANTS,
  type AiStreamEventMap,
  type AiStreamEventName,
  type CopywritingRequest,
  type ScoreResult,
} from '@ai-ad-copilot/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ErrorCode } from '../../common/constants/error-code';
import { AiService, toHttpException } from './ai.service';
import { CopywritingRequestDto } from './dto/copywriting.dto';
import { RewriteRequestDto } from './dto/rewrite.dto';
import { ScoreRequestDto } from './dto/score.dto';
import { isAbortError } from './llm/llm-client';
import { COPYWRITING_ANGLES_IN_ORDER } from './prompt-templates';
import { createClientAbort, endSseResponse, initSseResponse, writeSseFrame } from './sse';

interface SseContext {
  writeFrame: <K extends AiStreamEventName>(event: K, data: AiStreamEventMap[K]) => void;
  /** 传给上游 LLM 的信号：客户端断开或某个版本失败时都会 abort */
  signal: AbortSignal;
  stopAll: () => void;
  cleanup: () => void;
}

function setupSse(res: Response): SseContext {
  const client = createClientAbort(res);
  const controller = new AbortController();
  const stopAll = (): void => controller.abort();

  if (client.signal.aborted) {
    stopAll();
  } else {
    client.signal.addEventListener('abort', stopAll, { once: true });
  }

  initSseResponse(res);

  const writeFrame = <K extends AiStreamEventName>(
    event: K,
    data: AiStreamEventMap[K],
  ): void => {
    // 客户端已断开时不再写，避免在已销毁的 socket 上抛错
    if (res.writableEnded || res.destroyed) {
      return;
    }
    writeSseFrame(res, event, data);
  };

  return {
    writeFrame,
    signal: controller.signal,
    stopAll,
    cleanup: () => {
      client.signal.removeEventListener('abort', stopAll);
      client.cleanup();
    },
  };
}

/** 把 LLM 错误写成终止性的 error 帧；取消（客户端断开）则安静收尾 */
function writeErrorFrame(
  writeFrame: SseContext['writeFrame'],
  error: unknown,
  index?: number,
): boolean {
  const exception = toHttpException(error);

  if (exception === null) {
    return false;
  }

  const payload = exception.getResponse();
  const body =
    typeof payload === 'object' && payload !== null
      ? (payload as { code?: unknown; message?: unknown })
      : {};

  writeFrame('error', {
    code: typeof body.code === 'number' ? body.code : ErrorCode.INTERNAL_SERVER_ERROR,
    message: typeof body.message === 'string' ? body.message : 'AI 服务异常，请稍后重试',
    index,
  });

  return true;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * 三个版本 = 3 路并发上游调用，按 index 分流到同一条 SSE 流：
   * meta → (variant → delta* → variant-done)* → done | error
   */
  @Post('copywriting/stream')
  @HttpCode(HttpStatus.OK)
  async streamCopywriting(
    @Body() dto: CopywritingRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const request: CopywritingRequest = {
      product: dto.product,
      audience: dto.audience,
      channel: dto.channel,
      tone: dto.tone,
      variants: Math.min(dto.variants ?? COPYWRITING_MAX_VARIANTS, COPYWRITING_MAX_VARIANTS),
    };

    const angles = COPYWRITING_ANGLES_IN_ORDER.slice(0, request.variants);
    const startedAt = Date.now();
    const sse = setupSse(res);
    const failure: { current: { index: number; error: unknown } | null } = { current: null };

    sse.writeFrame('meta', {
      model: this.aiService.model,
      variantCount: request.variants,
      requestId: randomUUID(),
    });

    try {
      await Promise.allSettled(
        angles.map(async (angle, index) => {
          sse.writeFrame('variant', { index, angle });
          let chars = 0;

          try {
            for await (const chunk of this.aiService.generateCopywriting(
              request,
              angle,
              sse.signal,
            )) {
              chars += chunk.length;
              sse.writeFrame('delta', { index, text: chunk });
            }

            sse.writeFrame('variant-done', { index, finishReason: 'stop', chars });
          } catch (error) {
            // 一个版本失败就停掉其余版本，避免继续消耗 token
            if (!isAbortError(error) && failure.current === null) {
              failure.current = { index, error };
              sse.stopAll();
            }
            throw error;
          }
        }),
      );

      if (failure.current) {
        writeErrorFrame(sse.writeFrame, failure.current.error, failure.current.index);
      } else if (!sse.signal.aborted) {
        sse.writeFrame('done', {
          durationMs: Date.now() - startedAt,
          variantCount: request.variants,
        });
      }
    } finally {
      sse.cleanup();
      endSseResponse(res);
    }
  }

  /** 改写只有一条流：meta → delta* → done | error */
  @Post('copywriting/rewrite/stream')
  @HttpCode(HttpStatus.OK)
  async streamRewrite(@Body() dto: RewriteRequestDto, @Res() res: Response): Promise<void> {
    const startedAt = Date.now();
    const sse = setupSse(res);

    sse.writeFrame('meta', {
      model: this.aiService.model,
      variantCount: 1,
      requestId: randomUUID(),
    });

    try {
      for await (const chunk of this.aiService.rewriteCopywriting(
        { original: dto.original, instruction: dto.instruction },
        sse.signal,
      )) {
        sse.writeFrame('delta', { index: 0, text: chunk });
      }

      if (!sse.signal.aborted) {
        sse.writeFrame('done', { durationMs: Date.now() - startedAt, variantCount: 1 });
      }
    } catch (error) {
      writeErrorFrame(sse.writeFrame, error, 0);
    } finally {
      sse.cleanup();
      endSseResponse(res);
    }
  }

  /** 打分：普通 JSON（走全局 ResponseInterceptor 包装） */
  @Post('copywriting/score')
  @HttpCode(HttpStatus.OK)
  async score(@Body() dto: ScoreRequestDto): Promise<ScoreResult[]> {
    try {
      return await this.aiService.scoreCopywriting(dto.copies);
    } catch (error) {
      // 三个接口的语义都是"执行一次生成"，成功统一 200，失败由过滤器按业务码输出
      throw toHttpException(error) ?? error;
    }
  }
}
