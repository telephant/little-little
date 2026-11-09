// Always-visible privacy indicator (AC-9): derives ONLY from the active
// chat provider's is_cloud — one source of truth (ADR-0003).
export function PrivacyBadge(props: { isCloud: boolean | null }) {
  // Distinct by words, never by colour alone (AC-14).
  // The key word always stays; the detail after it is dropped on narrow windows (CSS) so the bar never wraps.
  const word = props.isCloud === null ? "—" : props.isCloud ? "Cloud" : "On-device";
  const detail = props.isCloud === null ? "" : props.isCloud ? " · text goes to Claude" : " · stays on this device";
  return (
    <div
      className={`privacy-badge ${props.isCloud ? "cloud" : ""}`}
      data-testid="privacy-badge"
      aria-live="polite"
    >
      <span>{word}</span>
      {detail && <span className="privacy-detail">{detail}</span>}
    </div>
  );
}
