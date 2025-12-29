const STORAGE_KEY = "fastingTrackerStateV1";

const FAST_TYPES = [
  {
    id: "16_8",
    label: "16:8",
    durationHours: 16,
    bullets: [
      "Classic daily fasting schedule",
      "Supports weight loss and insulin sensitivity",
      "Allows flexible daytime eating window"
    ]
  },
  {
    id: "18_6",
    label: "18:6",
    durationHours: 18,
    bullets: [
      "Longer fat-burning window",
      "May deepen metabolic switching",
      "Helpful for appetite regulation"
    ]
  },
  {
    id: "20_4",
    label: "20:4",
    durationHours: 20,
    bullets: [
      "Short eating window with extended fasting",
      "May support stronger autophagy signals",
      "Requires careful nutrient-dense meals"
    ]
  },
  {
    id: "24",
    label: "24h",
    durationHours: 24,
    bullets: [
      "Once-per-day meal pattern",
      "Can simplify daily planning",
      "Break fast mindfully to avoid overeating"
    ]
  },
  {
    id: "36",
    label: "36h",
    durationHours: 36,
    bullets: [
      "Occasional extended fast",
      "Used for deeper metabolic reset",
      "Hydration and electrolytes are essential"
    ]
  }
];

const defaultState = {
  settings: {
    defaultFastTypeId: "16_8",
    notifyOnEnd: true,
    hourlyReminders: true
  },
  activeFast: null,
  history: [],
  reminders: {
    endNotified: false,
    lastHourlyAt: null
  }
};

let state = loadState();
let selectedFastTypeId = state.settings.defaultFastTypeId || FAST_TYPES[0].id;
let tickTimer = null;
let calendarMonth = startOfMonth(new Date());
let selectedDayKey = formatDateKey(new Date());

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  startTick();
  registerServiceWorker();
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(defaultState);
    const parsed = JSON.parse(raw);
    if (!parsed.settings) parsed.settings = clone(defaultState.settings);
    if (!parsed.reminders) parsed.reminders = clone(defaultState.reminders);
    if (!Array.isArray(parsed.history)) parsed.history = [];
    return parsed;
  } catch (e) {
    return clone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function initUI() {
  initTabs();
  initFastTypeChips();
  initButtons();
  initSettings();
  initCalendar();
  updateTimerMeta();
  renderAll();
}

function initTabs() {
  const tabButtons = document.querySelectorAll("nav .nav-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      switchTab(tab);
    });
  });
  switchTab("timer");
}

function switchTab(tab) {
  const tabs = ["timer", "history", "settings"];
  tabs.forEach(id => {
    const section = document.getElementById("tab-" + id);
    const btn = document.querySelector(`nav .nav-btn[data-tab="${id}"]`);
    if (id === tab) {
      section.classList.remove("hidden");
      btn.classList.add("nav-btn-active", "text-slate-100");
      btn.classList.remove("text-slate-500");
    } else {
      section.classList.add("hidden");
      btn.classList.remove("nav-btn-active", "text-slate-100");
      btn.classList.add("text-slate-500");
    }
  });
  if (tab === "history") {
    renderCalendar();
    renderDayDetails();
    renderRecentFasts();
  }
  if (tab === "settings") {
    renderSettings();
  }
}

function initFastTypeChips() {
  const container = document.getElementById("fast-type-chips");
  container.innerHTML = "";
  FAST_TYPES.forEach(type => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.typeId = type.id;
    btn.className = "whitespace-nowrap px-3 py-1.5 rounded-full border text-xs flex items-center gap-1 border-slate-700 text-slate-100 bg-slate-900/80";
    btn.textContent = type.label;
    btn.addEventListener("click", () => {
      selectedFastTypeId = type.id;
      highlightSelectedFastType();
      updateTimerMeta();
      openFastTypeModal(type);
    });
    container.appendChild(btn);
  });
  highlightSelectedFastType();
}

function highlightSelectedFastType() {
  const chips = document.querySelectorAll("#fast-type-chips button");
  chips.forEach(chip => {
    const isActive = chip.dataset.typeId === selectedFastTypeId;
    if (isActive) {
      chip.classList.add("bg-brand-500", "text-slate-950", "border-brand-500");
      chip.classList.remove("bg-slate-900/80", "text-slate-100", "border-slate-700");
    } else {
      chip.classList.remove("bg-brand-500", "text-slate-950", "border-brand-500");
      chip.classList.add("bg-slate-900/80", "text-slate-100", "border-slate-700");
    }
  });
  const type = getSelectedFastType();
  const labelEl = document.getElementById("timer-type");
  if (type) {
    labelEl.textContent = type.label + " fast";
  } else {
    labelEl.textContent = "No fast selected";
  }
}

