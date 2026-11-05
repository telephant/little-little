//! Chunker (C-6): blank-line paragraphs merged to ~1000 chars; any paragraph
//! over 1500 chars is hard-split on sentence boundaries. Provisional sizes —
//! see tests.md Measurements.

const MERGE_TARGET: usize = 1000;
const HARD_SPLIT: usize = 1500;

pub fn chunk(text: &str) -> Vec<String> {
    let paragraphs: Vec<&str> = text
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();

    let mut pieces: Vec<String> = Vec::new();
    for p in paragraphs {
        if p.len() > HARD_SPLIT {
            pieces.extend(split_sentences(p));
        } else {
            pieces.push(p.to_string());
        }
    }

    // Merge adjacent pieces up to the target size.
    let mut chunks: Vec<String> = Vec::new();
    for piece in pieces {
        match chunks.last_mut() {
            Some(last) if last.len() + 2 + piece.len() <= MERGE_TARGET => {
                last.push_str("\n\n");
                last.push_str(&piece);
            }
            _ => chunks.push(piece),
        }
    }
    chunks
}

/// Split an oversized paragraph at sentence ends, keeping each piece ≤ HARD_SPLIT.
fn split_sentences(p: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for sentence in p.split_inclusive(['.', '!', '?']) {
        if !current.is_empty() && current.len() + sentence.len() > HARD_SPLIT {
            out.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(sentence);
        // A sentence that alone exceeds the limit is cut mid-word as a last resort.
        while current.len() > HARD_SPLIT {
            let cut: String = current.chars().take(HARD_SPLIT).collect();
            out.push(cut.trim().to_string());
            current = current.chars().skip(HARD_SPLIT).collect();
        }
    }
    if !current.trim().is_empty() {
        out.push(current.trim().to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_entry_is_one_chunk() {
        let c = chunk("Just a few words today.");
        assert_eq!(c.len(), 1);
    }

    #[test]
    fn paragraphs_merge_up_to_target() {
        let text = "one\n\ntwo\n\nthree";
        let c = chunk(text);
        assert_eq!(c.len(), 1);
        assert!(c[0].contains("one") && c[0].contains("three"));
    }

    #[test]
    fn long_paragraph_hard_splits_on_sentences() {
        let sentence = "This sentence is repeated to build a very long paragraph. ";
        let long = sentence.repeat(60); // ~3500 chars, no blank lines
        let c = chunk(&long);
        assert!(c.len() >= 2, "expected a hard split, got {} chunk(s)", c.len());
        assert!(c.iter().all(|x| x.len() <= 1600));
        // Nothing lost (modulo whitespace trimming).
        let joined: usize = c.iter().map(|x| x.len()).sum();
        assert!(joined > 3000);
    }

    #[test]
    fn empty_body_gives_no_chunks() {
        assert!(chunk("   \n\n  ").is_empty());
    }

    /// Not an assertion — prints chunk stats over the fixture journal for the
    /// Measurements table (run with --nocapture).
    #[test]
    fn measure_fixture_chunking() {
        #[derive(serde::Deserialize)]
        struct Fx {
            id: String,
            body: String,
        }
        let fixtures: Vec<Fx> =
            serde_json::from_str(include_str!("../../tests/fixtures/entries.json")).unwrap();
        for f in &fixtures {
            let c = chunk(&f.body);
            let sizes: Vec<usize> = c.iter().map(|x| x.len()).collect();
            println!("MEASURE chunking {}: body={} chars, {} chunk(s) {:?}", f.id, f.body.len(), c.len(), sizes);
        }
    }
}
