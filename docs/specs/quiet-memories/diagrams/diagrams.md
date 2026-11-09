# quiet-memories — design diagrams

## Product flow

```
1. User writes a new page --> nothing appears on the right while they type
2. User pauses (half a minute) with enough written --> memories and a reflection arrive
3. User keeps typing instead --> still nothing; the wait starts over after the next pause
4. User opens an older page --> sees its stored reflection, or a quiet "Look back"
5. User clicks "Look back" --> memories and a reflection are made for that page
6. User opens "N memories" --> Earlier and Later groups
```

Check:
- Is half a minute the right feel, or too long?
- Is "Look back" discoverable enough for pages with no reflection?

## Components

```mermaid
flowchart LR
  Editor -->|onSaved body| App[C-2 App wiring]
  Editor -->|onTyped| App
  App --> Idle[C-1 useReflectIdle]
  Idle -->|after 30s quiet| App
  App -->|get_ai_panel id generate| Cmd[C-3 build_ai_panel_opts]
  Cmd --> Split[C-4 split_neighbours]
  App --> Panel[C-5 AiPanel]
```

Check:
- Is C-1 the only place that decides "enough to reflect"?
- Does any path call get_ai_panel with generate true other than idle, Look back, or Regenerate?

## New page: write, pause, ask

```mermaid
sequenceDiagram
  participant U as User
  participant E as Editor
  participant A as App
  participant I as useReflectIdle
  participant B as Backend
  U->>E: types
  E->>A: onTyped
  A->>I: cancel
  E->>A: onSaved after 1s
  A->>I: schedule(id, body)
  Note over I: 30s with no typing
  I->>A: ask(id)
  A->>B: get_ai_panel(id, true)
  B-->>A: ready with earlier/later
```

Check:
- What if the user switches page during the 30 s?
- Does the timer survive leaving the Journal view?

## Panel state per page

```mermaid
stateDiagram-v2
  [*] --> Quiet: new page
  Quiet --> Ready: long pause asks
  [*] --> Lookup: open old page (generate false)
  Lookup --> Ready: stored reflection
  Lookup --> NotRequested: none stored
  NotRequested --> Ready: Look back
```

Check:
- Can a page show NotRequested forever if the user never clicks?
- Is there any state that calls the model without a user action or the pause?
