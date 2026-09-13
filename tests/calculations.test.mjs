import test from "node:test";
import assert from "node:assert/strict";
import {
  SLA_TYPES,
  calculateDateInterval,
  calculateEndFromInterval,
  calculateSlaDeadline,
  calculateStartFromInterval,
  excelMod,
  formatDate,
  formatDateTime,
  formatShortDateTime,
  isMoscowWorkingTime,
  parseDate,
  parseDateTime,
} from "../dist/calculations.js";

const cases = [
  ["14.09.2026 11:13", "znoLow", "17.09.2026 10:13"],
  ["14.09.2026 07:00", "znoLow", "16.09.2026 15:00"],
  ["14.09.2026 00:00", "znoLow", "15.09.2026 17:00"],
  ["14.09.2026 09:00", "znoLow", "16.09.2026 17:00"],
  ["14.09.2026 19:00", "znoLow", "18.09.2026 18:00"],
  ["18.09.2026 17:30", "znoLow", "23.09.2026 16:30"],
  ["18.09.2026 18:00", "znoLow", "23.09.2026 17:00"],
  ["18.09.2026 18:01", "znoLow", "23.09.2026 17:01"],
  ["18.09.2026 23:59", "znoLow", "24.09.2026 13:59"],
  ["19.09.2026 12:00", "znoLow", "23.09.2026 11:00"],
  ["20.09.2026 17:00", "znoLow", "23.09.2026 16:00"],
  ["14.09.2026 11:13", "incidentLow", "17.09.2026 10:13"],
  ["14.09.2026 11:13", "incidentHigh", "16.09.2026 13:13"],
  ["14.09.2026 11:13", "incidentCritical", "14.09.2026 15:13"],
  ["18.09.2026 18:01", "incidentHigh", "23.09.2026 11:01"],
];

test("все контрольные SLA-кейсы совпадают с Excel", () => {
  const rows = cases.map(([input, type, expected]) => {
    const actual = formatDateTime(calculateSlaDeadline(input, type).deadline);
    return {
      "Вход": input,
      "Тип": SLA_TYPES[type].label,
      "Ожидается": expected,
      "Получено": actual,
      "Статус": actual === expected ? "OK" : "ERROR",
    };
  });
  console.table(rows);
  for (const row of rows) assert.equal(row["Получено"], row["Ожидается"]);
});

test("секунды и лишние пробелы не влияют на SLA", () => {
  const parsed = parseDateTime("  14.09.2026   11:13:47  ");
  assert.equal(formatDateTime(parsed), "14.09.2026 11:13");
});

test("двухзначный год разворачивается внутри и сокращается при отображении", () => {
  const short = parseDateTime("18.09.26 23:59");
  assert.equal(short.getUTCFullYear(), 2026);
  assert.equal(formatDateTime(short), "18.09.2026 23:59");
  assert.equal(formatShortDateTime(short), "18.09.26 23:59");

  const longWithSeconds = parseDateTime("18.09.2026 23:59:45");
  assert.equal(formatShortDateTime(longWithSeconds), "18.09.26 23:59");
  assert.equal(
    formatShortDateTime(calculateSlaDeadline(short, "znoLow").deadline),
    "24.09.26 13:59",
  );
  assert.equal(
    formatShortDateTime(calculateSlaDeadline(longWithSeconds, "znoLow").deadline),
    "24.09.26 13:59",
  );
});

test("любой двухзначный год относится к 2000–2099", () => {
  assert.equal(parseDateTime("01.01.00 09:00").getUTCFullYear(), 2000);
  assert.equal(parseDateTime("01.01.31 09:00").getUTCFullYear(), 2031);
  assert.equal(parseDateTime("31.12.99 17:59").getUTCFullYear(), 2099);
});

test("Excel ОСТАТ всегда неотрицателен при положительном делителе", () => {
  assert.equal(excelMod(-1, 9), 8);
  assert.equal(excelMod(-8, 7), 6);
  assert.equal(excelMod(18, 9), 0);
});

test("индикатор рабочего времени использует московский график", () => {
  assert.equal(isMoscowWorkingTime("2026-09-14T05:59:00Z"), false);
  assert.equal(isMoscowWorkingTime("2026-09-14T06:00:00Z"), true);
  assert.equal(isMoscowWorkingTime("2026-09-14T14:59:00Z"), true);
  assert.equal(isMoscowWorkingTime("2026-09-14T15:00:00Z"), false);
  assert.equal(isMoscowWorkingTime("2026-09-13T09:00:00Z"), false);
});

test("прямой расчёт интервала повторяет механику калькулятора дней", () => {
  const interval = calculateDateInterval(parseDate("01.09.2026"), parseDate("10.09.2026"), false);
  assert.deepEqual(interval, {
    totalDays: 9,
    totalWorkingDays: 7,
    weeks: 1,
    weekDays: 2,
    months: 0,
    monthDays: 9,
    years: 0,
    yearMonths: 0,
    yearDays: 9,
  });
});

test("включение конечной даты добавляет её в каждый интервал", () => {
  const interval = calculateDateInterval(parseDate("01.09.2026"), parseDate("10.09.2026"), true);
  assert.equal(interval.totalDays, 10);
  assert.equal(interval.totalWorkingDays, 8);
  assert.equal(interval.weeks, 1);
  assert.equal(interval.weekDays, 3);
});

test("обратный интервал и календарные остатки совпадают с исходной механикой", () => {
  const reversed = calculateDateInterval(parseDate("10.09.2026"), parseDate("01.09.2026"), true);
  assert.equal(reversed.totalDays, -8);
  assert.equal(reversed.totalWorkingDays, -6);
  assert.equal(reversed.weeks, -2);
  assert.equal(reversed.weekDays, 6);
  assert.equal(reversed.months, -1);
  assert.equal(reversed.monthDays, 23);
  assert.equal(reversed.years, -1);
  assert.equal(reversed.yearMonths, 11);
  assert.equal(reversed.yearDays, 23);

  const monthEdge = calculateDateInterval(parseDate("31.01.2026"), parseDate("28.02.2026"), true);
  assert.equal(monthEdge.months, 1);
  assert.equal(monthEdge.monthDays, 1);
});

test("календарь рассчитывает конечную дату по любому виду интервала", () => {
  const start = parseDate("01.09.2026");
  assert.equal(formatDate(calculateEndFromInterval(start, { kind: "days", days: 15 })), "16.09.2026");
  assert.equal(formatDate(calculateEndFromInterval(start, { kind: "workingDays", days: 10 })), "15.09.2026");
  assert.equal(formatDate(calculateEndFromInterval(start, { kind: "weeks", weeks: 2, days: 3 })), "18.09.2026");
  assert.equal(formatDate(calculateEndFromInterval(start, { kind: "months", months: 1, days: 5 })), "06.10.2026");
  assert.equal(
    formatDate(calculateEndFromInterval(start, { kind: "years", years: 1, months: 2, days: 3 })),
    "04.11.2027",
  );
});

test("календарь рассчитывает начальную дату назад от конечной", () => {
  const end = parseDate("30.09.2026");
  assert.equal(formatDate(calculateStartFromInterval(end, { kind: "workingDays", days: 10 })), "16.09.2026");
  assert.equal(formatDate(calculateStartFromInterval(end, { kind: "months", months: 1, days: 5 })), "25.08.2026");
  assert.equal(
    formatDate(calculateStartFromInterval(end, { kind: "years", years: 1, months: 2, days: 3 })),
    "27.07.2025",
  );
});
