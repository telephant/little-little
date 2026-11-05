// First-run and unlock screens (F-1). One component, two modes.
import { useState } from "react";

export function Gate(props: {
  mode: "first-run" | "locked";
  onSubmit: (passphrase: string) => Promise<void>;
}) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRun = props.mode === "first-run";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pass || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(pass);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="gate" onSubmit={submit}>
      <h1>Little Little</h1>
      {firstRun ? (
        <>
          <p>Choose a passphrase to encrypt your journal.</p>
          <p className="warning">
            There is no recovery: if you lose this passphrase, your journal cannot be opened
            by anyone — including you.
          </p>
        </>
      ) : (
        <p>Enter your passphrase to unlock your journal.</p>
      )}
      <label>
        Passphrase
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoFocus
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy || !pass}>
        {firstRun ? "Create journal" : "Unlock"}
      </button>
    </form>
  );
}
