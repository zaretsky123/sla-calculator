export const DAY_MS = 86_400_000;
export const WORK_START_MINUTES = 9 * 60;
export const WORK_END_MINUTES = 18 * 60;
export const WORKDAY_MINUTES = WORK_END_MINUTES - WORK_START_MINUTES;

export const SLA_TYPES = Object.freeze({
  znoLow: Object.freeze({
    label: "ЗНО низкий",
    baseHours: 8,
    additionalDays: 2,
  }),
  incidentLow: Object.freeze({
    label: "Инцидент низкий",
    baseHours: 8,
    additionalDays: 2,
  }),
  incidentHigh: Object.freeze({
    label: "Инцидент высокий",
    baseHours: 20,
    additionalDays: 0,
  }),
  incidentCritical: Object.freeze({
    label: "Инцидент критический",
    baseHours: 4,
    additionalDays: 0,
  }),
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function makeUtcDate(year, month, day, hours = 0, minutes = 0) {
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes
  ) {
    throw new RangeError("Некорректная дата или время");
  }
  return date;
}

export function parseDateTime(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");

  let match = normalized.match(
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})[\s,T]+(\d{1,2}):(\d{2})(?::\d{2})?$/,
  );
  if (match) {
    const [, day, month, year, hours, minutes] = match;
    return makeUtcDate(+year, +month, +day, +hours, +minutes);
  }

  match = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?$/,
  );
  if (match) {
    const [, year, month, day, hours, minutes] = match;
    return makeUtcDate(+year, +month, +day, +hours, +minutes);
  }

  throw new RangeError("Введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ");
}

export function formatDateTime(date) {
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function parseDate(value) {
  const normalized = String(value ?? "").trim();
  let match = normalized.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return makeUtcDate(+year, +month, +day);
  }
  match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return makeUtcDate(+year, +month, +day);
  }
  throw new RangeError("Введите дату в формате ДД.ММ.ГГГГ");
}

export function formatDate(date) {
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

export function toDateOnly(date) {
  return makeUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + Number(amount));
  return result;
}

export function differenceInDays(start, end) {
  return Math.round((toDateOnly(end) - toDateOnly(start)) / DAY_MS);
}

export function excelMod(number, divisor) {
  if (!Number.isFinite(number) || !Number.isFinite(divisor) || divisor === 0) {
    throw new RangeError("Для ОСТАТ нужны конечные числа и ненулевой делитель");
  }
  const positiveDivisor = Math.abs(divisor);
  const result = ((number % positiveDivisor) + positiveDivisor) % positiveDivisor;
  return Math.abs(result) < Number.EPSILON * positiveDivisor * 8 ? 0 : result;
}

function holidayKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function holidaySet(holidays) {
  if (holidays instanceof Set) return holidays;
  return new Set((holidays ?? []).map((value) => (value instanceof Date ? holidayKey(value) : String(value))));
}

export function isWorkday(date, holidays = []) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidaySet(holidays).has(holidayKey(date));
}

export function workday(startDate, days, holidays = []) {
  const wholeDays = Math.trunc(Number(days));
  const date = toDateOnly(startDate);
  if (wholeDays === 0) return date;

  const direction = wholeDays > 0 ? 1 : -1;
  let remaining = Math.abs(wholeDays);
  const excluded = holidaySet(holidays);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    if (isWorkday(date, excluded)) remaining -= 1;
  }
  return date;
}

export function calculateSlaDeadline(input, slaType, holidays = []) {
  const receivedAt = input instanceof Date ? new Date(input) : parseDateTime(input);
  const sla = typeof slaType === "string" ? SLA_TYPES[slaType] : slaType;
  if (!sla || !Number.isFinite(sla.baseHours) || !Number.isInteger(sla.additionalDays)) {
    throw new RangeError("Неизвестный тип обращения");
  }

  const timeMinutes = receivedAt.getUTCHours() * 60 + receivedAt.getUTCMinutes();
  const shiftedMinutes = timeMinutes - WORK_START_MINUTES + sla.baseHours * 60;
  const workdayArgument = shiftedMinutes / WORKDAY_MINUTES + sla.additionalDays;
  const workdayOffset = Math.trunc(workdayArgument);
  let remainderMinutes = excelMod(shiftedMinutes, WORKDAY_MINUTES);

  // Граница рабочего интервала в исходной Excel-таблице остаётся 18:00,
  // а не превращается в 09:00. Это общее правило для положительного
  // точного кратного девяти часам, а не исключение для отдельной даты.
  if (shiftedMinutes > 0 && remainderMinutes === 0) {
    remainderMinutes = WORKDAY_MINUTES;
  }

  const deadlineDate = workday(receivedAt, workdayOffset, holidays);
  deadlineDate.setUTCMinutes(WORK_START_MINUTES + remainderMinutes);

  return {
    deadline: deadlineDate,
    baseHours: sla.baseHours,
    additionalDays: sla.additionalDays,
    workdayHours: WORKDAY_MINUTES / 60,
    workdayArgument,
    workdayOffset,
    remainderMinutes,
  };
}

export function countWorkingDays(start, end, holidays = []) {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  const distance = differenceInDays(from, to);
  if (distance === 0) return 0;
  if (distance < 0) return -countWorkingDays(to, from, holidays);

  const excluded = holidaySet(holidays);
  let count = 0;
  for (let date = from; date < to; date = addDays(date, 1)) {
    if (isWorkday(date, excluded)) count += 1;
  }
  return count;
}

