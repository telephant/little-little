# paint-marks — design diagrams

## Product flow

```
1. User opens an entry --> the header shows its mark (default mood mark or the ring)
2. User clicks the mark --> a small canvas opens
3. User draws with the pointer --> strokes appear as they draw
4. User presses Undo / Clear if unhappy --> nothing is saved yet
5. User presses Save --> the painted mark replaces the default one in the header, the list and the calendar
6. User changes the mood later --> the same shape, the new mood colour
7. User presses "Use default mark" --> the default mood mark returns
8. User backs up and restores --> painted marks come back
```

Check:
- Is there any step where the user can lose a drawing by accident (e.g. closing the canvas)?
- Does step 6 match what you expect (shape kept, colour follows mood)?
- Is the calendar showing the right mark when a day has several entries?

## Components

Small backend slice plus one drawing component and a render prop.

```mermaid
flowchart LR
  Canvas[C-8 MarkCanvas] --> Lib[C-6 mark.ts simplify and encode]
  Lib --> IPC[C-3 set_mark / clear_mark]
  IPC --> Val[C-2 validate_mark]
  Val --> DB[(C-1 entries.mark)]
  DB --> Read[Entry, EntrySummary, DayMood C-4]
  Read --> Wiring[C-9 Editor, List, Calendar]
  Wiring --> MM[C-7 MoodMark painted]
  DB --> Bk[C-5 backup and restore]
```

Check:
- Does anything other than C-2 write to `entries.mark`?
- Is validation on every path that writes a mark (command and restore)?
- Does any AI path read `mark`? (it must not, C-10)

## Paint and save

Sequence from stroke to display.

```mermaid
sequenceDiagram
  participant U as User
  participant C as MarkCanvas
  participant L as mark.ts
  participant B as Backend
  participant V as Views
  U->>C: pointer strokes
  C->>L: simplify and encode
  U->>C: Save
  C->>B: set_mark(id, json)
  B->>B: validate_mark
  B-->>C: ok or error text
  C->>V: refresh entry, list, calendar
  V-->>U: painted mark everywhere
```

Check:
- What does the user see if `set_mark` returns an error?
- Is the list refreshed without moving the writing area's scroll position?

## Data model

One nullable column.

```mermaid
erDiagram
  ENTRIES {
    text id PK
    text body
    int mood_level
    text mood_source
    text mark "JSON strokes or null"
  }
  ENTRY_TAGS }o--|| ENTRIES : has
```

Check:
- Does the blank-draft cleanup also check `mark IS NULL`?
- Does an old v2 journal open with `mark` null for every entry?

## Canvas lifecycle

States of the drawing surface.

```mermaid
stateDiagram-v2
  [*] --> Closed
  Closed --> OpenEmpty: click mark
  OpenEmpty --> Drawing: pointer down
  Drawing --> HasStrokes: pointer up
  HasStrokes --> Drawing: pointer down
  HasStrokes --> OpenEmpty: Undo last or Clear
  HasStrokes --> Closed: Save
  OpenEmpty --> Closed: Cancel
  HasStrokes --> ConfirmDiscard: Cancel
  ConfirmDiscard --> Closed: Discard
  ConfirmDiscard --> HasStrokes: Keep drawing
```

Check:
- Is the discard confirmation shown only when strokes exist (D-8)?
- Can Save be pressed at the stroke or size limit?
