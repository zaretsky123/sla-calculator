import {
  SLA_TYPES,
  addDays,
  calculateDateInterval,
  calculateEndFromInterval,
  calculateSlaDeadline,
  calculateStartFromInterval,
  formatDate,
  formatShortDateTime,
  getDateMeta,
  isMoscowWorkingTime,
  parseDate,
  parseDateTime,
  toDateOnly,
} from "./calculations.js";

const byId = (id) => document.getElementById(id);

const state = {
  mode: "sla",
  anchor: "start",
  includeEnd: false,
  start: todayUtc(),
  end: addDays(todayUtc(), 1),
  calendarMonth: {
    start: todayUtc(),
    end: addDays(todayUtc(), 1),
  },
};

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const monthGenitive = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const weekdayInfo = [
  ["воскресенье", "neuter"],
  ["понедельник", "masculine"],
  ["вторник", "masculine"],
  ["среда", "feminine"],
  ["четверг", "masculine"],
  ["пятница", "feminine"],
  ["суббота", "feminine"],
];

const ordinalWords = {
  masculine: ["первый", "второй", "третий", "четвёртый", "пятый"],
  feminine: ["первая", "вторая", "третья", "четвёртая", "пятая"],
  neuter: ["первое", "второе", "третье", "четвёртое", "пятое"],
};

const lastWords = {
  masculine: "последний",
  feminine: "последняя",
  neuter: "последнее",
};

const shortWeekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

let copyFeedbackTimer;

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function sameDate(left, right) {
  return formatDate(left) === formatDate(right);
}

function maskDateTime(value) {
  const source = String(value ?? "");
  const separatorIndex = source.search(/[\s,T]/);
  const explicitTime = separatorIndex >= 0;
  const dateSource = explicitTime ? source.slice(0, separatorIndex) : source;
  const timeSource = explicitTime ? source.slice(separatorIndex + 1) : "";
  const dateDigits = dateSource.replace(/\D/g, "").slice(0, 8);
  const date = [dateDigits.slice(0, 2), dateDigits.slice(2, 4), dateDigits.slice(4, 8)]
    .filter(Boolean)
    .join(".");
  if (explicitTime) {
    const timeDigits = timeSource.replace(/\D/g, "").slice(0, 4);
    const time = [timeDigits.slice(0, 2), timeDigits.slice(2, 4)].filter(Boolean).join(":");
    return `${date} ${time}`;
  }

  const digits = source.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 8) return date;
  const time = [digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean).join(":");
  return `${date} ${time}`;
}

function maskDate(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join(".");
}

function setMode(mode, moveFocus = false) {
  state.mode = mode;
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && moveFocus) tab.focus();
  });
  byId("panel-sla").hidden = mode !== "sla";
  byId("panel-days").hidden = mode !== "days";
}

function setupTabs() {
  const tabs = [...document.querySelectorAll(".mode-tab")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      setMode(next.dataset.mode, true);
    });
  });
}

function updateSlaDetails() {
  const sla = SLA_TYPES[byId("sla-type").value];
  byId("base-hours").textContent = `${sla.baseHours} ч`;
  byId("additional-days").textContent = String(sla.additionalDays);
}

function renderSlaMonth(receivedAt, deadline) {
  const host = byId("sla-month");
  const grid = byId("sla-month-grid");
  const startDay = toDateOnly(receivedAt);
  const deadlineDay = toDateOnly(deadline);
  const monthStart = new Date(Date.UTC(deadlineDay.getUTCFullYear(), deadlineDay.getUTCMonth(), 1));
  const calendarStart = addDays(monthStart, -((monthStart.getUTCDay() + 6) % 7));
  const rangeStart = Math.min(startDay.getTime(), deadlineDay.getTime());
  const rangeEnd = Math.max(startDay.getTime(), deadlineDay.getTime());

  byId("sla-month-title").textContent = `Крайний срок — ${weekdayInfo[deadlineDay.getUTCDay()][0]}`;
  byId("sla-month-label").textContent = `${monthNames[deadlineDay.getUTCMonth()]} ${deadlineDay.getUTCFullYear()}`;
  grid.setAttribute("aria-label", `Календарь: ${monthNames[deadlineDay.getUTCMonth()]} ${deadlineDay.getUTCFullYear()}`);
  grid.innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(calendarStart, index);
    const time = date.getTime();
    const weekend = [0, 6].includes(date.getUTCDay());
    const outside = date.getUTCMonth() !== deadlineDay.getUTCMonth();
    const classes = [
      "sla-month-day",
      outside ? "is-outside" : "",
      weekend ? "is-weekend" : "",
      time >= rangeStart && time <= rangeEnd && !weekend && !outside ? "is-period" : "",
      sameDate(date, startDay) ? "is-start" : "",
      sameDate(date, deadlineDay) ? "is-deadline" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const marker = sameDate(date, deadlineDay) ? "срок" : sameDate(date, startDay) ? "старт" : "";
    return `
      <div class="${classes}" role="gridcell" aria-label="${shortWeekdays[date.getUTCDay()]}, ${formatDate(date)}${marker ? `, ${marker}` : ""}">
        <strong>${date.getUTCDate()}</strong>
        <small>${marker}</small>
      </div>
    `;
  }).join("");
  host.hidden = false;
}

