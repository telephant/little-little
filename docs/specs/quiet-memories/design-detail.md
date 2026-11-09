# design-detail — reference only (not required reading for approval)

## `useReflectIdle`
```ts
export const reflectTiming = { idleMs: 30_000, minChars: 200 };
enoughToReflect(body) = Array.from(body.replace(/\s/g, "")).length >= reflectTiming.minChars
useReflectIdle(ask) -> { schedule(entryId, body), cancel() }   // one timer; schedule() cancels first
```
Tests may set `reflectTiming.idleMs = 0` / `minChars = 0` to exercise panel flows directly.

## Backend
```rust
build_ai_panel(storage, provider, entry_id, force_new)                    // generate = true
build_ai_panel_opts(storage, provider, entry_id, force_new, generate)
  ... related = related_entries(k = 3)                                   // reflection context
  ... pool    = related_entries(k = 12) ; (earlier, later) = split_neighbours(pool, entry.created_at)
  stored reflection && !force_new -> Ready{related, reflection, earlier, later}
  !generate                       -> NotRequested
  else provider call              -> Ready{..}
```
`split_neighbours`: filter by `created_at` string comparison (RFC 3339 UTC sorts lexically); equal timestamps excluded; earlier sorted descending, later ascending; truncate to 3.

## Failure table
| Case | Result |
|------|--------|
| models not chosen | `models_not_chosen` (unchanged) |
| embed pending | `thinking`, retried |
| no related | `nothing_to_relate` |
| no stored reflection, `generate=false` | `not_requested` |
| provider unavailable | `provider_unavailable` |

## Security / privacy
`generate=false` sends nothing to any provider. The wider pool respects the active provider's no-cloud filter.
