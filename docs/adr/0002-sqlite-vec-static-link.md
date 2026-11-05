# ADR-0002: Vector search via the sqlite-vec Rust crate, statically linked

Status: Accepted (2026-11-05)

## Context

The PRD mandates sqlite-vec in the same database. The DB is SQLCipher-encrypted (ADR-0001). Loading a runtime loadable extension into a custom-built SQLCipher is fragile; the sqlite-vec Rust crate instead compiles the C source in and registers through `sqlite3_auto_extension` [verified 2026-11-05: official rust docs; crate 0.1.x targets rusqlite ^0.31].

## Options

1. **sqlite-vec crate, static link + `sqlite3_auto_extension` (once per process)** — no runtime loading, works with any bundled SQLite build.
2. Runtime loadable `.dylib`/`.dll` extension — distribution and code-signing burden, load-extension security pragma juggling.
3. Separate vector store (LanceDB, qdrant-embedded) — second storage engine, breaks "one encrypted file" promise; vectors would sit unencrypted.

## Decision

Option 1.

## Consequences

- vec data lives inside the SQLCipher file → embeddings are encrypted at rest too.
- Pinned pre-1.0 crate: rusqlite version must satisfy the crate's range; upgrades may need code changes.
- vec0 virtual tables have no FK support — orphan cleanup of `vec_chunks` is our transaction discipline (covered by AC-8 tests).
- Brute-force KNN only; fine at journal scale, revisit if entries exceed ~100k chunks.
- Spike task must confirm the SQLCipher+vec build on macOS before the plan is executed.