function resetSlaResult() {
  byId("deadline-value").textContent = "—";
  byId("deadline-status").textContent = "ожидает данных";
  const copyButton = byId("copy-deadline");
  copyButton.disabled = true;
  copyButton.classList.remove("is-copied");
  byId("copy-deadline-label").textContent = "Скопировать";
  byId("sla-month").hidden = true;
  byId("sla-month-grid").innerHTML = "";
}

function calculateSla({ silent = false } = {}) {
  const input = byId("received-at");
  const error = byId("received-error");
  updateSlaDetails();
  try {
    const receivedAt = parseDateTime(input.value);
    input.value = formatShortDateTime(receivedAt);
    input.removeAttribute("aria-invalid");
    error.textContent = "";
    const slaType = byId("sla-type").value;
    const result = calculateSlaDeadline(receivedAt, slaType);
    const deadline = formatShortDateTime(result.deadline);
    byId("deadline-value").textContent = deadline;
    byId("deadline-status").textContent = "рассчитано";
    byId("copy-deadline").disabled = false;
    renderSlaMonth(receivedAt, result.deadline);
    return { ...result, deadlineText: deadline };
  } catch (problem) {
    resetSlaResult();
    byId("deadline-status").textContent = "нужны данные";
    if (!silent) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = problem.message;
    }
    return null;
  }
}

async function writeClipboardText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = value;
  fallback.setAttribute("readonly", "");
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand("copy");
  fallback.remove();
  if (!copied) throw new Error("Не удалось скопировать");
}

async function copyDeadline() {
  const value = byId("deadline-value").textContent.trim();
  const button = byId("copy-deadline");
  const label = byId("copy-deadline-label");
  if (!value || value === "—" || button.disabled) return;

  window.clearTimeout(copyFeedbackTimer);
  try {
    await writeClipboardText(value);
    button.classList.add("is-copied");
    label.textContent = "Скопировано";
  } catch {
    button.classList.remove("is-copied");
    label.textContent = "Не удалось";
  }
  copyFeedbackTimer = window.setTimeout(() => {
    button.classList.remove("is-copied");
    label.textContent = "Скопировать";
  }, 1600);
}

function tryAutoCalculateSla() {
  const input = byId("received-at");
  try {
    parseDateTime(input.value);
    return calculateSla({ silent: true });
  } catch {
    resetSlaResult();
    return null;
  }
}

function setupSlaForm() {
  const input = byId("received-at");
  byId("copy-deadline").addEventListener("click", copyDeadline);
  input.addEventListener("input", () => {
    input.value = maskDateTime(input.value);
    input.removeAttribute("aria-invalid");
    byId("received-error").textContent = "";
    tryAutoCalculateSla();
  });
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    try {
      const parsed = parseDateTime(pasted);
      event.preventDefault();
      input.value = formatShortDateTime(parsed);
      input.removeAttribute("aria-invalid");
      byId("received-error").textContent = "";
      calculateSla({ silent: true });
    } catch {
      // Обычная вставка продолжится, после чего сработает маска поля.
    }
  });
  input.addEventListener("blur", () => {
    if (!input.value) return;
    try {
      input.value = formatShortDateTime(parseDateTime(input.value));
      calculateSla({ silent: true });
    } catch {
      input.setAttribute("aria-invalid", "true");
      byId("received-error").textContent = "Введите дату и время полностью";
    }
  });
  byId("sla-type").addEventListener("change", () => {
    updateSlaDetails();
    tryAutoCalculateSla();
  });
  byId("sla-form").addEventListener("submit", (event) => {
    event.preventDefault();
    calculateSla();
  });
  updateSlaDetails();
  resetSlaResult();
}

