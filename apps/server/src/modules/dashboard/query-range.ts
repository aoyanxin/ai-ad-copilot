import { DASHBOARD_MAX_RANGE_DAYS } from '@ai-ad-copilot/shared';
import { BadRequestException } from '@nestjs/common';

import { ErrorCode } from '../../common/constants/error-code';
import { diffInDays, isDateKey } from '../../common/utils/date';

function rangeError(message: string): BadRequestException {
  return new BadRequestException({ code: ErrorCode.INVALID_QUERY_RANGE, message });
}

/**
 * 看板查询区间的业务语义校验（DTO 只保证格式合法）：
 * - from / to 必须是真实存在的日历日期
 * - from 不能晚于 to
 * - 闭区间跨度不能超过 maxDays（默认 shared 的 90 天上限）
 *
 * 纯函数，不依赖 NestJS 容器，便于单测；service 调用它，异常由
 * HttpExceptionFilter 统一转成 { code: 40001, ... }。
 */
export function validateDashboardDateRange(
  from: string,
  to: string,
  maxDays: number = DASHBOARD_MAX_RANGE_DAYS,
): void {
  if (!isDateKey(from) || !isDateKey(to)) {
    throw rangeError(`查询区间非法：from/to 必须是合法的 YYYY-MM-DD（收到 ${from} ~ ${to}）`);
  }

  if (diffInDays(from, to) < 0) {
    throw rangeError(`查询区间非法：起始日期不能晚于结束日期（${from} > ${to}）`);
  }

  const spanDays = diffInDays(from, to) + 1;
  if (spanDays > maxDays) {
    throw rangeError(`查询区间过长：最多支持 ${maxDays} 天（当前 ${spanDays} 天）`);
  }
}