function openFastTypeModal(type) {
  const modal = document.getElementById("fast-type-modal");
  const label = document.getElementById("modal-type-label");
  const duration = document.getElementById("modal-type-duration");
  const list = document.getElementById("modal-bullets");
  label.textContent = type.label + " fast";
  duration.textContent = type.durationHours + " hours";
  list.innerHTML = "";
  type.bullets.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
  document.getElementById("modal-use-type").onclick = () => {
    selectedFastTypeId = type.id;
    highlightSelectedFastType();
    updateTimerMeta();
    modal.classList.add("hidden");
  };
  document.getElementById("modal-close").onclick = () => {
    modal.classList.add("hidden");
  };
  modal.classList.remove("hidden");
}

function getSelectedFastType() {
  return FAST_TYPES.find(t => t.id === selectedFastTypeId) || FAST_TYPES[0];
}

function initButtons() {
  const startBtn = document.getElementById("start-fast-btn");
  const endBtn = document.getElementById("end-fast-btn");
  const completeBtn = document.getElementById("complete-fast-btn");
  startBtn.addEventListener("click", () => {
    if (!selectedFastTypeId) return;
    startFast();
  });
  endBtn.addEventListener("click", () => {
    if (!state.activeFast) return;
    finishFast(true);
  });
  completeBtn.addEventListener("click", () => {
    if (!state.activeFast) return;
    finishFast(false);
  });
  const notificationsToggle = document.getElementById("notifications-toggle");
  notificationsToggle.addEventListener("click", handleNotificationToggle);
  const clearBtn = document.getElementById("clear-data");
  clearBtn.addEventListener("click", clearAllData);
  const exportBtn = document.getElementById("export-data");
  exportBtn.addEventListener("click", exportData);
  document.getElementById("calendar-prev").addEventListener("click", () => {
    calendarMonth = addMonths(calendarMonth, -1);
    renderCalendar();
    renderDayDetails();
  });
  document.getElementById("calendar-next").addEventListener("click", () => {
    calendarMonth = addMonths(calendarMonth, 1);
    renderCalendar();
    renderDayDetails();
  });
  document.getElementById("toggle-end-alert").addEventListener("click", () => {
    state.settings.notifyOnEnd = !state.settings.notifyOnEnd;
    saveState();
    renderSettings();
  });
  document.getElementById("toggle-hourly-alert").addEventListener("click", () => {
    state.settings.hourlyReminders = !state.settings.hourlyReminders;
    saveState();
    renderSettings();
  });
  document.getElementById("default-fast-select").addEventListener("change", e => {
    state.settings.defaultFastTypeId = e.target.value;
    selectedFastTypeId = e.target.value;
    saveState();
    highlightSelectedFastType();
    updateTimerMeta();
  });
}

function startFast() {
  const type = getSelectedFastType();
  const now = Date.now();
  const durationMs = type.durationHours * 60 * 60 * 1000;
  const end = now + durationMs;
  state.activeFast = {
    id: "fast_" + now,
    typeId: type.id,
    startTimestamp: now,
    endTimestamp: end,
    plannedDurationHours: type.durationHours,
    status: "active"
  };
  state.reminders.endNotified = false;
  state.reminders.lastHourlyAt = null;
  saveState();
  renderAll();
}

function finishFast(early) {
  const active = state.activeFast;
  if (!active) return;
  const now = Date.now();
  const endTs = early ? now : active.endTimestamp;
  const durationMs = Math.max(0, endTs - active.startTimestamp);
  const entry = {
    id: active.id,
    typeId: active.typeId,
    startTimestamp: active.startTimestamp,
    endTimestamp: endTs,
    durationHours: Math.round((durationMs / 36e5) * 100) / 100
  };
  state.history.unshift(entry);
  state.activeFast = null;
  state.reminders.endNotified = false;
  state.reminders.lastHourlyAt = null;
  saveState();
  renderAll();
  calendarMonth = startOfMonth(new Date());
  selectedDayKey = formatDateKey(new Date());
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
  tick();
}

function tick() {
  updateTimer();
  handleAlerts();
}

