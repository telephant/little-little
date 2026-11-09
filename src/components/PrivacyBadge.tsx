// Always-visible privacy indicator (AC-9): derives ONLY from the active
// chat provider's is_cloud — one source of truth (ADR-0003).
export function PrivacyBadge(props: { isCloud: boolean | null }) {
  // Distinct by words, never by colour alone (AC-14).
  const label =
    props.isCloud === null ? "—" : props.isCloud ? "Cloud · text goes to Claude" : "On-device · stays on this device";
  return (
    <div
      className={`privacy-badge ${props.isCloud ? "cloud" : ""}`}
      data-testid="privacy-badge"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
