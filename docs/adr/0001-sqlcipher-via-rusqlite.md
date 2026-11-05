# ADR-0001: Encrypt the database with SQLCipher via rusqlite's bundled feature

Status: Accepted (2026-11-05)

## Context

Spec D-4 requires encryption at rest from day one (M1). There is no official Tauri SQLCipher plugin; community forks (tauri-plugin-sqlcipher, tauri-plugin-rusqlite2) are young and thinly maintained [verified 2026-11-05].

## Options

1. **rusqlite with `bundled-sqlcipher-vendored-openssl`, own Tauri command layer** — SQLCipher compiled in, crypto vendored, no system deps; we write the (small) command layer ourselves.
2. Community plugin (tauri-plugin-rusqlite2) — less code now, but unaudited, uncertain maintenance, and we'd still fork it to add sqlite-vec registration.
3. Plain SQLite + OS-level encryption (FileVault) — zero work, but breaks the product promise (AC-2) on machines without disk encryption.

## Decision

Option 1. The DB layer is custom anyway (sqlite-vec registration, vec queries, migrations), so a plugin buys little.

## Consequences

- One rusqlite version serves both SQLCipher and sqlite-vec; compile times grow (C sources compiled in).
- Passphrase loss = data loss; no recovery path. Must be stated in the first-run UI.
- SQLCipher's default KDF accepted as-is for M1.
