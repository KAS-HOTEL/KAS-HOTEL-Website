import { roomTypeStatusLabel, roomTypeStatusTone } from '@/lib/domain/roomType';
import { Badge } from '@/ui/primitives';

/**
 * A room type's lifecycle status.
 *
 * Translated, never reinterpreted — `UNLISTED` is "đã gỡ hiển thị" (withdrawn
 * from the public site), not "ẩn" or "tắt", which would read as a toggle the
 * Partner can flip back at will. The raw backend value travels in
 * `data-room-status` and the tooltip, so the translation is never the only
 * record of what the server said, and an unrecognised value renders as itself.
 */
export function RoomTypeStatusBadge({ status }: { readonly status: string }) {
  return (
    <span data-room-status={status} title={status}>
      <Badge tone={roomTypeStatusTone(status)}>{roomTypeStatusLabel(status)}</Badge>
    </span>
  );
}