export function addWorkingBoundary(start, count, holidays = []) {
  const date = toDateOnly(start);
  let remaining = Math.trunc(Number(count));
  const excluded = holidaySet(holidays);
  if (remaining > 0) {
    while (remaining > 0) {
      if (isWorkday(date, excluded)) remaining -= 1;
      date.setUTCDate(date.getUTCDate() + 1);
    }
  } else {
    while (remaining < 0) {
      date.setUTCDate(date.getUTCDate() - 1);
      if (isWorkday(date, excluded)) remaining += 1;
    }
  }
  return date;
}

export function subtractWorkingBoundary(end, count, holidays = []) {
  const date = toDateOnly(end);
  let remaining = Math.trunc(Number(count));
  const excluded = holidaySet(holidays);
  if (remaining > 0) {
    while (remaining > 0) {
      date.setUTCDate(date.getUTCDate() - 1);
      if (isWorkday(date, excluded)) remaining -= 1;
    }
  } else {
    while (remaining < 0) {
      if (isWorkday(date, excluded)) remaining += 1;
      date.setUTCDate(date.getUTCDate() + 1);
    }
  }
  return date;
}

export function addMonthsClamped(date, amount) {
  const source = toDateOnly(date);
  const day = source.getUTCDate();
  const target = makeUtcDate(source.getUTCFullYear(), source.getUTCMonth() + 1, 1);
  target.setUTCMonth(target.getUTCMonth() + Math.trunc(Number(amount)));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function addYearsClamped(date, amount) {
  const source = toDateOnly(date);
  const targetYear = source.getUTCFullYear() + Math.trunc(Number(amount));
  const month = source.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return makeUtcDate(targetYear, month, Math.min(source.getUTCDate(), lastDay));
}

function isMonthDayBefore(left, right) {
  return (
    left.getUTCMonth() < right.getUTCMonth() ||
    (left.getUTCMonth() === right.getUTCMonth() && left.getUTCDate() < right.getUTCDate())
  );
}

export function decomposeMonths(start, end) {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  const pivot = addMonthsClamped(from, months);
  return { months, days: differenceInDays(pivot, to) };
}

export function decomposeYears(start, end) {
  const from = toDateOnly(start);
  const to = toDateOnly(end);
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  if (isMonthDayBefore(to, from)) years -= 1;
  const yearPivot = addYearsClamped(from, years);
  const { months, days } = decomposeMonths(yearPivot, to);
  return { years, months, days };
}

export function calculateDateInterval(start, end, includeEnd = false, holidays = []) {
  const from = toDateOnly(start);
  const visibleEnd = toDateOnly(end);
  const effectiveEnd = addDays(visibleEnd, includeEnd ? 1 : 0);
  const totalDays = differenceInDays(from, effectiveEnd);
  const monthParts = decomposeMonths(from, effectiveEnd);
  const yearParts = decomposeYears(from, effectiveEnd);
  return {
    totalDays,
    totalWorkingDays: countWorkingDays(from, effectiveEnd, holidays),
    weeks: Math.floor(totalDays / 7),
    weekDays: excelMod(totalDays, 7),
    months: monthParts.months,
    monthDays: monthParts.days,
    years: yearParts.years,
    yearMonths: yearParts.months,
    yearDays: yearParts.days,
  };
}

export function calculateEndFromInterval(start, interval, includeEnd = false, holidays = []) {
  const from = toDateOnly(start);
  let effectiveEnd;
  switch (interval.kind) {
    case "days":
      effectiveEnd = addDays(from, Math.trunc(interval.days));
      break;
    case "workingDays":
      effectiveEnd = addWorkingBoundary(from, Math.trunc(interval.days), holidays);
      break;
    case "weeks":
      effectiveEnd = addDays(from, Math.trunc(interval.weeks) * 7 + Math.trunc(interval.days));
      break;
    case "months":
      effectiveEnd = addDays(addMonthsClamped(from, Math.trunc(interval.months)), Math.trunc(interval.days));
      break;
    case "years":
      effectiveEnd = addYearsClamped(from, Math.trunc(interval.years));
      effectiveEnd = addMonthsClamped(effectiveEnd, Math.trunc(interval.months));
      effectiveEnd = addDays(effectiveEnd, Math.trunc(interval.days));
      break;
    default:
      throw new RangeError("Неизвестный вид интервала");
  }
  return addDays(effectiveEnd, includeEnd ? -1 : 0);
}

export function calculateStartFromInterval(end, interval, includeEnd = false, holidays = []) {
  const effectiveEnd = addDays(toDateOnly(end), includeEnd ? 1 : 0);
  switch (interval.kind) {
    case "days":
      return addDays(effectiveEnd, -Math.trunc(interval.days));
    case "workingDays":
      return subtractWorkingBoundary(effectiveEnd, Math.trunc(interval.days), holidays);
    case "weeks":
      return addDays(effectiveEnd, -(Math.trunc(interval.weeks) * 7 + Math.trunc(interval.days)));
    case "months": {
      const withoutDays = addDays(effectiveEnd, -Math.trunc(interval.days));
      return addMonthsClamped(withoutDays, -Math.trunc(interval.months));
    }
    case "years": {
      let result = addDays(effectiveEnd, -Math.trunc(interval.days));
      result = addMonthsClamped(result, -Math.trunc(interval.months));
      return addYearsClamped(result, -Math.trunc(interval.years));
    }
    default:
      throw new RangeError("Неизвестный вид интервала");
  }
}

export function getDateMeta(date) {
  const current = toDateOnly(date);
  const first = makeUtcDate(current.getUTCFullYear(), 1, 1);
  const dayOfYear = differenceInDays(first, current) + 1;

  const thursday = addDays(current, 4 - (current.getUTCDay() || 7));
  const isoYearStart = makeUtcDate(thursday.getUTCFullYear(), 1, 1);
  const isoWeek = Math.ceil((differenceInDays(isoYearStart, thursday) + 1) / 7);
  return { dayOfYear, isoWeek };
}