function updateScheduleStatus() {
  const chip = document.querySelector(".schedule-chip");
  const working = isMoscowWorkingTime(new Date());
  chip.classList.toggle("is-working", working);
  chip.classList.toggle("is-closed", !working);
  chip.setAttribute(
    "aria-label",
    `Рабочий график: понедельник–пятница, с 09:00 до 18:00 по московскому времени. Сейчас ${working ? "рабочее" : "нерабочее"} время`,
  );
}

function setupScheduleStatus() {
  updateScheduleStatus();
  window.setInterval(updateScheduleStatus, 30_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateScheduleStatus();
  });
}

function setAnchor(side) {
  state.anchor = side;
  document.querySelectorAll(".date-card").forEach((card) => {
    card.classList.toggle("is-anchor", card.dataset.side === side);
  });
}

function datePhrase(date) {
  const [weekday, gender] = weekdayInfo[date.getUTCDay()];
  const nextWeek = addDays(date, 7);
  const isLast = nextWeek.getUTCMonth() !== date.getUTCMonth();
  const ordinal = isLast
    ? lastWords[gender]
    : ordinalWords[gender][Math.floor((date.getUTCDate() - 1) / 7)];
  return `${ordinal} ${weekday} ${monthGenitive[date.getUTCMonth()]} ${date.getUTCFullYear()} года`;
}

function renderDateMeta(side) {
  const date = state[side];
  const meta = getDateMeta(date);
  byId(`${side}-phrase`).textContent = datePhrase(date);
  byId(`${side}-year-day`).textContent = String(meta.dayOfYear);
  byId(`${side}-week`).textContent = String(meta.isoWeek);
}

function renderCalendar(side) {
  const host = document.querySelector(`[data-calendar="${side}"]`);
  const view = state.calendarMonth[side];
  const selected = state[side];
  const first = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1));
  const gridStart = addDays(first, -((first.getUTCDay() + 6) % 7));
  const today = todayUtc();

  const dayButtons = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const outside = date.getUTCMonth() !== view.getUTCMonth();
    const weekend = [0, 6].includes(date.getUTCDay());
    const classes = [
      "calendar-day",
      outside ? "is-outside" : "",
      weekend ? "is-weekend" : "",
      sameDate(date, selected) ? "is-selected" : "",
      sameDate(date, today) ? "is-today" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return `<button class="${classes}" type="button" data-date="${formatDate(date)}" aria-label="${formatDate(date)}" aria-pressed="${sameDate(date, selected)}">${date.getUTCDate()}</button>`;
  }).join("");

  host.innerHTML = `
    <div class="calendar-header">
      <button class="calendar-nav" type="button" data-nav="-1" aria-label="Предыдущий месяц">‹</button>
      <div class="calendar-title">${monthNames[view.getUTCMonth()]} ${view.getUTCFullYear()}</div>
      <button class="calendar-nav" type="button" data-nav="1" aria-label="Следующий месяц">›</button>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
    </div>
    <div class="calendar-grid" role="grid">${dayButtons}</div>
  `;
}

function renderDateSide(side) {
  byId(`${side}-date`).value = formatDate(state[side]);
  state.calendarMonth[side] = new Date(
    Date.UTC(state[side].getUTCFullYear(), state[side].getUTCMonth(), 1),
  );
  renderCalendar(side);
  renderDateMeta(side);
}

function updateIntervalFields() {
  const interval = calculateDateInterval(state.start, state.end, state.includeEnd);
  const values = {
    "total-days": interval.totalDays,
    "total-working-days": interval.totalWorkingDays,
    "total-weeks": interval.weeks,
    "total-week-days": interval.weekDays,
    "total-months": interval.months,
    "total-month-days": interval.monthDays,
    "total-years": interval.years,
    "total-year-months": interval.yearMonths,
    "total-year-days": interval.yearDays,
  };
  Object.entries(values).forEach(([id, value]) => {
    byId(id).value = String(value);
  });
  byId("interval-error").textContent = "";
  return interval;
}

function commitDate(side, value) {
  try {
    const date = parseDate(value);
    state[side] = date;
    byId(`${side}-date-error`).textContent = "";
    byId(`${side}-date`).removeAttribute("aria-invalid");
    setAnchor(side);
    renderDateSide(side);
    updateIntervalFields();
    return date;
  } catch (problem) {
    byId(`${side}-date`).setAttribute("aria-invalid", "true");
    byId(`${side}-date-error`).textContent = problem.message;
    return null;
  }
}

function integerValue(id) {
  const raw = byId(id).value.trim();
  if (!/^-?\d+$/.test(raw)) throw new RangeError("Интервал должен состоять из целых чисел");
  return Number(raw);
}