function updateTimer() {
  const ring = document.getElementById("progress-ring");
  const elapsedEl = document.getElementById("timer-elapsed");
  const remainingEl = document.getElementById("timer-remaining");
  const statusEl = document.getElementById("timer-status");
  const headerSubtitle = document.getElementById("header-subtitle");
  const startBtn = document.getElementById("start-fast-btn");
  const endBtn = document.getElementById("end-fast-btn");
  const completeBtn = document.getElementById("complete-fast-btn");
  const metaStart = document.getElementById("meta-start");
  const metaEnd = document.getElementById("meta-end");
  const metaPlanned = document.getElementById("meta-planned");
  const circumference = 2 * Math.PI * 80;
  ring.setAttribute("stroke-dasharray", circumference.toString());
  if (!state.activeFast) {
    ring.setAttribute("stroke-dashoffset", circumference.toString());
    elapsedEl.textContent = "00:00";
    remainingEl.textContent = "Remaining: 00:00";
    statusEl.textContent = "Idle";
    headerSubtitle.textContent = "No active fast";
    startBtn.classList.remove("hidden");
    endBtn.classList.add("hidden");
    completeBtn.classList.add("hidden");
    metaStart.textContent = "—";
    metaEnd.textContent = "—";
    const type = getSelectedFastType();
    metaPlanned.textContent = type.durationHours + " h";
    return;
  }
  const now = Date.now();
  const total = state.activeFast.endTimestamp - state.activeFast.startTimestamp;
  const elapsed = Math.max(0, now - state.activeFast.startTimestamp);
  let progress = total > 0 ? elapsed / total : 0;
  if (progress > 1) progress = 1;
  const offset = circumference * (1 - progress);
  ring.setAttribute("stroke-dashoffset", offset.toString());
  elapsedEl.textContent = formatDurationHMM(elapsed);
  const remaining = total - elapsed;
  if (remaining > 0) {
    remainingEl.textContent = "Remaining: " + formatDurationHMM(remaining);
  } else {
    const over = Math.abs(remaining);
    remainingEl.textContent = "Over: " + formatDurationHMM(over);
  }
  const startDate = new Date(state.activeFast.startTimestamp);
  const endDate = new Date(state.activeFast.endTimestamp);
  metaStart.textContent = formatDateTime(startDate);
  metaEnd.textContent = formatDateTime(endDate);
  metaPlanned.textContent = state.activeFast.plannedDurationHours + " h";
  if (now < state.activeFast.endTimestamp && state.activeFast.status === "active") {
    statusEl.textContent = "Fasting";
    headerSubtitle.textContent = "Ends " + formatTimeShort(endDate);
    startBtn.classList.add("hidden");
    endBtn.classList.remove("hidden");
    completeBtn.classList.add("hidden");
  } else {
    statusEl.textContent = "Fast complete";
    headerSubtitle.textContent = "Fast complete";
    startBtn.classList.add("hidden");
    endBtn.classList.add("hidden");
    completeBtn.classList.remove("hidden");
  }
}

function handleAlerts() {
  if (!state.activeFast) return;
  const now = Date.now();
  const endTs = state.activeFast.endTimestamp;
  if (now >= endTs && state.activeFast.status === "active") {
    state.activeFast.status = "completed";
    if (state.settings.notifyOnEnd) {
      sendNotification("Fast complete", "You have reached your fasting goal.");
    }
    state.reminders.endNotified = true;
    state.reminders.lastHourlyAt = now;
    saveState();
  } else if (state.activeFast.status === "completed" && state.settings.hourlyReminders && state.reminders.endNotified) {
    const last = state.reminders.lastHourlyAt || endTs;
    if (now - last >= 60 * 60 * 1000) {
      sendNotification("Post-fast reminder", "Consider how you want to break your fast.");
      state.reminders.lastHourlyAt = now;
      saveState();
    }
  }
}

function sendNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch (e) {}
}

function handleNotificationToggle() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    state.settings.notifyOnEnd = !state.settings.notifyOnEnd;
    saveState();
    renderSettings();
    renderNotificationToggle();
    return;
  }
  Notification.requestPermission().then(() => {
    if (Notification.permission === "granted") {
      state.settings.notifyOnEnd = true;
      saveState();
    }
    renderSettings();
    renderNotificationToggle();
  });
}

function renderNotificationToggle() {
  const dot = document.getElementById("notifications-dot");
  const label = document.getElementById("notifications-label");
  if (!("Notification" in window)) {
    dot.classList.remove("bg-emerald-400", "bg-red-500");
    dot.classList.add("bg-slate-600");
    label.textContent = "Unavailable";
    return;
  }
  if (Notification.permission === "granted") {
    if (state.settings.notifyOnEnd) {
      dot.classList.remove("bg-slate-600", "bg-red-500");
      dot.classList.add("bg-emerald-400");
      label.textContent = "Alerts on";
    } else {
      dot.classList.remove("bg-emerald-400", "bg-red-500");
      dot.classList.add("bg-slate-600");
      label.textContent = "Alerts off";
    }
  } else if (Notification.permission === "denied") {
    dot.classList.remove("bg-emerald-400", "bg-slate-600");
    dot.classList.add("bg-red-500");
    label.textContent = "Alerts blocked";
  } else {
    dot.classList.remove("bg-emerald-400", "bg-red-500");
    dot.classList.add("bg-slate-600");
    label.textContent = "Enable alerts";
  }
}

