import {
  SLA_TYPES,
  addDays,
  calculateDateInterval,
  calculateEndFromInterval,
  calculateSlaDeadline,
  calculateStartFromInterval,
  formatDate,
  formatDateTime,
  getDateMeta,
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

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function sameDate(left, right) {
  return formatDate(left) === formatDate(right);
}

function maskDateTime(value) {
  const digits = String(value).replace(/\D/g, "").slice(0, 12);
  const date = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join(".");
  const time = [digits.slice(8, 10), digits.slice(10, 12)].filter(Boolean).join(":");
  return `${date}${time ? ` ${time}` : ""}`;
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

function calculateSla({ silent = false } = {}) {
  const input = byId("received-at");
  const error = byId("received-error");
  updateSlaDetails();
  try {
    const receivedAt = parseDateTime(input.value);
    input.value = formatDateTime(receivedAt);
    input.removeAttribute("aria-invalid");
    error.textContent = "";
    const slaType = byId("sla-type").value;
    const result = calculateSlaDeadline(receivedAt, slaType);
    const deadline = formatDateTime(result.deadline);
    byId("deadline-value").textContent = deadline;
    byId("deadline-status").textContent = "рассчитано";
    byId("deadline-caption").textContent = SLA_TYPES[slaType].label;
    return { deadline, ...result };
  } catch (problem) {
    byId("deadline-value").textContent = "—";
    byId("deadline-status").textContent = "нужны данные";
    byId("deadline-caption").textContent = "Проверьте дату и время поступления";
    if (!silent || input.value) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = problem.message;
    }
    return null;
  }
}

function setupSlaForm() {
  const input = byId("received-at");
  input.addEventListener("input", () => {
    input.value = maskDateTime(input.value);
    input.removeAttribute("aria-invalid");
    byId("received-error").textContent = "";
  });
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    try {
      const parsed = parseDateTime(pasted);
      event.preventDefault();
      input.value = formatDateTime(parsed);
      input.removeAttribute("aria-invalid");
      byId("received-error").textContent = "";
    } catch {
      // Обычная вставка продолжится, после чего сработает маска поля.
    }
  });
  input.addEventListener("blur", () => {
    if (!input.value) return;
    try {
      input.value = formatDateTime(parseDateTime(input.value));
    } catch {
      input.setAttribute("aria-invalid", "true");
      byId("received-error").textContent = "Введите дату и время полностью";
    }
  });
  byId("sla-type").addEventListener("change", () => {
    updateSlaDetails();
    if (input.value.length === 16) calculateSla({ silent: true });
  });
  byId("sla-form").addEventListener("submit", (event) => {
    event.preventDefault();
    calculateSla();
  });
  updateSlaDetails();
}

function setAnchor(side) {
  state.anchor = side;
  document.querySelectorAll(".date-card").forEach((card) => {
    card.classList.toggle("is-anchor", card.dataset.side === side);
  });
  byId("anchor-explainer").textContent =
    side === "start"
      ? "Сейчас опорная дата — начальная. Изменение интервала пересчитает конечную дату."
      : "Сейчас опорная дата — конечная. Изменение интервала пересчитает начальную дату.";
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
    description: "Рассчитывает и показывает крайний срок по Excel-совместимой SLA-формуле.",
    inputSchema: {
      type: "object",
      properties: {
        receivedAt: { type: "string", description: "ДД.ММ.ГГГГ ЧЧ:ММ" },
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
      byId("received-at").value = formatDateTime(received);
      byId("sla-type").value = input.slaType;
      const result = calculateSla();
      return { deadline: result.deadline, slaType: input.slaType };
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
setupSlaForm();
setupDateCalculator();
setMode("sla");
registerWebMcpTools();
