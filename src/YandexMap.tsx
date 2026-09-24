import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { BusStop, BusRoute } from './types';

// Fix Leaflet default icon paths
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Corridor along Ulitsa Krasnogo Mayaka strictly following the street road lanes
const KRASNOGO_MAYAKA_CORRIDOR: [number, number][] = [
  [55.61217, 37.59512], // ул. Красного Маяка (запад)
  [55.61199, 37.59650], // ул. Красного Маяка, 6
  [55.61174, 37.59843], // приближение к остановке
  [55.611639, 37.599741], // Остановка «Улица Красного Маяка, 4»
  [55.61148, 37.60033], // отъезд от остановки
  [55.61134, 37.60121], // ул. Красного Маяка, 2
  [55.61115, 37.60287], // перекресток
  [55.61083, 37.60499], // к метро «Пражская»
];

// Helper to interpolate between waypoints
function interpolatePath(points: [number, number][], progress: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const totalSegments = points.length - 1;
  const scaled = clamped * totalSegments;
  const index = Math.min(Math.floor(scaled), totalSegments - 1);
  const frac = scaled - index;

  const [lat1, lon1] = points[index];
  const [lat2, lon2] = points[index + 1];
  return [lat1 + (lat2 - lat1) * frac, lon1 + (lon2 - lon1) * frac];
}

// Custom icons without default Leaflet white box
function createStopIcon(name: string) {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="stop-marker-pin" title="${name}">
        <div class="stop-marker-ring"></div>
        🚏
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -22],
  });
}

function createBusIcon(number: string, colorClass: string, etaMin: number, nextDep: string) {
  const etaText = etaMin <= 1 ? 'Подъезжает' : `${etaMin} мин`;
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `
      <div class="bus-marker-badge ${colorClass}" title="Автобус ${number} — рейс ${nextDep} (${etaText})">
        <span class="bus-pulse-dot"></span>
        <span>🚌 ${number}</span>
        <span style="opacity:0.9;font-weight:600;font-size:10px;background:rgba(0,0,0,0.25);padding:1px 5px;border-radius:4px;">${etaText}</span>
      </div>
    `,
    iconSize: [96, 26],
    iconAnchor: [48, 13],
    popupAnchor: [0, -16],
  });
}

interface LeafletMapProps {
  stops: BusStop[];
  routes?: BusRoute[];
  selectedStopId: string;
  onStopCoordsUpdate: (stopId: string, coords: [number, number]) => void;
  busArrivals: {
    number: string;
    direction: string;
    nextDeparture: string;
    etaMinutes: number;
    colorClass: string;
    currentCoords: [number, number];
    isTomorrow?: boolean;
    shiftLabel?: string;
  }[];
}

