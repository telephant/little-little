// A labelled radio whose selected state is drawn from React state (`is-checked`), not from `:checked` pseudo-elements,
// so the dot never depends on how a webview renders pseudo-elements on an `appearance: none` input.
import type { ReactNode } from "react";

export function PaintedRadio(props: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className={`painted-choice${props.checked ? " is-checked" : ""}`}>
      <input
        type="radio"
        className="painted-radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onChange}
      />
      <span className="radio-mark" aria-hidden="true" />
      <span className="choice-text">{props.children}</span>
    </label>
  );
}
