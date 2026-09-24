import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppState, WeekDay, Homework, DaySchedule, Lesson, BusRoute, BusStop, ShiftType } from './types';
import {
  loadState, saveState,
  timeToMinutes, getCurrentTimeMinutes, getTodayWeekDay,
  getNextBus, formatDate, isOverdue, isDueToday, isDueTomorrow, getDaysUntilDue,
  parseScheduleText, generateId, getActiveShift, getActiveSchedule,
  getISOWeekNumber, getAutoShift,
} from './store';
import TransportMap from './YandexMap';

// ============================================================
// Hooks
// ============================================================
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ============================================================
// Lesson Item
// ============================================================
interface LessonItemProps {
  lesson: Lesson;
  nowMins: number;
  homeworkForLesson: Homework[];
  onDelete?: () => void;
}

function LessonItemView({ lesson, nowMins, homeworkForLesson, onDelete }: LessonItemProps) {
  const start = timeToMinutes(lesson.startTime);
  const end = timeToMinutes(lesson.endTime);
  const isActive = nowMins >= start && nowMins < end;
  const isPast = nowMins >= end;

  return (
    <div className={`lesson-item ${isActive ? 'lesson-active' : ''} ${isPast ? 'lesson-past' : ''}`}>
      <div className="lesson-time-col">
        <span className="lesson-time">{lesson.startTime}</span>
        <span className="lesson-time-end">{lesson.endTime}</span>
      </div>
      <div className="lesson-divider" />
      <div className="lesson-info">
        <div className="lesson-subject" title={lesson.subject}>{lesson.subject}</div>
        <div className="lesson-meta">
          {lesson.room && <span className="lesson-room">🚪 {lesson.room}</span>}
          {isActive && <span className="chip chip-green" style={{ fontSize: '0.7rem' }}>● Сейчас</span>}
          {homeworkForLesson.length > 0 && (
            <span className="chip chip-yellow" style={{ fontSize: '0.7rem' }}>
              📚 {homeworkForLesson.length} д/з
            </span>
          )}
        </div>
      </div>
      {onDelete && (
        <button className="btn-icon" onClick={onDelete} title="Удалить">🗑️</button>
      )}
    </div>
  );
}

// ============================================================
// Shift Badge
// ============================================================
function ShiftBadge({ shift, auto, week }: { shift: ShiftType; auto: boolean; week: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className={`chip ${shift === 'first' ? 'chip-accent' : 'chip-yellow'}`}>
        {shift === 'first' ? '☀️ Первая смена' : '🌙 Вторая смена'}
      </span>
      <span className="chip chip-muted">{auto ? `Авто • ${week} нед.` : 'Ручной режим'}</span>
    </div>
  );
}

// ============================================================
// TODAY TAB
// ============================================================
interface TodayTabProps {
  state: AppState;
  onNavigate: (tab: AppState['activeTab']) => void;
}