function LeafletMap({ stops, selectedStopId, onStopCoordsUpdate, busArrivals }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const busMarkersRef = useRef<Record<string, L.Marker>>({});
  const polylineRef = useRef<L.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const selectedStop = stops.find(s => s.id === selectedStopId);
    const firstWithCoords = stops.find(s => s.coords);
    const center: [number, number] = selectedStop?.coords ?? firstWithCoords?.coords ?? [55.611639, 37.599741];

    const map = L.map(containerRef.current, { center, zoom: 15, zoomControl: true });
    mapRef.current = map;

    // CartoDB / OSM clean tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Click handler to position / move stop
    map.on('click', (e: L.LeafletMouseEvent) => {
      const sid = (map as L.Map & { _selectedStop?: string })._selectedStop;
      if (!sid) return;
      const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
      onStopCoordsUpdate(sid, coords);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
      busMarkersRef.current = {};
      polylineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update selectedStop on map reference
  useEffect(() => {
    if (!mapRef.current) return;
    (mapRef.current as L.Map & { _selectedStop?: string })._selectedStop = selectedStopId;
    mapRef.current.getContainer().style.cursor = selectedStopId ? 'crosshair' : 'grab';
  }, [selectedStopId]);

  // Sync Stop Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove obsolete markers
    Object.keys(markersRef.current).forEach(id => {
      if (!stops.some(s => s.id === id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Add or update markers
    stops.forEach(stop => {
      if (!stop.coords) {
        if (markersRef.current[stop.id]) {
          markersRef.current[stop.id].remove();
          delete markersRef.current[stop.id];
        }
        return;
      }

      const existing = markersRef.current[stop.id];
      if (existing) {
        existing.setLatLng(stop.coords);
        existing.setIcon(createStopIcon(stop.name));
        existing.setPopupContent(`<b>🚏 ${stop.name}</b><br>🚶 ${stop.walkMinutes} мин пешком<br><span style="font-size:0.75rem;color:#818cf8;">Перетащите для смены точки</span>`);
      } else {
        const marker = L.marker(stop.coords, {
          icon: createStopIcon(stop.name),
          draggable: true,
        }).addTo(map);

        marker.bindPopup(`<b>🚏 ${stop.name}</b><br>🚶 ${stop.walkMinutes} мин пешком<br><span style="font-size:0.75rem;color:#818cf8;">Перетащите для смены точки</span>`);
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLatLng();
          onStopCoordsUpdate(stop.id, [lat, lng]);
        });
        markersRef.current[stop.id] = marker;
      }
    });

    // Render transit line corridor along the street
    const activeWithCoords = stops.find(s => s.id === selectedStopId && s.coords) || stops.find(s => s.coords);
    if (activeWithCoords && activeWithCoords.coords) {
      const isKrasnogoMayaka = Math.abs(activeWithCoords.coords[0] - 55.6116) < 0.02 && Math.abs(activeWithCoords.coords[1] - 37.5997) < 0.02;
      if (isKrasnogoMayaka) {
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(KRASNOGO_MAYAKA_CORRIDOR);
        } else {
          polylineRef.current = L.polyline(KRASNOGO_MAYAKA_CORRIDOR, {
            color: '#3b82f6',
            weight: 5,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
    }
  }, [stops, selectedStopId, onStopCoordsUpdate]);

  // Sync Animated Live Buses
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busArrivals.forEach(bus => {
      const existing = busMarkersRef.current[bus.number];
      const icon = createBusIcon(bus.number, bus.colorClass, bus.etaMinutes, bus.nextDeparture);
      const isApproaching = bus.etaMinutes <= 1;
      const statusText = isApproaching
        ? '🟢 Подъезжает к остановке'
        : `⏱ Прибытие через ~${bus.etaMinutes} мин`;
      const depLabel = bus.isTomorrow ? `Завтра в ${bus.nextDeparture}` : `Рейс ${bus.nextDeparture}`;

      const popupHtml = `
        <div style="font-size:0.85rem;line-height:1.4;">
          <b style="font-size:0.95rem;">🚌 Автобус ${bus.number}</b><br>
          <span style="color:#9da3c8;">${bus.direction}</span><br>
          <div style="margin-top:6px;font-size:0.8rem;color:#cbd5e1;background:rgba(255,255,255,0.06);padding:4px 8px;border-radius:6px;">
            📅 По расписанию: <b style="color:#fff;">${depLabel}</b> (${bus.shiftLabel})
          </div>
          <div style="margin-top:6px;font-weight:700;color:${bus.etaMinutes <= 2 ? '#22c55e' : '#6366f1'};">
            ${statusText}
          </div>
        </div>
      `;

      if (existing) {
        existing.setLatLng(bus.currentCoords);
        existing.setIcon(icon);
        existing.setPopupContent(popupHtml);
      } else {
        const marker = L.marker(bus.currentCoords, { icon }).addTo(map);
        marker.bindPopup(popupHtml);
        busMarkersRef.current[bus.number] = marker;
      }
    });
  }, [busArrivals]);

  return (
    <div
      ref={containerRef}
      id="leaflet-map-container"
      style={{
        width: '100%',
        height: 350,
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    />
  );
}

// ─── Public Component ─────────────────────────────────────
interface TransportMapProps {
  stops: BusStop[];
  routes?: BusRoute[];
  activeShift?: 'first' | 'second';
  onStopCoordsUpdate: (stopId: string, coords: [number, number]) => void;
}

export default function TransportMap({
  stops,
  routes = [],
  activeShift = 'first',
  onStopCoordsUpdate,
}: TransportMapProps) {
  const [selectedStopId, setSelectedStopId] = useState(stops[0]?.id ?? '');
  const [clockTick, setClockTick] = useState(0);

  // Update clock tick every second for real-time countdown
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => (t + 1) % 86400), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute live bus positions directly from the actual configured schedule!
  const busArrivals = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentSeconds = now.getSeconds();
    const stopProgress = 3 / (KRASNOGO_MAYAKA_CORRIDOR.length - 1); // index 3 ~ 0.428

    // Relevant routes for this stop
    const relevantRoutes = routes.filter(r => !selectedStopId || r.stopId === selectedStopId);
    const activeRouteList = relevantRoutes.length > 0 ? relevantRoutes : routes;

    // Fallback if no routes defined
    if (activeRouteList.length === 0) {
      return [
        {
          number: 'м96',
          direction: 'До метро Пражская',
          nextDeparture: '23:30',
          etaMinutes: 5,
          colorClass: 'bus-marker-m96',
          currentCoords: KRASNOGO_MAYAKA_CORRIDOR[2],
          isTomorrow: false,
          shiftLabel: 'По расписанию',
        },
      ];
    }

    return activeRouteList.map((route, idx) => {
      const isSecondShift = activeShift === 'second';
      let sched = isSecondShift ? route.scheduleSecond : route.scheduleFirst;
      let shiftLabel = isSecondShift ? '2 смена' : '1 смена';

      // Fallback to other shift if current is empty
      if (!sched || sched.length === 0) {
        sched = isSecondShift ? route.scheduleFirst : route.scheduleSecond;
        shiftLabel = isSecondShift ? '1 смена' : '2 смена';
      }

      const sorted = [...(sched || [])].sort();
      let nextDeparture = '--:--';
      let etaMinutes = 99;
      let isTomorrow = false;

      if (sorted.length > 0) {
        const found = sorted.find(t => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m >= currentMinutes;
        });

        if (found) {
          nextDeparture = found;
        } else {
          nextDeparture = sorted[0];
          isTomorrow = true;
        }

        const [h, m] = nextDeparture.split(':').map(Number);
        const tripMin = h * 60 + m;
        let diffMin = tripMin - currentMinutes;
        if (isTomorrow) {
          diffMin += 24 * 60;
        }
        const diffSec = diffMin * 60 - currentSeconds;
        etaMinutes = Math.max(0, Math.ceil(diffSec / 60));
      }

      // Calculate corridor coordinate along Ulitsa Krasnogo Mayaka
      let coords: [number, number];
      if (etaMinutes <= 1) {
        // Right at the stop
        coords = KRASNOGO_MAYAKA_CORRIDOR[3];
      } else if (etaMinutes <= 15) {
        // Approaching the stop linearly along the street
        const approachProgress = Math.max(0, (1 - etaMinutes / 15)) * stopProgress;
        coords = interpolatePath(KRASNOGO_MAYAKA_CORRIDOR, approachProgress);
      } else {
        // Further out: smooth visual cruise on the corridor segment
        const cycleProgress = (((clockTick + idx * 25) % 60) / 60) * 0.35;
        coords = interpolatePath(KRASNOGO_MAYAKA_CORRIDOR, cycleProgress);
      }

      const colorClass = route.number === 'м96'
        ? 'bus-marker-m96'
        : route.number === 'с960'
        ? 'bus-marker-s960'
        : 'bus-marker-m96';

      return {
        number: route.number,
        direction: route.direction || 'По маршруту',
        nextDeparture,
        etaMinutes,
        colorClass,
        currentCoords: coords,
        isTomorrow,
        shiftLabel,
      };
    });
  }, [routes, selectedStopId, activeShift, clockTick]);

  const currentStop = stops.find(s => s.id === selectedStopId) || stops[0];
  const stopCoords = currentStop?.coords || [55.611639, 37.599741];

  const yandexUrl = `https://yandex.ru/maps/213/moscow/?ll=${stopCoords[1]}%2C${stopCoords[0]}&z=17&mode=stop`;

  if (stops.length === 0) {
    return (
      <div
        className="empty-state"
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          minHeight: 180,
        }}
      >
        <div className="empty-state-icon">🗺️</div>
        <div className="empty-state-text">
          Сначала добавьте остановку,<br />затем отметьте её на карте.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Top Map Header & Controls */}
      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-6" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', padding: '4px 10px', borderRadius: 99 }}>
            <span className="bus-pulse-dot" />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--green)' }}>Радар расписания</span>
          </div>
          {stops.length > 1 && (
            <select
              id="map-stop-select"
              className="form-select"
              style={{ width: 'auto', padding: '4px 12px', fontSize: '0.85rem' }}
              value={selectedStopId}
              onChange={e => setSelectedStopId(e.target.value)}
            >
              {stops.map(s => (
                <option key={s.id} value={s.id}>🚏 {s.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-8">
          <a
            href={yandexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            title="Открыть эту остановку в Яндекс Картах для проверки спутниковых данных"
          >
            <span>Яндекс Карты</span>
            <span style={{ fontSize: '11px' }}>↗</span>
          </a>
        </div>
      </div>

      {/* Map view */}
      <LeafletMap
        stops={stops}
        routes={routes}
        selectedStopId={selectedStopId}
        onStopCoordsUpdate={onStopCoordsUpdate}
        busArrivals={busArrivals}
      />

      {/* Live Arrival Scoreboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {busArrivals.map(bus => (
          <div key={bus.number} className="radar-board-card">
            <div className="flex items-center gap-10">
              <div
                className={`bus-marker-badge ${bus.colorClass}`}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                <span>🚌</span>
                <span>{bus.number}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{bus.direction}</div>
                <div className="flex items-center gap-6" style={{ marginTop: 2 }}>
                  <span className="text-xs text-muted">ул. Красного Маяка</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--accent-light)',
                      fontWeight: 600,
                    }}
                  >
                    {bus.shiftLabel}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: bus.etaMinutes <= 2 ? 'var(--green)' : 'var(--accent-light)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {bus.etaMinutes <= 1 ? 'Подъезжает' : `~${bus.etaMinutes} мин`}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {bus.isTomorrow ? `Завтра в ${bus.nextDeparture}` : `Рейс в ${bus.nextDeparture}`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div
        className="flex items-center justify-between"
        style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
      >
        <span>✋ Нажмите на карту или перетащите 🚏 для смены метки</span>
        {currentStop?.coords && (
          <span className="chip chip-green" style={{ flexShrink: 0, fontSize: '0.72rem' }}>
            📍 {currentStop.coords[0].toFixed(5)}, {currentStop.coords[1].toFixed(5)}
          </span>
        )}
      </div>
    </div>
  );
}
