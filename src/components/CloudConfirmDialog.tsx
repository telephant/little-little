// One-time confirmation before any entry text can go to the cloud (D-5, AC-17).
export function CloudConfirmDialog(props: { onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" className="dialog">
        <h2>Send entries to Claude?</h2>
        <p>
          With the Cloud provider, the text of your entries (except ones marked
          “never send to cloud”) is sent to Claude to generate reflections, search
          answers — and to read each entry's mood in the background. On-device mode
          keeps everything on this computer.
        </p>
        <div className="dialog-actions">
          <button onClick={props.onCancel}>Cancel</button>
          <button className="primary" onClick={props.onAccept}>
            Send my entries to Claude
          </button>
        </div>
      </div>
    </div>
  );
}
