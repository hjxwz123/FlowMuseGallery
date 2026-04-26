function pad2(value: number) {
  return value.toString().padStart(2, '0');
}

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

/**
 * 以指定时区生成日期键（YYYY-MM-DD）。
 */
export function toTimeZoneDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to format date key in timezone: ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * 以北京时间（Asia/Shanghai）生成日期键（YYYY-MM-DD）。
 */
export function toBeijingDateKey(date: Date) {
  return toTimeZoneDateKey(date, BEIJING_TIME_ZONE);
}

/**
 * 将数据库 DATE 字段对应的 Date 还原为稳定日期键（YYYY-MM-DD）。
 * 使用 UTC 组件可避免 MySQL DATE 与本地时区转换造成的“前一天”偏移。
 */
export function toDateOnlyKey(date: Date | null | undefined) {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

/**
 * 将日期键转换成可写入 MySQL DATE 的稳定值（UTC 00:00:00）。
 */
export function dateKeyToDateOnlyValue(dateKey: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}
