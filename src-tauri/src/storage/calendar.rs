//! Calendar query (F-8): per local day, the displayed mood level —
//! latest MANUAL-mooded entry of the day wins, else latest AI-mooded (design review 2026-11-05).

use super::{Result, Storage};
use chrono::{DateTime, Local};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize)]
pub struct DayMood {
    pub date: String, // local YYYY-MM-DD
    pub level: Option<i64>,
    pub count: i64,
    /// Latest painted mark of the day (paint-marks D-4); None → the UI shows the mood mark.
    pub mark: Option<DayMark>,
}

/// A day's painted mark plus the mood level of the entry that carries it (drives the mark's colour).
#[derive(Debug, Clone, Serialize)]
pub struct DayMark {
    pub mark: String,
    pub level: Option<i64>,
}

impl Storage {
    /// Days of the given local month that have entries, with their display mood.
    pub fn calendar_month(&self, year: i32, month: u32) -> Result<Vec<DayMood>> {
        struct Row {
            created_at: String,
            level: Option<i64>,
            source: Option<String>,
            mark: Option<String>,
        }
        let rows: Vec<Row> = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "SELECT created_at, mood_level, mood_source, mark FROM entries ORDER BY created_at ASC",
            )?;
            stmt.query_map([], |r| {
                Ok(Row {
                    created_at: r.get(0)?,
                    level: r.get(1)?,
                    source: r.get(2)?,
                    mark: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
        };

        #[derive(Default)]
        struct Day {
            manual: Option<i64>, // latest manual (ascending order ⇒ last write wins)
            ai: Option<i64>,
            mark: Option<DayMark>, // latest painted entry of the day (ascending order)
            count: i64,
        }
        let mut days: BTreeMap<String, Day> = BTreeMap::new();
        let prefix = format!("{year:04}-{month:02}-");
        for row in rows {
            let Ok(ts) = DateTime::parse_from_rfc3339(&row.created_at) else {
                continue;
            };
            let local_day = ts.with_timezone(&Local).format("%Y-%m-%d").to_string();
            if !local_day.starts_with(&prefix) {
                continue;
            }
            let day = days.entry(local_day).or_default();
            day.count += 1;
            if let Some(m) = row.mark {
                day.mark = Some(DayMark { mark: m, level: row.level });
            }
            match (row.source.as_deref(), row.level) {
                (Some("manual"), Some(l)) => day.manual = Some(l),
                (Some("ai"), Some(l)) => day.ai = Some(l),
                _ => {}
            }
        }
        Ok(days
            .into_iter()
            .map(|(date, d)| DayMood {
                date,
                level: d.manual.or(d.ai),
                count: d.count,
                mark: d.mark,
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at_local(y: i32, m: u32, d: u32) -> String {
        Local
            .with_ymd_and_hms(y, m, d, 12, 0, 0)
            .unwrap()
            .to_rfc3339()
    }

    fn entry_at(s: &Storage, ts: &str, body: &str) -> String {
        let id = s.create_entry().unwrap().id;
        s.save_entry(&id, body).unwrap();
        let conn = s.conn.lock().unwrap();
        conn.execute(
            "UPDATE entries SET created_at=?2, updated_at=?2 WHERE id=?1",
            rusqlite::params![id, ts],
        )
        .unwrap();
        id
    }

    /// TC-25: Given entries with manual and AI moods across several days (incl.
    /// one day holding both an older manual and a newer AI entry); When
    /// calendar_month queried; Then that day reports the MANUAL level, other days
    /// their latest level, with entry counts; empty days absent.
    #[test]
    fn tc25_manual_first_day_colors() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();

        // Day 3: manual(2) in the morning, AI(5) later → manual wins.
        let a = entry_at(&s, &at_local(2026, 11, 3), "hard morning");
        s.set_mood(&a, 2, None).unwrap();
        let b = entry_at(
            &s,
            &Local.with_ymd_and_hms(2026, 11, 3, 18, 0, 0).unwrap().to_rfc3339(),
            "better evening",
        );
        s.set_mood_ai(&b, 5, Some("relieved")).unwrap();
        // Day 10: single AI mood.
        let c = entry_at(&s, &at_local(2026, 11, 10), "fine day");
        s.set_mood_ai(&c, 4, None).unwrap();
        // Day 20: entry with no mood yet.
        entry_at(&s, &at_local(2026, 11, 20), "unclassified");
        // Different month: must not appear.
        entry_at(&s, &at_local(2026, 10, 30), "last month");

        let days = s.calendar_month(2026, 11).unwrap();
        let get = |d: &str| days.iter().find(|x| x.date.ends_with(d)).unwrap();
        assert_eq!(days.len(), 3);
        assert_eq!(get("-03").level, Some(2), "manual must beat newer AI");
        assert_eq!(get("-03").count, 2);
        assert_eq!(get("-10").level, Some(4));
        assert_eq!(get("-20").level, None);
        assert!(days.iter().all(|x| x.date.starts_with("2026-11-")));
    }

    /// paint-marks TC-12 (D-4): Given a day with entry A (manual mood 5, no mark), B (AI mood 2, painted,
    /// earlier) and C (no mood, painted, latest); When calendar_month runs; Then the day's mark is C's mark
    /// with C's level (None), the day's mood level is still 5 (manual first), and a day without a painted
    /// entry has no mark.
    #[test]
    fn pm_tc12_day_carries_latest_painted_mark() {
        let dir = tempfile::tempdir().unwrap();
        let s = Storage::open(&dir.path().join("j.db"), "p").unwrap();
        let hm = |d: u32, h: u32| Local.with_ymd_and_hms(2026, 11, d, h, 0, 0).unwrap().to_rfc3339();
        let m1 = r#"{"v":1,"strokes":[[10,10,200,200]]}"#;
        let m2 = r#"{"v":1,"strokes":[[300,10,20,400]]}"#;

        let a = entry_at(&s, &hm(5, 8), "plain morning");
        s.set_mood(&a, 5, None).unwrap();
        let b = entry_at(&s, &hm(5, 10), "painted midday");
        s.set_mood_ai(&b, 2, None).unwrap();
        s.set_mark(&b, m1).unwrap();
        let c = entry_at(&s, &hm(5, 18), "painted evening");
        s.set_mark(&c, m2).unwrap();

        // Day 8: one painted entry with a mood; day 9: no painted entry at all.
        let d = entry_at(&s, &hm(8, 12), "one painted");
        s.set_mood(&d, 3, None).unwrap();
        s.set_mark(&d, m1).unwrap();
        let e = entry_at(&s, &hm(9, 12), "unpainted");
        s.set_mood(&e, 4, None).unwrap();

        let days = s.calendar_month(2026, 11).unwrap();
        let get = |d: &str| days.iter().find(|x| x.date.ends_with(d)).unwrap();
        let d5 = get("-05");
        assert_eq!(d5.level, Some(5), "mood rule unchanged: manual first");
        let mk = d5.mark.as_ref().expect("day has a painted mark");
        assert_eq!(mk.mark, m2, "latest painted entry wins");
        assert_eq!(mk.level, None, "mark carries its own entry's mood level");
        let d8 = get("-08").mark.as_ref().unwrap();
        assert_eq!((d8.mark.as_str(), d8.level), (m1, Some(3)));
        assert!(get("-09").mark.is_none());
    }
}
