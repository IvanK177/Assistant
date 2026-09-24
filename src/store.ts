import type { AppState, DaySchedule, BusRoute, BusStop, ShiftType, WeekDay } from './types';

const STORAGE_KEY = 'college_assistant_data_v2';

const defaultScheduleFirst: DaySchedule[] = [
  {
    day: 'Пн',
    lessons: [
      { id: '1', subject: 'Технология работ по профессии рабочего ОЭВМ', startTime: '08:30', endTime: '09:15', room: 'к406' },
      { id: '2', subject: 'Технология работ по профессии рабочего ОЭВМ', startTime: '09:15', endTime: '10:00', room: 'к406' },
      { id: '3', subject: 'Внедрение и поддержка компьютерных систем', startTime: '10:20', endTime: '11:05', room: 'к406' },
      { id: '4', subject: 'Внедрение и поддержка компьютерных систем', startTime: '11:05', endTime: '11:50', room: 'к406' },
    ],
  },
  { day: 'Вт', lessons: [] },
  { day: 'Ср', lessons: [] },
  { day: 'Чт', lessons: [] },
  { day: 'Пт', lessons: [] },
  { day: 'Сб', lessons: [] },
];

const defaultScheduleSecond: DaySchedule[] = [
  { day: 'Пн', lessons: [] },
  { day: 'Вт', lessons: [] },
  { day: 'Ср', lessons: [] },
  { day: 'Чт', lessons: [] },
  { day: 'Пт', lessons: [] },
  { day: 'Сб', lessons: [] },
];

const defaultBusStop: BusStop = {
  id: 'stop1',
  name: 'Улица Красного Маяка, 4',
  walkMinutes: 4,
  coords: [55.611639, 37.599741],
};

const defaultRouteM96: BusRoute = {
  id: 'route_m96',
  number: 'м96',
  stopId: 'stop1',
  direction: 'До метро Пражская / Чертановская',
  scheduleFirst: [
    '06:00', '06:15', '06:25', '06:35', '06:45', '06:53', '07:01', '07:09', '07:17',
    '07:25', '07:33', '07:41', '07:49', '07:57', '08:05', '08:13', '08:21',
    '08:29', '08:37', '08:45', '08:53', '09:02', '09:12', '09:22', '09:35',
    '09:50', '10:05', '10:20', '10:40', '11:00', '11:20', '11:40', '12:00',
    '12:20', '12:40', '13:00', '13:20', '13:40',
  ],
  scheduleSecond: [
    '11:40', '11:55', '12:08', '12:20', '12:32', '12:44', '12:56', '13:08',
    '13:20', '13:32', '13:44', '13:56', '14:08', '14:20', '14:35', '14:50',
    '15:05', '15:20', '15:35', '15:50', '16:10', '16:30', '17:00', '17:20',
    '17:40', '18:00', '18:20', '18:40', '19:00', '19:20', '19:40', '20:00',
    '20:20', '20:40', '21:00', '21:20', '21:40', '22:00', '22:15', '22:30',
    '22:45', '23:00', '23:15', '23:25', '23:35', '23:45', '23:55', '00:10',
  ],
};

const defaultRouteC960: BusRoute = {
  id: 'route_c960',
  number: 'с960',
  stopId: 'stop1',
  direction: 'До метро Южная',
  scheduleFirst: [
    '06:20', '06:40', '07:00', '07:20', '07:40', '08:00', '08:20', '08:40',
    '09:00', '09:25', '09:50', '10:15', '10:45', '11:15', '11:45', '12:15',
    '12:45', '13:15', '13:45',
  ],
  scheduleSecond: [
    '11:45', '12:15', '12:45', '13:15', '13:45', '14:15', '14:45', '15:15',
    '15:45', '16:15', '16:45', '17:15', '17:45', '18:15', '18:45', '19:15',
    '19:45', '20:15', '20:45', '21:15', '21:45', '22:15', '22:45', '23:15',
    '23:35', '23:55',
  ],
};

const defaultState: AppState = {
  scheduleFirst: defaultScheduleFirst,
  scheduleSecond: defaultScheduleSecond,
  busRoutes: [defaultRouteM96, defaultRouteC960],
  busStops: [defaultBusStop],
  homework: [],
  settings: {
    walkMinutesToStop: 4,
    bufferMinutes: 3,
    travelMinutes: 20,
    notificationsEnabled: false,
    currentShift: 'first',
    shiftAutoDetect: true,
    firstShiftIsOddWeek: true,
  },
  activeTab: 'today',
};