function TodayTab({ state, onNavigate }: TodayTabProps) {
  const now = useClock();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todayKey = getTodayWeekDay() as WeekDay;

  const activeSchedule = getActiveSchedule(state);
  const todaySchedule = activeSchedule.find(d => d.day === todayKey);
  const lessons = todaySchedule?.lessons || [];
  const activeShift = getActiveShift(state);
  const week = getISOWeekNumber();

  const pendingHW = state.homework.filter(h => !h.completed);
  const overdueHW = pendingHW.filter(h => isOverdue(h.dueDate));
  const todayHW = pendingHW.filter(h => isDueToday(h.dueDate));
  const tomorrowHW = pendingHW.filter(h => isDueTomorrow(h.dueDate));

  const firstLesson = lessons.length > 0 ? lessons.reduce((a, b) =>
    timeToMinutes(a.startTime) < timeToMinutes(b.startTime) ? a : b
  ) : null;

  const nextBusInfo = firstLesson && state.busRoutes.length > 0
    ? getNextBus(
        state.busRoutes[0],
        timeToMinutes(firstLesson.startTime),
        state.settings.walkMinutesToStop,
        state.settings.bufferMinutes,
        state.settings.travelMinutes,
        activeShift,
      )
    : null;

  const hourOfDay = now.getHours();
  const greeting = hourOfDay < 12 ? 'Доброе утро' : hourOfDay < 17 ? 'Добрый день' : 'Добрый вечер';

  return (
    <div className="page fade-in">
      {/* Hero */}
      <div className="hero-card">
        <div className="hero-day">
          {now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <div className="hero-greeting">{greeting} 👋</div>
        <div className="hero-sub" style={{ marginBottom: 12 }}>
          {lessons.length === 0
            ? 'Сегодня занятий нет — можно отдохнуть!'
            : `${lessons.length} пар${lessons.length === 1 ? 'а' : lessons.length < 5 ? 'ы' : ''} сегодня`}
        </div>
        <ShiftBadge shift={activeShift} auto={state.settings.shiftAutoDetect} week={week} />
      </div>

      {/* Transport */}
      {lessons.length > 0 && (
        <div>
          <div className="section-header">
            <span className="section-title">🚌 Транспорт</span>
            <button className="btn btn-sm btn-ghost" onClick={() => onNavigate('transport')}>На карту →</button>
          </div>
          {nextBusInfo ? (
            <div className="card card-accent">
              <div className="transport-hero">
                <div className="bus-number">{state.busRoutes[0]?.number || '?'}</div>
                <div className="transport-info">
                  <div className="transport-depart-label">Выйти из дома</div>
                  <div className="transport-depart-time">{nextBusInfo.departureTime}</div>
                  <div className="transport-bus-time">
                    🚌 Автобус в {nextBusInfo.busTime}
                    {' · '}прибытие ~{nextBusInfo.arrivalTime}
                    {' · '}пара в {firstLesson?.startTime}
                  </div>
                </div>
                <div className="countdown-ring">
                  <div className={`countdown-value ${
                    nextBusInfo.minutesUntilDeparture <= 5 ? 'text-red'
                    : nextBusInfo.minutesUntilDeparture <= 15 ? 'text-yellow'
                    : 'text-green'
                  }`}>
                    {nextBusInfo.minutesUntilDeparture}
                  </div>
                  <div className="countdown-label">мин</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card card-yellow">
              <div className="flex items-center gap-8">
                <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Нет подходящего автобуса</div>
                  <div className="text-sm text-muted mt-4">Проверьте расписание транспорта</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's lessons */}
      {lessons.length > 0 && (
        <div>
          <div className="section-header">
            <span className="section-title">📚 Расписание на сегодня</span>
          </div>
          <div className="lesson-list">
            {[...lessons]
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
              .map(lesson => {
                const hw = state.homework.filter(
                  h => !h.completed && h.subject === lesson.subject &&
                    (isDueToday(h.dueDate) || isDueTomorrow(h.dueDate))
                );
                return (
                  <LessonItemView key={lesson.id} lesson={lesson} nowMins={nowMins} homeworkForLesson={hw} />
                );
              })}
          </div>
        </div>
      )}

      {/* Homework summary */}
      {(overdueHW.length > 0 || todayHW.length > 0 || tomorrowHW.length > 0) && (
        <div>
          <div className="section-header">
            <span className="section-title">📝 Домашние задания</span>
            <button className="btn btn-sm btn-ghost" onClick={() => onNavigate('homework')}>Все →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {overdueHW.slice(0, 2).map(hw => (
              <div key={hw.id} className="card card-red card-sm">
                <div className="flex items-center gap-8">
                  <span>🔴</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--red)' }}>{hw.subject} — просрочено!</div>
                    <div className="text-sm">{hw.description}</div>
                  </div>
                </div>
              </div>
            ))}
            {todayHW.slice(0, 2).map(hw => (
              <div key={hw.id} className="card card-yellow card-sm">
                <div className="flex items-center gap-8">
                  <span>🟡</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--yellow)' }}>{hw.subject} — сдать сегодня</div>
                    <div className="text-sm">{hw.description}</div>
                  </div>
                </div>
              </div>
            ))}
            {tomorrowHW.slice(0, 2).map(hw => (
              <div key={hw.id} className="card card-sm">
                <div className="flex items-center gap-8">
                  <span>📌</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{hw.subject} — завтра</div>
                    <div className="text-sm">{hw.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lessons.length === 0 && pendingHW.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <div className="empty-state-text">
            Сегодня нет занятий и домашних заданий!<br />
            Добавь расписание во вкладке «Расписание».
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCHEDULE TAB
// ============================================================
interface ScheduleTabProps {
  state: AppState;
  onUpdate: (scheduleFirst: DaySchedule[], scheduleSecond: DaySchedule[]) => void;
}

function ScheduleTab({ state, onUpdate }: ScheduleTabProps) {
  const activeShift = getActiveShift(state);
  const [editShift, setEditShift] = useState<ShiftType>(activeShift);
  const [selectedDay, setSelectedDay] = useState<WeekDay>('Пн');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parseDay, setParseDay] = useState<WeekDay>('Пн');
  const [newLesson, setNewLesson] = useState({ subject: '', startTime: '08:30', endTime: '09:15', room: '' });

  const days: WeekDay[] = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const currentScheduleSet = editShift === 'first' ? state.scheduleFirst : state.scheduleSecond;
  const currentDaySchedule = currentScheduleSet.find(d => d.day === selectedDay);
  const lessons = currentDaySchedule?.lessons || [];

  const patchSchedule = (updater: (s: DaySchedule[]) => DaySchedule[]) => {
    if (editShift === 'first') {
      onUpdate(updater(state.scheduleFirst), state.scheduleSecond);
    } else {
      onUpdate(state.scheduleFirst, updater(state.scheduleSecond));
    }
  };

  const handleAddLesson = () => {
    if (!newLesson.subject.trim()) return;
    patchSchedule(sched => sched.map(d =>
      d.day === selectedDay
        ? { ...d, lessons: [...d.lessons, { ...newLesson, id: generateId(), room: newLesson.room || undefined }] }
        : d
    ));
    setNewLesson({ subject: '', startTime: '08:30', endTime: '09:15', room: '' });
    setShowAddModal(false);
  };

  const handleDeleteLesson = (lessonId: string) => {
    patchSchedule(sched => sched.map(d =>
      d.day === selectedDay ? { ...d, lessons: d.lessons.filter(l => l.id !== lessonId) } : d
    ));
  };

  const handleParseSchedule = () => {
    const parsed = parseScheduleText(parseText);
    if (!parsed.length) return;
    const newLessons: Lesson[] = parsed.map(p => ({ ...p, id: generateId() }));
    patchSchedule(sched => sched.map(d =>
      d.day === parseDay ? { ...d, lessons: [...d.lessons, ...newLessons] } : d
    ));
    setParseText('');
    setShowParseModal(false);
  };

  const nowMins = getCurrentTimeMinutes();

  return (
    <div className="page fade-in">
      <div className="flex items-center justify-between">
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Расписание</h1>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowParseModal(true)}>📋 Вставить</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Добавить</button>
        </div>
      </div>

      {/* Shift selector */}
      <div className="card card-sm" style={{ padding: '12px 16px' }}>
        <div className="text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
          Редактировать смену
        </div>
        <div className="flex gap-8">
          {(['first', 'second'] as ShiftType[]).map(sh => (
            <button
              key={sh}
              id={`shift-tab-${sh}`}
              className={`day-tab ${editShift === sh ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setEditShift(sh)}
            >
              {sh === 'first' ? '☀️ Первая смена' : '🌙 Вторая смена'}
              {sh === activeShift && <span style={{ marginLeft: 4, opacity: 0.8, fontSize: '0.68rem' }}>← сейчас</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Day tabs */}
      <div className="day-tabs">
        {days.map(day => {
          const cnt = currentScheduleSet.find(d => d.day === day)?.lessons.length || 0;
          return (
            <button
              key={day}
              id={`day-tab-${editShift}-${day}`}
              className={`day-tab ${selectedDay === day ? 'active' : ''}`}
              onClick={() => setSelectedDay(day)}
            >
              {day}
              {cnt > 0 && <span style={{ marginLeft: 4, opacity: 0.7, fontSize: '0.72rem' }}>({cnt})</span>}
            </button>
          );
        })}
      </div>

      {/* Lessons */}
      {lessons.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <div className="empty-state-text">
            Нет занятий в {selectedDay}.<br />
            Нажмите «+ Добавить» или «📋 Вставить».
          </div>
        </div>
      ) : (
        <div className="lesson-list">
          {[...lessons]
            .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
            .map(lesson => (
              <LessonItemView
                key={lesson.id}
                lesson={lesson}
                nowMins={nowMins}
                homeworkForLesson={[]}
                onDelete={() => handleDeleteLesson(lesson.id)}
              />
            ))}
        </div>
      )}

      {/* Add lesson modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Добавить пару</span>
              <button className="btn-icon" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">День недели</label>
              <select id="add-lesson-day" className="form-select" value={selectedDay}
                onChange={e => setSelectedDay(e.target.value as WeekDay)}>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Предмет *</label>
              <input id="add-lesson-subject" className="form-input" placeholder="Название предмета"
                value={newLesson.subject} onChange={e => setNewLesson(p => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="flex gap-12">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Начало</label>
                <input id="add-lesson-start" type="time" className="form-input" value={newLesson.startTime}
                  onChange={e => setNewLesson(p => ({ ...p, startTime: e.target.value }))} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Конец</label>
                <input id="add-lesson-end" type="time" className="form-input" value={newLesson.endTime}
                  onChange={e => setNewLesson(p => ({ ...p, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Кабинет (необязательно)</label>
              <input id="add-lesson-room" className="form-input" placeholder="к406" value={newLesson.room}
                onChange={e => setNewLesson(p => ({ ...p, room: e.target.value }))} />
            </div>
            <div className="flex gap-8 mt-8">
              <button className="btn btn-ghost w-full" onClick={() => setShowAddModal(false)}>Отмена</button>
              <button className="btn btn-primary w-full" id="add-lesson-submit" onClick={handleAddLesson}>Добавить</button>
            </div>
          </div>
        </div>
      )}

      {/* Parse modal */}
      {showParseModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowParseModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Вставить расписание</span>
              <button className="btn-icon" onClick={() => setShowParseModal(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">День недели</label>
              <select id="parse-day-select" className="form-select" value={parseDay}
                onChange={e => setParseDay(e.target.value as WeekDay)}>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Текст расписания</label>
              <textarea id="parse-schedule-text" className="form-textarea"
                placeholder={'08:30-09:15 Название предмета (к406)\n09:15-10:00 Другой предмет'}
                value={parseText} onChange={e => setParseText(e.target.value)} style={{ minHeight: 160 }} />
            </div>
            <div className="text-sm text-muted mb-16">
              Формат: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>ЧЧ:ММ-ЧЧ:ММ Предмет (кабинет)</code>
            </div>
            <div className="flex gap-8">
              <button className="btn btn-ghost w-full" onClick={() => setShowParseModal(false)}>Отмена</button>
              <button className="btn btn-primary w-full" id="parse-schedule-submit" onClick={handleParseSchedule}>Импортировать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TRANSPORT TAB
// ============================================================
interface TransportTabProps {
  state: AppState;
  onUpdateRoutes: (routes: BusRoute[]) => void;
  onUpdateStops: (stops: BusStop[]) => void;
  onUpdateStopCoords: (stopId: string, coords: [number, number]) => void;
}

function TransportTab({ state, onUpdateRoutes, onUpdateStops, onUpdateStopCoords }: TransportTabProps) {
  const now = useClock();
  const activeShift = getActiveShift(state);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [showAddRoute, setShowAddRoute] = useState(false);
  const [showAddStop, setShowAddStop] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [newStop, setNewStop] = useState<{ name: string; walkMinutes: number; coordsStr: string }>({
    name: '',
    walkMinutes: 4,
    coordsStr: '',
  });
  const [newRoute, setNewRoute] = useState({
    number: '',
    stopId: state.busStops[0]?.id || '',
    direction: '',
    scheduleFirstText: '',
    scheduleSecondText: '',
  });

  const handleStartAddRoute = () => {
    setEditingRouteId(null);
    setNewRoute({
      number: '',
      stopId: state.busStops[0]?.id || '',
      direction: '',
      scheduleFirstText: '',
      scheduleSecondText: '',
    });
    setShowAddRoute(true);
  };

  const handleStartEditRoute = (route: BusRoute) => {
    setEditingRouteId(route.id);
    setNewRoute({
      number: route.number,
      stopId: route.stopId,
      direction: route.direction,
      scheduleFirstText: route.scheduleFirst.join('\n'),
      scheduleSecondText: route.scheduleSecond.join('\n'),
    });
    setShowAddRoute(true);
  };

  const parseScheduleTimes = (text: string) =>
    text.split(/[\n,;]/).map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t)).sort();

  const handleAddStop = () => {
    if (!newStop.name.trim()) return;
    let coords: [number, number] | undefined = undefined;
    if (newStop.coordsStr.trim()) {
      const parts = newStop.coordsStr.split(/[,;\s]+/).map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
      if (parts.length >= 2) {
        coords = [parts[0], parts[1]];
      }
    }
    const stop: BusStop = {
      id: generateId(),
      name: newStop.name.trim(),
      walkMinutes: newStop.walkMinutes,
      coords,
    };
    onUpdateStops([...state.busStops, stop]);
    setNewStop({ name: '', walkMinutes: 4, coordsStr: '' });
    setShowAddStop(false);
  };

  const fillTemplateRoute = (type: 'm96' | 's960' | 'interval15') => {
    if (type === 'm96') {
      setNewRoute(p => ({
        ...p,
        number: 'м96',
        direction: 'До метро Пражская / Чертановская',
        scheduleFirstText: '06:15\n06:25\n06:35\n06:45\n07:00\n07:10\n07:20\n07:30\n07:40\n07:50\n08:00\n08:10\n08:20\n08:30\n08:45\n09:00',
        scheduleSecondText: '11:45\n12:00\n12:12\n12:24\n12:36\n12:48\n13:00\n13:15\n13:30\n13:45\n14:00\n14:20\n14:40\n15:00',
      }));
    } else if (type === 's960') {
      setNewRoute(p => ({
        ...p,
        number: 'с960',
        direction: 'До метро Южная',
        scheduleFirstText: '06:30\n06:50\n07:10\n07:30\n07:50\n08:10\n08:30\n08:50\n09:15\n09:40\n10:10\n10:40\n11:15',
        scheduleSecondText: '11:45\n12:10\n12:35\n13:00\n13:25\n13:50\n14:15\n14:45\n15:15\n15:45\n16:15\n16:45',
      }));
    } else {
      setNewRoute(p => ({
        ...p,
        scheduleFirstText: '06:30\n06:45\n07:00\n07:15\n07:30\n07:45\n08:00\n08:15\n08:30\n08:45\n09:00\n09:15\n09:30',
        scheduleSecondText: '11:45\n12:00\n12:15\n12:30\n12:45\n13:00\n13:15\n13:30\n13:45\n14:00\n14:15\n14:30',
      }));
    }
  };

  const handleSaveRoute = () => {
    if (!newRoute.number.trim()) return;
    let sf = parseScheduleTimes(newRoute.scheduleFirstText);
    let ss = parseScheduleTimes(newRoute.scheduleSecondText);
    if (!sf.length && !ss.length) {
      sf = ['06:30', '07:00', '07:15', '07:30', '07:45', '08:00', '08:15', '08:30', '08:45', '09:00', '09:30', '10:00'];
      ss = ['11:30', '12:00', '12:15', '12:30', '12:45', '13:00', '13:15', '13:30', '13:45', '14:00', '14:30', '15:00'];
    }

    if (editingRouteId) {
      onUpdateRoutes(state.busRoutes.map(r => r.id === editingRouteId ? {
        ...r,
        number: newRoute.number.trim(),
        stopId: newRoute.stopId || state.busStops[0]?.id || '',
        direction: newRoute.direction.trim() || `Маршрут ${newRoute.number.trim()}`,
        scheduleFirst: sf,
        scheduleSecond: ss,
      } : r));
    } else {
      const route: BusRoute = {
        id: generateId(),
        number: newRoute.number.trim(),
        stopId: newRoute.stopId || state.busStops[0]?.id || '',
        direction: newRoute.direction.trim() || `Маршрут ${newRoute.number.trim()}`,
        scheduleFirst: sf,
        scheduleSecond: ss,
      };
      onUpdateRoutes([...state.busRoutes, route]);
    }
    setEditingRouteId(null);
    setNewRoute({ number: '', stopId: state.busStops[0]?.id || '', direction: '', scheduleFirstText: '', scheduleSecondText: '' });
    setShowAddRoute(false);
  };

  const getUpcoming = (route: BusRoute, count = 5) => {
    const sched = activeShift === 'first' ? route.scheduleFirst : route.scheduleSecond;
    return sched.filter(t => timeToMinutes(t) >= nowMins).slice(0, count);
  };

  return (
    <div className="page fade-in">
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Транспорт</h1>
        <div className="flex gap-8">
          <button
            className="btn btn-ghost btn-sm flex items-center gap-6"
            onClick={() => {
              setNewStop({ name: '', walkMinutes: 4, coordsStr: '' });
              setShowAddStop(true);
            }}
          >
            <span>🚏</span> + Остановка
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-6"
            onClick={handleStartAddRoute}
          >
            <span>🚌</span> + Маршрут
          </button>
        </div>
      </div>

      {/* Yandex Map */}
      <div>
        <div className="section-header">
          <span className="section-title">🗺️ Карта транспорта</span>
        </div>
        <TransportMap
          stops={state.busStops}
          routes={state.busRoutes}
          activeShift={activeShift}
          onStopCoordsUpdate={onUpdateStopCoords}
        />
      </div>

      {/* Routes */}
      <div>
        <div className="section-header">
          <span className="section-title">🚌 Маршруты</span>
          <span className={`chip ${activeShift === 'first' ? 'chip-accent' : 'chip-yellow'}`} style={{ fontSize: '0.72rem' }}>
            {activeShift === 'first' ? '☀️ Первая смена' : '🌙 Вторая смена'}
          </span>
        </div>
        {state.busRoutes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚌</div>
            <div className="empty-state-text">Нет маршрутов.<br />Нажмите «+ Маршрут».</div>
          </div>
        ) : (
          state.busRoutes.map(route => {
            const stop = state.busStops.find(s => s.id === route.stopId);
            const upcoming = getUpcoming(route);
            const activeSchedule = activeShift === 'first' ? route.scheduleFirst : route.scheduleSecond;
            return (
              <div key={route.id} className="card" style={{ marginBottom: 10 }}>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-12">
                    <div className="bus-number" style={{ width: 48, height: 48, fontSize: '1rem' }}>{route.number}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{route.direction || `Маршрут ${route.number}`}</div>
                      {stop && <div className="text-sm text-muted">🚏 {stop.name} · {stop.walkMinutes} мин</div>}
                      <div className="text-xs text-muted mt-4">
                        ☀️ {route.scheduleFirst.length} рейсов · 🌙 {route.scheduleSecond.length} рейсов
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <button className="btn-icon" onClick={() => handleStartEditRoute(route)} title="Редактировать расписание и смены">✏️</button>
                    <button className="btn-icon btn-danger" onClick={() => onUpdateRoutes(state.busRoutes.filter(r => r.id !== route.id))} title="Удалить маршрут">🗑️</button>
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Ближайшие рейсы ({activeShift === 'first' ? '1-я смена' : '2-я смена'})
                </div>
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  {activeSchedule.length === 0 ? (
                    <span className="text-sm text-muted">Расписание не задано для этой смены</span>
                  ) : upcoming.length === 0 ? (
                    <span className="text-sm text-muted">Рейсов сегодня больше нет</span>
                  ) : upcoming.map((t, i) => (
                    <span key={t} className={`chip ${i === 0 ? 'chip-green' : 'chip-muted'}`}
                      style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.88rem', padding: '5px 12px' }}>
                      {i === 0 && <span className="live-indicator" />}{t}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Stops */}
      {state.busStops.length > 0 && (
        <div>
          <div className="section-header"><span className="section-title">🚏 Остановки</span></div>
          {state.busStops.map(stop => (
            <div key={stop.id} className="card card-sm flex items-center justify-between" style={{ marginBottom: 8 }}>
              <div className="flex items-center gap-10">
                <div style={{ fontSize: '1.3rem' }}>🚏</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{stop.name}</div>
                  <div className="text-sm text-muted">
                    🚶 {stop.walkMinutes} мин пешком
                    {stop.coords && <span> · 📍 {stop.coords[0].toFixed(4)}, {stop.coords[1].toFixed(4)}</span>}
                  </div>
                </div>
              </div>
              <button className="btn-icon" onClick={() => {
                onUpdateStops(state.busStops.filter(s => s.id !== stop.id));
                onUpdateRoutes(state.busRoutes.filter(r => r.stopId !== stop.id));
              }} title="Удалить остановку">🗑️</button>
            </div>
          ))}
        </div>
      )}

      {/* Add stop modal */}
      {showAddStop && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddStop(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title flex items-center gap-8">
                <span>🚏</span> Добавить остановку
              </span>
              <button className="btn-icon" onClick={() => setShowAddStop(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Название остановки *</label>
              <input
                id="stop-name-input"
                className="form-input"
                placeholder="например: Улица Красного Маяка, 4"
                value={newStop.name}
                onChange={e => setNewStop(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Координаты (необязательно, можно отметить на карте)</label>
              <input
                id="stop-coords-input"
                className="form-input"
                placeholder="55.611639, 37.599741"
                value={newStop.coordsStr}
                onChange={e => setNewStop(p => ({ ...p, coordsStr: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Ходьба до остановки (мин)</label>
              <div className="stepper">
                <button className="btn-icon" onClick={() => setNewStop(p => ({ ...p, walkMinutes: Math.max(1, p.walkMinutes - 1) }))}>−</button>
                <span className="stepper-value">{newStop.walkMinutes}</span>
                <button className="btn-icon" onClick={() => setNewStop(p => ({ ...p, walkMinutes: p.walkMinutes + 1 }))}>+</button>
              </div>
            </div>
            <div className="flex gap-8 mt-12">
              <button className="btn btn-ghost w-full" onClick={() => setShowAddStop(false)}>Отмена</button>
              <button className="btn btn-primary w-full flex items-center justify-center gap-6" id="add-stop-submit" onClick={handleAddStop}>
                <span>🚏</span> Сохранить остановку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit route modal */}
      {showAddRoute && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddRoute(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title flex items-center gap-8">
                <span>🚌</span> {editingRouteId ? `Редактировать маршрут ${newRoute.number}` : 'Добавить маршрут'}
              </span>
              <button className="btn-icon" onClick={() => setShowAddRoute(false)}>✕</button>
            </div>

            {/* Quick Template Chips */}
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-muted mb-4">Быстрые шаблоны:</div>
              <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="chip chip-accent"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => fillTemplateRoute('m96')}
                >
                  ⚡ м96 (каждые ~8 мин)
                </button>
                <button
                  type="button"
                  className="chip chip-purple"
                  style={{ cursor: 'pointer', border: 'none', background: 'rgba(168,85,247,0.2)', color: '#c084fc' }}
                  onClick={() => fillTemplateRoute('s960')}
                >
                  ⚡ с960 (каждые ~20 мин)
                </button>
                <button
                  type="button"
                  className="chip chip-muted"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => fillTemplateRoute('interval15')}
                >
                  ⚡ Каждые 15 мин
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Номер маршрута *</label>
              <input id="route-number-input" className="form-input" placeholder="например: м96 или с960"
                value={newRoute.number} onChange={e => setNewRoute(p => ({ ...p, number: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Направление</label>
              <input id="route-direction-input" className="form-input" placeholder="До метро Пражская"
                value={newRoute.direction} onChange={e => setNewRoute(p => ({ ...p, direction: e.target.value }))} />
            </div>
            {state.busStops.length > 0 && (
              <div className="form-group">
                <label className="form-label">Остановка отправления</label>
                <select id="route-stop-select" className="form-select" value={newRoute.stopId}
                  onChange={e => setNewRoute(p => ({ ...p, stopId: e.target.value }))}>
                  {state.busStops.map(s => <option key={s.id} value={s.id}>🚏 {s.name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">☀️ Расписание 1-й смены (ЧЧ:ММ через Enter или запятую)</label>
              <textarea id="route-schedule-first-input" className="form-textarea"
                placeholder={'07:00\n07:15\n07:30\n07:45\n08:00\n08:15'}
                style={{ minHeight: 80 }}
                value={newRoute.scheduleFirstText}
                onChange={e => setNewRoute(p => ({ ...p, scheduleFirstText: e.target.value }))} />
            </div>
            <div className="form-group">
              <div className="flex items-center justify-between mb-4">
                <label className="form-label" style={{ marginBottom: 0 }}>🌙 Расписание 2-й смены (ЧЧ:ММ через Enter)</label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.72rem', padding: '2px 8px', height: 'auto', background: 'rgba(255,255,255,0.06)' }}
                  onClick={() => {
                    if (newRoute.scheduleFirstText.trim()) {
                      // Shift 1st shift times by +5 hours into 2nd shift
                      const shifted = newRoute.scheduleFirstText
                        .split(/[\n,;]/)
                        .map(t => t.trim())
                        .filter(t => /^\d{2}:\d{2}$/.test(t))
                        .map(t => {
                          const [h, m] = t.split(':').map(Number);
                          const newH = (h + 5) % 24;
                          return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        })
                        .sort()
                        .join('\n');
                      setNewRoute(p => ({ ...p, scheduleSecondText: shifted }));
                    } else {
                      setNewRoute(p => ({
                        ...p,
                        scheduleSecondText: '11:45\n12:00\n12:15\n12:30\n12:45\n13:00\n13:15\n13:30\n13:45\n14:00\n14:20\n14:40\n15:00',
                      }));
                    }
                  }}
                  title="Автоматически сформировать вторую смену со сдвигом"
                >
                  ⚡ Скопировать / Сдвинуть во 2-ю
                </button>
              </div>
              <textarea id="route-schedule-second-input" className="form-textarea"
                placeholder={'12:00\n12:15\n12:30\n12:45\n13:00\n13:15'}
                style={{ minHeight: 80 }}
                value={newRoute.scheduleSecondText}
                onChange={e => setNewRoute(p => ({ ...p, scheduleSecondText: e.target.value }))} />
            </div>
            <div className="flex gap-8 mt-12">
              <button className="btn btn-ghost w-full" onClick={() => setShowAddRoute(false)}>Отмена</button>
              <button className="btn btn-primary w-full flex items-center justify-center gap-6" id="add-route-submit" onClick={handleSaveRoute}>
                <span>💾</span> {editingRouteId ? 'Сохранить изменения' : 'Добавить маршрут'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// HOMEWORK TAB
// ============================================================
interface HomeworkTabProps {
  state: AppState;
  onUpdate: (homework: Homework[]) => void;
}

function HomeworkTab({ state, onUpdate }: HomeworkTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const allSubjects = [...new Set([
    ...state.scheduleFirst.flatMap(d => d.lessons.map(l => l.subject)),
    ...state.scheduleSecond.flatMap(d => d.lessons.map(l => l.subject)),
  ])].filter(Boolean);

  const todayStr = new Date().toISOString().split('T')[0];
  const [newHW, setNewHW] = useState({ subject: allSubjects[0] || '', description: '', dueDate: todayStr });

  const handleAdd = () => {
    if (!newHW.description.trim() || !newHW.subject.trim()) return;
    const hw: Homework = { id: generateId(), ...newHW, completed: false, createdAt: new Date().toISOString() };
    onUpdate([...state.homework, hw]);
    setNewHW({ subject: allSubjects[0] || '', description: '', dueDate: todayStr });
    setShowAdd(false);
  };

  const toggleDone = (id: string) => onUpdate(state.homework.map(h => h.id === id ? { ...h, completed: !h.completed } : h));
  const deleteHW = (id: string) => onUpdate(state.homework.filter(h => h.id !== id));

  const filtered = state.homework.filter(h => {
    if (filter === 'pending') return !h.completed;
    if (filter === 'done') return h.completed;
    return true;
  }).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const pendingCount = state.homework.filter(h => !h.completed).length;
  const overdueCount = state.homework.filter(h => !h.completed && isOverdue(h.dueDate)).length;

  return (
    <div className="page fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Домашние задания</h1>
          {overdueCount > 0 && <div className="text-sm" style={{ color: 'var(--red)', marginTop: 2 }}>⚠️ {overdueCount} просроченных</div>}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Добавить</button>
      </div>

      <div className="flex gap-8">
        {([['all', 'Все'], ['pending', `Активные${pendingCount > 0 ? ` (${pendingCount})` : ''}`], ['done', 'Выполненные']] as const).map(([val, label]) => (
          <button key={val} id={`hw-filter-${val}`} className={`day-tab ${filter === val ? 'active' : ''}`}
            onClick={() => setFilter(val)} style={{ fontSize: '0.8rem' }}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-text">
            {filter === 'done' ? 'Нет выполненных заданий' : filter === 'pending' ? 'Все задания выполнены! 🎉' : 'Нет домашних заданий'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(hw => {
            const days = getDaysUntilDue(hw.dueDate);
            const overdue = isOverdue(hw.dueDate) && !hw.completed;
            const dueToday = isDueToday(hw.dueDate) && !hw.completed;
            const dueTomorrow = isDueTomorrow(hw.dueDate) && !hw.completed;
            return (
              <div key={hw.id} className={`hw-item ${hw.completed ? 'hw-done' : ''}`}>
                <button id={`hw-check-${hw.id}`} className={`hw-check ${hw.completed ? 'checked' : ''}`}
                  onClick={() => toggleDone(hw.id)} title="Отметить выполненным">
                  {hw.completed && <span style={{ color: 'white', fontSize: 13 }}>✓</span>}
                </button>
                <div className="hw-content">
                  <div className="hw-subject">{hw.subject}</div>
                  <div className={`hw-desc ${hw.completed ? 'strike' : ''}`}>{hw.description}</div>
                  <div className="hw-meta">
                    {overdue && <span className="chip chip-red">🔴 Просрочено!</span>}
                    {dueToday && <span className="chip chip-yellow">🟡 Сегодня</span>}
                    {dueTomorrow && <span className="chip chip-accent">📌 Завтра</span>}
                    {!overdue && !dueToday && !dueTomorrow && !hw.completed && (
                      <span className="chip chip-muted">{days > 0 ? `через ${days} дн.` : 'сегодня'}</span>
                    )}
                    <span className="chip chip-muted" style={{ fontSize: '0.7rem' }}>{formatDate(hw.dueDate)}</span>
                  </div>
                </div>
                <button className="btn-icon" onClick={() => deleteHW(hw.id)}>🗑️</button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Новое задание</span>
              <button className="btn-icon" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Предмет *</label>
              {allSubjects.length > 0 ? (
                <select id="hw-subject-select" className="form-select" value={newHW.subject}
                  onChange={e => setNewHW(p => ({ ...p, subject: e.target.value }))}>
                  {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="">Другой предмет...</option>
                </select>
              ) : (
                <input id="hw-subject-input" className="form-input" placeholder="Название предмета"
                  value={newHW.subject} onChange={e => setNewHW(p => ({ ...p, subject: e.target.value }))} />
              )}
              {newHW.subject === '' && (
                <input className="form-input mt-8" placeholder="Введите предмет"
                  onChange={e => setNewHW(p => ({ ...p, subject: e.target.value }))} />
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Задание *</label>
              <textarea id="hw-description-input" className="form-textarea" placeholder="Что нужно сделать?"
                value={newHW.description} onChange={e => setNewHW(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Срок сдачи</label>
              <input id="hw-due-date-input" type="date" className="form-input" value={newHW.dueDate} min={todayStr}
                onChange={e => setNewHW(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
            <div className="flex gap-8 mt-8">
              <button className="btn btn-ghost w-full" onClick={() => setShowAdd(false)}>Отмена</button>
              <button className="btn btn-primary w-full" id="add-hw-submit" onClick={handleAdd}>Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// Notification helper supporting ServiceWorker and mobile PWA
async function sendAppNotification(title: string, options?: NotificationOptions) {
  const mergedOptions: NotificationOptions = {
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    ...options,
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, mergedOptions);
        return;
      }
    }
  } catch (e) {
    console.warn('ServiceWorker showNotification failed:', e);
  }

  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, mergedOptions);
    }
  } catch (e) {
    console.warn('Fallback Notification failed:', e);
  }
}

// ============================================================
interface SettingsTabProps {
  state: AppState;
  onUpdate: (state: AppState) => void;
}

function SettingsTab({ state, onUpdate }: SettingsTabProps) {
  const week = getISOWeekNumber();
  const autoShift = getAutoShift(state.settings.firstShiftIsOddWeek);

  const set = (patch: Partial<AppState['settings']>) =>
    onUpdate({ ...state, settings: { ...state.settings, ...patch } });

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );

  const requestNotifications = async () => {
    // On iOS Safari browser tab, Apple restricts Notification API to Home Screen Web Apps
    if (isIOS && !isStandalone) {
      alert(
        '🍎 На iPhone и iPad уведомления работают только при установке приложения на экран «Домой»:\n\n' +
        '1. Нажмите кнопку «Поделиться» (квадрат со стрелкой вверх внизу экрана Safari).\n' +
        '2. Выберите пункт «На экран «Домой»».\n' +
        '3. Откройте приложение с экрана и включите уведомления здесь.'
      );
      return;
    }

    if (!('Notification' in window)) {
      alert('Ваш браузер или устройство не поддерживает веб-уведомления.');
      return;
    }

    if (Notification.permission === 'denied') {
      alert(
        '⚠️ Уведомления заблокированы в настройках браузера.\n\n' +
        'Чтобы их включить:\n' +
        '1. Нажмите на значок настроек сайта в адресной строке.\n' +
        '2. Разрешите «Уведомления».\n' +
        '3. Перезагрузите страницу.'
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        set({ notificationsEnabled: true });
        await sendAppNotification('Assistant', {
          body: '🔔 Уведомления успешно включены!',
          icon: '/pwa-192x192.png',
        });
      } else {
        set({ notificationsEnabled: false });
        if (permission === 'denied') {
          alert('Разрешение на уведомления было отклонено в диалоговом окне.');
        }
      }
    } catch (err) {
      console.error('requestPermission error:', err);
      alert('Не удалось запросить разрешение на уведомления.');
    }
  };

  const handleResetAll = () => {
    if (window.confirm('Удалить все данные? Необратимо.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="page fade-in">
      <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Настройки</h1>

      {/* Shift settings */}
      <div className="card">
        <div className="section-title mb-8">📅 Смены</div>
        <div className="settings-row">
          <div className="settings-info">
            <div className="settings-label">Автоопределение смены</div>
            <div className="settings-desc">
              По номеру недели. Сейчас {week} неделя → <strong>{autoShift === 'first' ? 'первая смена ☀️' : 'вторая смена 🌙'}</strong>
            </div>
          </div>
          <label className="toggle">
            <input id="shift-auto-toggle" type="checkbox" checked={state.settings.shiftAutoDetect}
              onChange={() => set({ shiftAutoDetect: !state.settings.shiftAutoDetect })} />
            <span className="toggle-slider" />
          </label>
        </div>

        {state.settings.shiftAutoDetect && (
          <div className="settings-row">
            <div className="settings-info">
              <div className="settings-label">Нечётная неделя = первая смена</div>
              <div className="settings-desc">Включено: нечёт. → первая, чёт. → вторая</div>
            </div>
            <label className="toggle">
              <input id="odd-week-toggle" type="checkbox" checked={state.settings.firstShiftIsOddWeek}
                onChange={() => set({ firstShiftIsOddWeek: !state.settings.firstShiftIsOddWeek })} />
              <span className="toggle-slider" />
            </label>
          </div>
        )}

        {!state.settings.shiftAutoDetect && (
          <div className="settings-row">
            <div className="settings-info">
              <div className="settings-label">Текущая смена</div>
              <div className="settings-desc">Выбрать вручную</div>
            </div>
            <div className="flex gap-8">
              {(['first', 'second'] as ShiftType[]).map(sh => (
                <button key={sh} id={`manual-shift-${sh}`}
                  className={`day-tab ${state.settings.currentShift === sh ? 'active' : ''}`}
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={() => set({ currentShift: sh })}>
                  {sh === 'first' ? '☀️ 1-я' : '🌙 2-я'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="card">
        <div className="section-title mb-8">🚶 Транспорт</div>
        <div className="settings-row">
          <div className="settings-info">
            <div className="settings-label">Ходьба до остановки</div>
            <div className="settings-desc">Минут пешком</div>
          </div>
          <div className="stepper">
            <button id="walk-minus" className="btn-icon" onClick={() => set({ walkMinutesToStop: Math.max(1, state.settings.walkMinutesToStop - 1) })}>−</button>
            <span className="stepper-value">{state.settings.walkMinutesToStop} мин</span>
            <button id="walk-plus" className="btn-icon" onClick={() => set({ walkMinutesToStop: state.settings.walkMinutesToStop + 1 })}>+</button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <div className="settings-label">Время в пути на автобусе</div>
            <div className="settings-desc">От остановки до колледжа</div>
          </div>
          <div className="stepper">
            <button id="travel-minus" className="btn-icon" onClick={() => set({ travelMinutes: Math.max(5, state.settings.travelMinutes - 1) })}>−</button>
            <span className="stepper-value">{state.settings.travelMinutes} мин</span>
            <button id="travel-plus" className="btn-icon" onClick={() => set({ travelMinutes: state.settings.travelMinutes + 1 })}>+</button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-info">
            <div className="settings-label">Запас времени на остановке</div>
            <div className="settings-desc">Буфер перед автобусом</div>
          </div>
          <div className="stepper">
            <button id="buffer-minus" className="btn-icon" onClick={() => set({ bufferMinutes: Math.max(0, state.settings.bufferMinutes - 1) })}>−</button>
            <span className="stepper-value">{state.settings.bufferMinutes} мин</span>
            <button id="buffer-plus" className="btn-icon" onClick={() => set({ bufferMinutes: state.settings.bufferMinutes + 1 })}>+</button>
          </div>
        </div>
        <div className="text-xs text-muted mt-8" style={{ lineHeight: 1.6, padding: '8px 0 0' }}>
          💡 Выход = время автобуса − {state.settings.walkMinutesToStop} мин (ходьба) − {state.settings.bufferMinutes} мин (запас)<br/>
          Автобус выбирается последний, который успевает привезти к паре за {state.settings.travelMinutes} мин пути.
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="section-title mb-8">🔔 Уведомления</div>
        <div className="settings-row">
          <div className="settings-info">
            <div className="settings-label">Push-уведомления</div>
            <div className="settings-desc">
              {state.settings.notificationsEnabled ? '✅ Включены (напоминание перед выходом)' : 'Напоминание о выходе'}
            </div>
            {isIOS && !isStandalone && (
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#f59e0b', lineHeight: 1.4 }}>
                📱 <b>На iPhone:</b> добавьте сайт на экран «Домой» (через кнопку «Поделиться»), чтобы активировать уведомления.
              </div>
            )}
          </div>
          <label className="toggle">
            <input
              id="notifications-toggle"
              type="checkbox"
              checked={state.settings.notificationsEnabled}
              onChange={() => state.settings.notificationsEnabled ? set({ notificationsEnabled: false }) : requestNotifications()}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="section-title mb-8">ℹ️ О приложении</div>
        <div className="text-sm text-secondary" style={{ lineHeight: 1.8 }}>
          <strong>Assistant</strong> — умный помощник студента.<br />
          Данные хранятся локально в браузере.<br />
          Версия: 2.0.0
        </div>
      </div>

      <button id="reset-all-btn" className="btn btn-danger w-full" onClick={handleResetAll} style={{ marginTop: 4 }}>
        🗑️ Сбросить все данные
      </button>
    </div>
  );
}

// ============================================================
// LIVE CLOCK
// ============================================================
function LiveClock() {
  const now = useClock();
  const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="header-time">
      <span style={{ textTransform: 'capitalize' }}>{dateStr}</span>
      {' · '}
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{timeStr}</strong>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((next: Partial<AppState> | ((prev: AppState) => AppState)) => {
    setState(prev => {
      const newState = typeof next === 'function' ? next(prev) : { ...prev, ...next };
      saveState(newState);
      return newState;
    });
  }, []);

  // Notification scheduler
  useEffect(() => {
    if (!state.settings.notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const todayKey = getTodayWeekDay() as WeekDay;
    const activeSchedule = getActiveSchedule(state);
    const lessons = activeSchedule.find(d => d.day === todayKey)?.lessons || [];
    if (!lessons.length || !state.busRoutes.length) return;

    const firstLesson = lessons.reduce((a, b) =>
      timeToMinutes(a.startTime) < timeToMinutes(b.startTime) ? a : b
    );
    const activeShift = getActiveShift(state);
    const busInfo = getNextBus(
      state.busRoutes[0],
      timeToMinutes(firstLesson.startTime),
      state.settings.walkMinutesToStop,
      state.settings.bufferMinutes,
      state.settings.travelMinutes,
      activeShift,
    );
    if (!busInfo) return;

    const nowMins = getCurrentTimeMinutes();
    const depMins = timeToMinutes(busInfo.departureTime);
    const notifMins = depMins - 10;
    const msUntil = (notifMins - nowMins) * 60 * 1000;

    if (msUntil > 0 && msUntil < 4 * 60 * 60 * 1000) {
      notifTimerRef.current = setTimeout(() => {
        sendAppNotification('🚌 Пора выходить!', {
          body: `Выйди в ${busInfo.departureTime} — автобус ${state.busRoutes[0].number} в ${busInfo.busTime}`,
          icon: '/pwa-192x192.png',
        });
      }, msUntil);
    }
    return () => { if (notifTimerRef.current) clearTimeout(notifTimerRef.current); };
  }, [state.settings, state.scheduleFirst, state.scheduleSecond, state.busRoutes]);

  const tabs = [
    { id: 'today' as const, icon: '🏠', label: 'Главная' },
    { id: 'schedule' as const, icon: '📅', label: 'Расписание' },
    { id: 'transport' as const, icon: '🚌', label: 'Транспорт' },
    { id: 'homework' as const, icon: '📝', label: 'Домашка' },
    { id: 'settings' as const, icon: '⚙️', label: 'Настройки' },
  ];

  const pendingHW = state.homework.filter(h => !h.completed).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🎓</div>
          <span>Assistant</span>
        </div>
        <LiveClock />
      </header>

      <main className="app-content">
        {state.activeTab === 'today' && (
          <TodayTab state={state} onNavigate={tab => update({ activeTab: tab })} />
        )}
        {state.activeTab === 'schedule' && (
          <ScheduleTab state={state}
            onUpdate={(sf, ss) => update({ scheduleFirst: sf, scheduleSecond: ss })} />
        )}
        {state.activeTab === 'transport' && (
          <TransportTab state={state}
            onUpdateRoutes={busRoutes => update({ busRoutes })}
            onUpdateStops={busStops => update({ busStops })}
            onUpdateStopCoords={(stopId, coords) =>
              update(prev => ({
                ...prev,
                busStops: prev.busStops.map(s => s.id === stopId ? { ...s, coords } : s),
              }))
            }
          />
        )}
        {state.activeTab === 'homework' && (
          <HomeworkTab state={state} onUpdate={homework => update({ homework })} />
        )}
        {state.activeTab === 'settings' && (
          <SettingsTab state={state} onUpdate={s => update(s)} />
        )}
      </main>

      <nav className="bottom-nav" role="navigation" aria-label="Основная навигация">
        {tabs.map(tab => (
          <button key={tab.id} id={`nav-${tab.id}`}
            className={`nav-btn ${state.activeTab === tab.id ? 'active' : ''}`}
            onClick={() => update({ activeTab: tab.id })} aria-label={tab.label}>
            <span className="nav-icon">{tab.icon}</span>
            {tab.label}
            {tab.id === 'homework' && pendingHW > 0 && (
              <span className="nav-badge">{pendingHW}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
