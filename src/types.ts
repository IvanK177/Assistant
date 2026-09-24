export type WeekDay = 'Пн' | 'Вт' | 'Ср' | 'Чт' | 'Пт' | 'Сб';
export type ShiftType = 'first' | 'second';

export interface Lesson {
  id: string;
  subject: string;
  startTime: string; // "08:30"
  endTime: string;   // "09:15"
  room?: string;
  teacher?: string;
}

export interface DaySchedule {
  day: WeekDay;
  lessons: Lesson[];
}

export interface BusStop {
  id: string;
  name: string;
  walkMinutes: number;
  coords?: [number, number]; // [lat, lon] for Yandex Maps
}

export interface BusRoute {
  id: string;
  number: string;
  stopId: string;
  direction: string;
  scheduleFirst: string[];  // расписание для первой смены
  scheduleSecond: string[]; // расписание для второй смены
}

export interface Homework {
  id: string;
  subject: string;
  description: string;
  dueDate: string; // ISO date string "2024-01-15"
  dueLesson?: string;
  completed: boolean;
  createdAt: string;
}

export interface AppSettings {
  walkMinutesToStop: number;
  bufferMinutes: number;
  travelMinutes: number;    // время в пути на автобусе
  notificationsEnabled: boolean;
  // Shift settings
  currentShift: ShiftType;
  shiftAutoDetect: boolean;
  firstShiftIsOddWeek: boolean;
}

export interface AppState {
  scheduleFirst: DaySchedule[];  // первая смена
  scheduleSecond: DaySchedule[]; // вторая смена
  busRoutes: BusRoute[];
  busStops: BusStop[];
  homework: Homework[];
  settings: AppSettings;
  activeTab: 'today' | 'schedule' | 'transport' | 'homework' | 'settings';
}