// ─── ISO week number ───────────────────────────────────────
export function getISOWeekNumber(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getAutoShift(firstShiftIsOddWeek: boolean): ShiftType {
  const week = getISOWeekNumber();
  const isOdd = week % 2 === 1;
  return isOdd === firstShiftIsOddWeek ? 'first' : 'second';
}

export function getActiveShift(state: AppState): ShiftType {
  if (state.settings.shiftAutoDetect) {
    return getAutoShift(state.settings.firstShiftIsOddWeek);
  }
  return state.settings.currentShift;
}

export function getActiveSchedule(state: AppState): DaySchedule[] {
  const shift = getActiveShift(state);
  return shift === 'first' ? state.scheduleFirst : state.scheduleSecond;
}

// ─── Persist ──────────────────────────────────────────────
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const oldRaw = localStorage.getItem('college_assistant_data');
      if (oldRaw) {
        const old = JSON.parse(oldRaw) as Partial<{ schedule: DaySchedule[] } & AppState>;
        const migrated: AppState = {
          ...defaultState,
          ...old,
          scheduleFirst: (old as { schedule?: DaySchedule[] }).schedule || defaultState.scheduleFirst,
          scheduleSecond: defaultState.scheduleSecond,
          // migrate old routes that had single schedule
          busRoutes: (old.busRoutes || defaultState.busRoutes).map(r => ({
            ...r,
            scheduleFirst: (r as BusRoute & { schedule?: string[] }).schedule || r.scheduleFirst || [],
            scheduleSecond: r.scheduleSecond || [],
          })),
          settings: { ...defaultState.settings, ...(old.settings || {}) },
        };
        return migrated;
      }
      return defaultState;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    let busStops = (parsed.busStops && parsed.busStops.length > 0)
      ? parsed.busStops.map(s => {
          if (s.name === 'Остановка у дома' || (!s.coords && s.id === 'stop1')) {
            return { ...s, name: 'Улица Красного Маяка, 4', coords: [55.611639, 37.599741] as [number, number], walkMinutes: 4 };
          }
          return s;
        })
      : defaultState.busStops;

    let busRoutes = (parsed.busRoutes || []).map(r => ({
      ...r,
      scheduleFirst: (r as BusRoute & { schedule?: string[] }).schedule || r.scheduleFirst || [],
      scheduleSecond: r.scheduleSecond || [],
    }));
    if (busRoutes.length === 0 || (busRoutes.length === 1 && busRoutes[0].number === '18')) {
      busRoutes = defaultState.busRoutes;
    } else {
      // Ensure m96 and c960 have evening times if user was on old defaults
      busRoutes = busRoutes.map(r => {
        if (r.number === 'м96' && r.scheduleSecond.length < 25) {
          return { ...r, scheduleSecond: defaultRouteM96.scheduleSecond, scheduleFirst: defaultRouteM96.scheduleFirst };
        }
        if (r.number === 'с960' && r.scheduleSecond.length < 18) {
          return { ...r, scheduleSecond: defaultRouteC960.scheduleSecond, scheduleFirst: defaultRouteC960.scheduleFirst };
        }
        return r;
      });
    }

    return {
      ...defaultState,
      ...parsed,
      busStops,
      busRoutes,
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      scheduleFirst: parsed.scheduleFirst || defaultState.scheduleFirst,
      scheduleSecond: parsed.scheduleSecond || defaultState.scheduleSecond,
    };
  } catch {
    return defaultState;
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.error('Failed to save state');
  }
}

// ─── Time utilities ────────────────────────────────────────
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getCurrentTimeMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function getTodayWeekDay(): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return days[new Date().getDay()];
}

export function getNextBus(
  busRoute: BusRoute,
  lessonStartMinutes: number,  // когда начинается первая пара
  walkMinutes: number,
  bufferMinutes: number,
  travelMinutes: number,
  shift: ShiftType = 'first',
): {
  busTime: string;
  arrivalTime: string;         // расчётное время прибытия к колледжу
  departureTime: string;       // когда выйти из дома
  minutesUntilDeparture: number;
} | null {
  const schedule = shift === 'first' ? busRoute.scheduleFirst : busRoute.scheduleSecond;
  const nowMins = getCurrentTimeMinutes();

  // Самый ранний автобус, который мы успеваем поймать
  const minCatchableBus = nowMins + walkMinutes + bufferMinutes;
  // Самый поздний автобус, который довезёт вовремя
  const maxBusDeparture = lessonStartMinutes - travelMinutes;

  // Все автобусы в допустимом диапазоне
  const validBuses = schedule.filter(t => {
    const m = timeToMinutes(t);
    return m >= minCatchableBus && m <= maxBusDeparture;
  });

  if (validBuses.length === 0) return null;

  // Берём ПОСЛЕДНИЙ подходящий — максимум времени дома
  const busTime = validBuses[validBuses.length - 1];
  const busMins = timeToMinutes(busTime);
  const departMins = busMins - walkMinutes - bufferMinutes;

  return {
    busTime,
    arrivalTime: minutesToTime(busMins + travelMinutes),
    departureTime: minutesToTime(Math.max(departMins, nowMins)),
    minutesUntilDeparture: Math.max(0, departMins - nowMins),
  };
}

export function parseScheduleText(text: string): { startTime: string; endTime: string; subject: string; room?: string }[] {
  const lines = text.split('\n').filter(l => l.trim());
  const results: { startTime: string; endTime: string; subject: string; room?: string }[] = [];
  const timeRegex = /(\d{2}:\d{2})-(\d{2}:\d{2})\s+(.+)/;
  const roomRegex = /\(([^)]+)\)$/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const [, start, end, rest] = match;
      const roomMatch = rest.match(roomRegex);
      const room = roomMatch ? roomMatch[1] : undefined;
      const subject = rest.replace(roomRegex, '').trim();
      results.push({ startTime: start, endTime: end, subject, room });
    }
  }
  return results;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}

export function isOverdue(dueDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export function isDueToday(dueDate: string): boolean {
  return dueDate === new Date().toISOString().split('T')[0];
}

export function isDueTomorrow(dueDate: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dueDate === tomorrow.toISOString().split('T')[0];
}

export function getDaysUntilDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const defaultBusRoute = defaultRouteM96;
export { defaultBusStop, defaultRouteM96, defaultRouteC960, defaultBusRoute, defaultState };
export type { WeekDay };
