// Calendar view (C-10, AC-20): month grid colored by day mood, manual-first.
import { useCallback, useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { DayMood, EntrySummary } from "../lib/types";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function Calendar(props: { onOpenEntry: (id: string) => void }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [days, setDays] = useState<DayMood[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<EntrySummary[]>([]);

  const load = useCallback(async (y: number, m: number) => {
    setDays(await ipc.calendarMonth(y, m).catch(() => []));
  }, []);

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

  function nav(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
    setSelected(null);
  }

  async function openDay(date: string) {
    setSelected(date);
    const all = await ipc.listEntries();
    setDayEntries(all.filter((e) => e.created_at.slice(0, 10) === date));
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(year, month - 1, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first grid
  const daysInMonth = new Date(year, month, 0).getDate();

  return (
    <div className="calendar" data-testid="calendar">
      <div className="calendar-header">
        <button aria-label="previous month" onClick={() => nav(-1)}>‹</button>
        <h2>{MONTHS[month - 1]} {year}</h2>
        <button aria-label="next month" onClick={() => nav(1)}>›</button>
      </div>
      <div className="calendar-grid">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
          <span key={d} className="dow">{d}</span>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <span key={`pad${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const info = byDate.get(dateStr);
          const cls = info?.level ? `day mood-${info.level}` : info ? "day has-entries" : "day";
          return (
            <button
              key={dateStr}
              data-testid={`day-${dateStr}`}
              className={cls + (selected === dateStr ? " selected" : "")}
              onClick={() => info && void openDay(dateStr)}
              disabled={!info}
              title={info ? `${info.count} entr${info.count === 1 ? "y" : "ies"}` : undefined}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="day-entries" data-testid="day-entries">
          <h3>{selected}</h3>
          <ul>
            {dayEntries.map((e) => (
              <li key={e.id}>
                <button onClick={() => props.onOpenEntry(e.id)}>
                  {e.mood_label && <span className="mood-label">{e.mood_label} · </span>}
                  {e.preview || "(empty)"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