function initSettings() {
  const select = document.getElementById("default-fast-select");
  select.innerHTML = "";
  FAST_TYPES.forEach(type => {
    const opt = document.createElement("option");
    opt.value = type.id;
    opt.textContent = type.label + " (" + type.durationHours + "h)";
    select.appendChild(opt);
  });
}

function renderSettings() {
  const select = document.getElementById("default-fast-select");
  select.value = state.settings.defaultFastTypeId || FAST_TYPES[0].id;
  const endBtn = document.getElementById("toggle-end-alert");
  const hourlyBtn = document.getElementById("toggle-hourly-alert");
  if (state.settings.notifyOnEnd) {
    endBtn.classList.add("on");
  } else {
    endBtn.classList.remove("on");
  }
  if (state.settings.hourlyReminders) {
    hourlyBtn.classList.add("on");
  } else {
    hourlyBtn.classList.remove("on");
  }
  renderNotificationToggle();
}

function renderAll() {
  highlightSelectedFastType();
  updateTimer();
  renderSettings();
  renderCalendar();
  renderDayDetails();
  renderRecentFasts();
}

function clearAllData() {
  if (!confirm("Clear all fasting history and active fast?")) return;
  state = clone(defaultState);
  selectedFastTypeId = state.settings.defaultFastTypeId || FAST_TYPES[0].id;
  saveState();
  renderAll();
}

function exportData() {
  const dataStr = JSON.stringify(state.history, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fasting-history.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initCalendar() {
  calendarMonth = startOfMonth(new Date());
  selectedDayKey = formatDateKey(new Date());
}

function renderCalendar() {
  const label = document.getElementById("calendar-label");
  const grid = document.getElementById("calendar-grid");
  const monthName = calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  label.textContent = monthName;
  grid.innerHTML = "";
  const firstDay = startOfMonth(calendarMonth);
  const startWeekday = firstDay.getDay();
  const daysInMonth = getDaysInMonth(calendarMonth);
  const prevMonth = addMonths(calendarMonth, -1);
  const daysInPrevMonth = getDaysInMonth(prevMonth);
  const totalCells = 42;
  const todayKey = formatDateKey(new Date());
  const dayToFasts = buildDayFastMap();
  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "aspect-square rounded-xl flex flex-col items-center justify-center text-[11px]";
    let dayNum;
    let date;
    let isCurrentMonth = false;
    if (i < startWeekday) {
      dayNum = daysInPrevMonth - startWeekday + i + 1;
      date = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), dayNum);
      cell.classList.add("text-slate-600");
    } else if (i >= startWeekday + daysInMonth) {
      dayNum = i - startWeekday - daysInMonth + 1;
      const nextMonth = addMonths(calendarMonth, 1);
      date = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dayNum);
      cell.classList.add("text-slate-600");
    } else {
      dayNum = i - startWeekday + 1;
      date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), dayNum);
      isCurrentMonth = true;
      cell.classList.add("text-slate-200");
    }
    const key = formatDateKey(date);
    const hasFast = !!dayToFasts[key];
    const isSelected = key === selectedDayKey;
    const isToday = key === todayKey;
    if (isSelected) {
      cell.classList.add("bg-brand-500/20", "border", "border-brand-500");
    } else if (hasFast) {
      cell.classList.add("bg-slate-800");
    } else {
      cell.classList.add("bg-slate-900");
    }
    if (isToday && isCurrentMonth) {
      const dot = document.createElement("span");
      dot.className = "w-1.5 h-1.5 rounded-full bg-brand-500 mb-0.5";
      cell.appendChild(dot);
    }
    const labelEl = document.createElement("span");
    labelEl.textContent = dayNum;
    cell.appendChild(labelEl);
    if (hasFast) {
      const tiny = document.createElement("span");
      tiny.className = "mt-0.5 text-[9px] text-brand-100";
      const hours = dayToFasts[key].totalHours;
      tiny.textContent = hours.toFixed(0) + "h";
      cell.appendChild(tiny);
    }
    cell.addEventListener("click", () => {
      selectedDayKey = key;
      renderCalendar();
      renderDayDetails();
    });
    grid.appendChild(cell);
  }
}

function buildDayFastMap() {
  const map = {};
  state.history.forEach(entry => {
    const d = new Date(entry.startTimestamp);
    const key = formatDateKey(d);
    if (!map[key]) {
      map[key] = { count: 0, totalHours: 0, entries: [] };
    }
    map[key].count += 1;
    map[key].totalHours += entry.durationHours || 0;
    map[key].entries.push(entry);
  });
  return map;
}

function renderDayDetails() {
  const summary = document.getElementById("day-summary");
  const list = document.getElementById("day-fast-list");
  const dayMap = buildDayFastMap();
  const dayData = dayMap[selectedDayKey];
  list.innerHTML = "";
  if (!dayData) {
    summary.textContent = "No fasts logged";
    return;
                                                                  }