function intervalFromRow(kind) {
  switch (kind) {
    case "days":
      return { kind, days: integerValue("total-days") };
    case "workingDays":
      return { kind, days: integerValue("total-working-days") };
    case "weeks":
      return {
        kind,
        weeks: integerValue("total-weeks"),
        days: integerValue("total-week-days"),
      };
    case "months":
      return {
        kind,
        months: integerValue("total-months"),
        days: integerValue("total-month-days"),
      };
    case "years":
      return {
        kind,
        years: integerValue("total-years"),
        months: integerValue("total-year-months"),
        days: integerValue("total-year-days"),
      };
    default:
      throw new RangeError("Неизвестный вид интервала");
  }
}

function applyInterval(kind) {
  try {
    const interval = intervalFromRow(kind);
    if (state.anchor === "start") {
      state.end = calculateEndFromInterval(state.start, interval, state.includeEnd);
      renderDateSide("end");
    } else {
      state.start = calculateStartFromInterval(state.end, interval, state.includeEnd);
      renderDateSide("start");
    }
    updateIntervalFields();
    return interval;
  } catch (problem) {
    byId("interval-error").textContent = problem.message;
    return null;
  }
}

function setupDateCalculator() {
  ["start", "end"].forEach((side) => {
    const input = byId(`${side}-date`);
    input.addEventListener("focus", () => setAnchor(side));
    input.addEventListener("input", () => {
      input.value = maskDate(input.value);
      input.removeAttribute("aria-invalid");
      byId(`${side}-date-error`).textContent = "";
    });
    input.addEventListener("change", () => commitDate(side, input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commitDate(side, input.value);
      input.blur();
    });
  });

  document.querySelectorAll(".calendar").forEach((calendar) => {
    const side = calendar.dataset.calendar;
    calendar.addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      const nav = event.target.closest("[data-nav]");
      if (day) {
        commitDate(side, day.dataset.date);
        return;
      }
      if (nav) {
        const view = state.calendarMonth[side];
        state.calendarMonth[side] = new Date(
          Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + Number(nav.dataset.nav), 1),
        );
        renderCalendar(side);
      }
    });
  });

  document.querySelectorAll(".interval-row").forEach((row) => {
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/(?!^-)[^\d]/g, "");
        byId("interval-error").textContent = "";
      });
      input.addEventListener("change", () => applyInterval(row.dataset.interval));
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        applyInterval(row.dataset.interval);
        input.blur();
      });
    });
  });

  byId("include-end").addEventListener("change", (event) => {
    state.includeEnd = event.target.checked;
    updateIntervalFields();
  });

  renderDateSide("start");
  renderDateSide("end");
  setAnchor("start");
  updateIntervalFields();
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();

  const register = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      // Браузер может частично реализовывать экспериментальный интерфейс.
    }
  };

  register({
    name: "calculate_sla_deadline",
    title: "Рассчитать крайний срок SLA",
    description: "Рассчитывает и показывает крайний срок SLA.",
    inputSchema: {
      type: "object",
      properties: {
        receivedAt: { type: "string", description: "ДД.ММ.ГГ ЧЧ:ММ или ДД.ММ.ГГГГ ЧЧ:ММ" },
        slaType: { type: "string", enum: Object.keys(SLA_TYPES) },
      },
      required: ["receivedAt", "slaType"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const received = parseDateTime(input.receivedAt);
      if (!SLA_TYPES[input.slaType]) throw new RangeError("Неизвестный тип обращения");
      setMode("sla");
      byId("received-at").value = formatShortDateTime(received);
      byId("sla-type").value = input.slaType;
      const result = calculateSla();
      return { deadline: result.deadlineText, slaType: input.slaType };
    },
  });

  register({
    name: "calculate_date_interval",
    title: "Рассчитать период между датами",
    description: "Показывает календарные и рабочие интервалы между двумя датами.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "ДД.ММ.ГГГГ" },
        endDate: { type: "string", description: "ДД.ММ.ГГГГ" },
        includeEnd: { type: "boolean" },
      },
      required: ["startDate", "endDate", "includeEnd"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      state.start = parseDate(input.startDate);
      state.end = parseDate(input.endDate);
      state.includeEnd = Boolean(input.includeEnd);
      setMode("days");
      byId("include-end").checked = state.includeEnd;
      renderDateSide("start");
      renderDateSide("end");
      const interval = updateIntervalFields();
      return { startDate: formatDate(state.start), endDate: formatDate(state.end), ...interval };
    },
  });
}

setupTabs();
setupScheduleStatus();
setupSlaForm();
setupDateCalculator();
setMode("sla");
registerWebMcpTools();
