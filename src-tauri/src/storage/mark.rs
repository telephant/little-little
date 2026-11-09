//! Painted-mark validation (ADR-0006). A mark is numbers-only JSON:
//! `{"v":1,"strokes":[[x,y,x,y,...],...]}` with integer coordinates 0..=480 (a 48x48 box in tenths),
//! plus an OPTIONAL `"colors":[c,...]` (one 0..=7 per stroke; 0 = follow the mood, ADR-0006 addendum).
//! Limits are provisional (spec paint-marks D-6) until measured on real drawings.

pub const MAX_BYTES: usize = 8192;
pub const MAX_STROKES: usize = 8;
pub const MAX_POINTS: usize = 400;
pub const MAX_COORD: i64 = 480;
pub const MAX_COLOR: i64 = 7;

/// Ok(()) when `s` is a well-formed mark within the limits; Err(reason) otherwise.
pub fn validate_mark(s: &str) -> Result<(), String> {
    if s.len() > MAX_BYTES {
        return Err(format!("mark is larger than {MAX_BYTES} bytes"));
    }
    let v: serde_json::Value = serde_json::from_str(s).map_err(|_| "mark is not valid JSON".to_string())?;
    let obj = v.as_object().ok_or("mark must be a JSON object")?;
    let has_colors = obj.contains_key("colors");
    if obj.len() != 2 + has_colors as usize || !obj.contains_key("v") || !obj.contains_key("strokes") {
        return Err("mark must have the keys v and strokes, and optionally colors".into());
    }
    if obj["v"].as_i64() != Some(1) {
        return Err("unsupported mark version".into());
    }
    let strokes = obj["strokes"].as_array().ok_or("strokes must be an array")?;
    if strokes.is_empty() || strokes.len() > MAX_STROKES {
        return Err(format!("a mark needs 1 to {MAX_STROKES} strokes"));
    }
    if has_colors {
        let colors = obj["colors"].as_array().ok_or("colors must be an array")?;
        if colors.len() != strokes.len() {
            return Err("colors needs one entry per stroke".into());
        }
        for c in colors {
            match c.as_i64() {
                Some(n) if (0..=MAX_COLOR).contains(&n) => {}
                _ => return Err(format!("colors must be integers 0..={MAX_COLOR}")),
            }
        }
    }
    for stroke in strokes {
        let nums = stroke.as_array().ok_or("a stroke must be an array")?;
        if nums.len() % 2 != 0 || nums.len() < 4 && nums.len() != 2 {
            return Err("a stroke must be x,y pairs".into());
        }
        if nums.is_empty() || nums.len() / 2 > MAX_POINTS {
            return Err(format!("a stroke may have at most {MAX_POINTS} points"));
        }
        for n in nums {
            match n.as_i64() {
                Some(c) if (0..=MAX_COORD).contains(&c) => {}
                _ => return Err(format!("coordinates must be integers 0..={MAX_COORD}")),
            }
        }
    }
    Ok(())
}

#[cfg(test)]
pub(crate) const VALID: &str = r#"{"v":1,"strokes":[[10,10,240,300,470,40],[20,400,260,260]]}"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn stroke_of(points: usize) -> String {
        let nums: Vec<String> = (0..points * 2).map(|i| (i % 400).to_string()).collect();
        format!("[{}]", nums.join(","))
    }

    /// TC-5: Given bad and good mark strings; When validated; Then bad ones fail, the good one passes.
    #[test]
    fn tc5_validation_rules() {
        assert!(validate_mark(VALID).is_ok());
        // a single-point tap is allowed (one x,y pair)
        assert!(validate_mark(r#"{"v":1,"strokes":[[240,240]]}"#).is_ok());

        let nine = format!(r#"{{"v":1,"strokes":[{}]}}"#, vec![stroke_of(2); 9].join(","));
        let too_many_points = format!(r#"{{"v":1,"strokes":[{}]}}"#, stroke_of(401));
        let bad: Vec<(&str, String)> = vec![
            ("more than 8 strokes", nine),
            ("a stroke over 400 points", too_many_points),
            ("odd coordinate count", r#"{"v":1,"strokes":[[1,2,3]]}"#.into()),
            ("coordinate below 0", r#"{"v":1,"strokes":[[-1,2,3,4]]}"#.into()),
            ("coordinate above 480", r#"{"v":1,"strokes":[[1,2,481,4]]}"#.into()),
            ("fractional number", r#"{"v":1,"strokes":[[1.5,2,3,4]]}"#.into()),
            ("wrong version", r#"{"v":2,"strokes":[[1,2,3,4]]}"#.into()),
            ("extra key", r#"{"v":1,"strokes":[[1,2,3,4]],"x":1}"#.into()),
            ("no strokes", r#"{"v":1,"strokes":[]}"#.into()),
            ("empty stroke", r#"{"v":1,"strokes":[[]]}"#.into()),
            ("strings instead of numbers", r#"{"v":1,"strokes":[["a","b","c","d"]]}"#.into()),
            ("not JSON", "M0 0 L10 10".into()),
            ("over 8192 bytes", format!(r#"{{"v":1,"strokes":[[1,2,3,4]],"pad":"{}"}}"#, "x".repeat(9000))),
        ];
        for (why, s) in bad {
            assert!(validate_mark(&s).is_err(), "should reject: {why}");
        }
    }

    /// paint-marks TC-22: Given marks with optional per-stroke colours; When validated;
    /// Then valid colours (and none at all) pass and every malformed `colors` is rejected.
    #[test]
    fn pm_tc22_colour_rules() {
        assert!(validate_mark(VALID).is_ok(), "no colors key stays valid");
        assert!(validate_mark(r#"{"v":1,"strokes":[[1,2,3,4],[5,6,7,8]],"colors":[0,7]}"#).is_ok());
        let bad = [
            ("length mismatch", r#"{"v":1,"strokes":[[1,2,3,4],[5,6,7,8]],"colors":[0]}"#),
            ("value 8", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":[8]}"#),
            ("negative", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":[-1]}"#),
            ("fractional", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":[1.5]}"#),
            ("not an array", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":3}"#),
            ("strings", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":["a"]}"#),
            ("extra key beside colors", r#"{"v":1,"strokes":[[1,2,3,4]],"colors":[0],"x":1}"#),
            ("colors without strokes", r#"{"v":1,"colors":[0]}"#),
        ];
        for (why, s) in bad {
            assert!(validate_mark(s).is_err(), "should reject: {why}");
        }
    }
}
