import { DASHBOARD_MAX_RANGE_DAYS } from '@ai-ad-copilot/shared';
import { BadRequestException } from '@nestjs/common';

import { ErrorCode } from '../../common/constants/error-code';
import { validateDashboardDateRange } from './query-range';

function captureRangeError(from: string, to: string, maxDays?: number): BadRequestException {
  try {
    validateDashboardDateRange(from, to, maxDays);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return error as BadRequestException;
  }

  throw new Error(`期望 ${from} ~ ${to} 抛出区间校验错误，但没有抛出`);
}

describe('validateDashboardDateRange', () => {
  it('合法区间不抛错', () => {
    expect(() => validateDashboardDateRange('2026-09-07', '2026-09-20')).not.toThrow();
    expect(() => validateDashboardDateRange('2026-09-20', '2026-09-20')).not.toThrow();
  });

  it('跨度上限边界：90 天合法，91 天拒绝', () => {
    // 2026-06-23 ~ 2026-09-20 正好 90 天（闭区间）
    expect(() => validateDashboardDateRange('2026-06-23', '2026-09-20')).not.toThrow();
    expect(DASHBOARD_MAX_RANGE_DAYS).toBe(90);

    expect(() => validateDashboardDateRange('2026-06-22', '2026-09-20')).toThrow(
      BadRequestException,
    );
  });

  it('from 晚于 to 时拒绝，错误码是 40001', () => {
    const error = captureRangeError('2026-09-20', '2026-09-01');

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.INVALID_QUERY_RANGE,
      message: expect.stringContaining('起始日期不能晚于结束日期'),
    });
  });

  it('跨度超限时拒绝，错误码是 40001', () => {
    const error = captureRangeError('2026-01-01', '2026-06-01');

    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.INVALID_QUERY_RANGE,
      message: expect.stringContaining('最多支持 90 天'),
    });
  });

  it('非法日历日期也会被拦住', () => {
    const error = captureRangeError('2026-02-30', '2026-03-01');

    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.INVALID_QUERY_RANGE,
      message: expect.stringContaining('合法的 YYYY-MM-DD'),
    });
  });

  it('maxDays 可覆盖，便于其他接口复用', () => {
    expect(() => validateDashboardDateRange('2026-09-14', '2026-09-20', 7)).not.toThrow();
    expect(() => validateDashboardDateRange('2026-09-13', '2026-09-20', 7)).toThrow(
      BadRequestException,
    );
  });
});
