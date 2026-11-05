//! Persona (C-8): tone and prompts decoupled from logic. M1 ships one default
//! persona; M3 adds presets and M4 custom tones behind this same struct.

use crate::providers::ChatRequest;

pub struct Persona {
    /// Preset identifier — read by the persona picker in M3 (backlog), kept now
    /// so stored custom tones have a stable shape.
    #[allow(dead_code)]
    pub name: &'static str,
    pub system: &'static str,
}

/// Context shown to the model — only retrieved snippets ever enter the prompt.
pub struct ContextItem {
    pub date: String,
    pub snippet: String,
}

pub const DEFAULT_PERSONA: Persona = Persona {
    name: "default",
    system: "\
You are the gentle companion inside a private journal app called Little Little.
After the person writes an entry, you offer one short reflection.

Rules:
- 2 to 4 sentences, warm and plain. No lists, no headers, no questions barrage.
- Ground what you say ONLY in the past entries provided as context, and refer to
  them by their date (for example: 'back on 2026-03-06'). Never invent memories.
- Encourage gently; point out progress the person's own words show.
- You are not a therapist and never diagnose. You support, you don't replace people.
- If the entry suggests serious distress or hopelessness: drop all cheerfulness,
  respond with warmth and care, acknowledge the weight of it, gently mention that
  talking to someone they trust or a professional can help, and include one line
  with a support resource (such as the 988 Suicide & Crisis Lifeline in the US,
  or the local equivalent). Never minimize, never moralize.",
};

impl Persona {
    pub fn reflection_request(&self, entry_body: &str, context: &[ContextItem]) -> ChatRequest {
        let mut user = String::from("The person just wrote this entry:\n---\n");
        user.push_str(entry_body);
        user.push_str("\n---\n");
        if context.is_empty() {
            user.push_str("\nThere are no related past entries yet.\n");
        } else {
            user.push_str("\nRelated past entries (your only memory — cite by date):\n");
            for c in context {
                user.push_str(&format!("- [{}] {}\n", c.date, c.snippet));
            }
        }
        user.push_str("\nWrite the reflection now.");
        ChatRequest {
            system: self.system.to_string(),
            user,
            json_schema: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// AC-14 (prompt half): distress guidance is baked into the default persona.
    #[test]
    fn default_persona_carries_distress_guidance() {
        let s = DEFAULT_PERSONA.system;
        assert!(s.contains("serious distress"));
        assert!(s.contains("988"));
        assert!(s.to_lowercase().contains("never diagnose"));
        assert!(s.to_lowercase().contains("cheerfulness"));
    }

    #[test]
    fn reflection_request_embeds_entry_and_dated_context() {
        let req = DEFAULT_PERSONA.reflection_request(
            "nervous about tomorrow",
            &[ContextItem {
                date: "2026-03-06".into(),
                snippet: "The interview went so much better than I feared.".into(),
            }],
        );
        assert!(req.user.contains("nervous about tomorrow"));
        assert!(req.user.contains("[2026-03-06]"));
        assert!(req.user.contains("better than I feared"));
    }
}
