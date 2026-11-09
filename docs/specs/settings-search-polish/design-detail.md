# design-detail — reference only (not required reading for approval)

## PaintedRadio markup
```tsx
<label className={`painted-choice${checked ? " is-checked" : ""}`}>
  <input type="radio" className="painted-radio-input" name={name} checked={checked} onChange={onChange} />
  <span className="radio-mark" aria-hidden="true" />
  <span className="choice-text">{children}</span>
</label>
```
CSS: input is visually hidden (not `display:none`, so focus and arrow keys work); `.painted-choice input:focus-visible + .radio-mark` shows the focus ring; `.radio-mark` 1.2rem ring (`::before`, `filter:url(#ink)`); `.is-checked .radio-mark::after` = solid `--cobalt` dot, `inset:4px`, `border-radius: 52% 48% 55% 45% / 48% 54% 46% 52%`, no filter. `.is-checked .choice-text` full ink colour; unchecked slightly softer.

## Settings header
`.settings-close`: 32×32, `display:grid; place-items:center`, 1.2rem ✕, `color: var(--ink-soft)`, hover → `--cobalt` with `--wash-sky` background; `aria-label="close settings"` (existing tests keep working).

## Data rows
```
YOUR DATA
Everything stays on this device unless you save a copy somewhere.
[title]                      [button]
 one-line description
```
- Export Markdown: "Save every entry as a .md file in a folder you choose." → "Export…"
- Back up: "One JSON file with all entries, moods and marks — for safekeeping." → "Back up…"
- divider, then Restore: "Bring a backup back. Only works into an empty journal." → "Restore…"
Buttons keep `.text-link` styling. Row = CSS grid `1fr auto`, hairline between rows. `notice`/`error` render directly under the rows.

## Search states
`idle` (no query run): intro line "Ask in your own words — answers come from your entries." + 3 static examples as `.text-link` buttons. `searching`: "searching…" placeholder. `results`: list; `empty`: "No matching entries. Try fewer or different words." Date format: `Intl.DateTimeFormat(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric"})` on `created_at`.
Ask button (not "Search", which the nav already uses): `.text-link`-style, disabled when `query.trim()===""`.

## Shell
`className={shell … ${showSide ? "" : "no-side"}}` with `showSide = phase === "unlocked" && !onboarding && !showSettings && view === "journal"`. CSS: `.shell.no-side{grid-template-columns:1fr}`, `.shell.no-side .rule-blue, .shell.no-side .side-panel{display:none}`; remove `view-calendar`.

## Security
None — no new data paths.
