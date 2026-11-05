import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { Activity } from "../lib/types";

/** Poll-based activity (C-14): cheap counts every 2s while the journal is open. */
export function useActivity(enabled: boolean) {
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      const a = await ipc.getActivity().catch(() => null);
      if (alive && a) setActivity(a);
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);

  const busy =
    !!activity &&
    (activity.embed_pending > 0 || activity.mood_pending > 0 || activity.pulling !== null);
  return { activity, busy };
}
