/**
 * query 参数的归一化工具。
 *
 * HTTP query 里数组有两种传法，DTO 必须都能接住：
 * - 逗号分隔：`?channels=douyin,baidu`
 * - 重复 key：`?channels=douyin&channels=baidu`（express 会给数组）
 * 两者混用时按元素再拆一次，保证 service 拿到的永远是扁平数组。
 */
export function parseStringArray(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  const rawItems = Array.isArray(value) ? value : [value];

  return rawItems
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '');
}
