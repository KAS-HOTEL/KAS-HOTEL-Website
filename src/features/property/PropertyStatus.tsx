import { Badge } from '@/ui/primitives';
import { lifecycleLabel, lifecycleTone } from '@/lib/domain/property';

/**
 * The property lifecycle state, as a badge.
 *
 * <h2>Translated, never reinterpreted</h2>
 *
 * The label is Vietnamese; the state is the backend's. `DRAFT` shows as "Bản
 * nháp" — a translation — and never as "Chưa kích hoạt" or "Chờ duyệt", which
 * would assert something the lifecycle does not say: a draft is not waiting for
 * anyone, and inactivity is what `CLOSED` and `TEMPORARILY_CLOSED` mean.
 *
 * The raw value travels with it in `data-lifecycle-state` and in the tooltip, so
 * the translation is never the only record of what the backend returned, and an
 * operator reading a bug report can always recover the real state.
 *
 * A state that is not one of the five frozen values renders its own raw value
 * rather than crashing or being silently mapped to something familiar.
 */
export function PropertyStatus({ state }: { readonly state: string }) {
  return (
    <span data-lifecycle-state={state} title={state}>
      <Badge tone={lifecycleTone(state)}>{lifecycleLabel(state)}</Badge>
    </span>
  );
}
