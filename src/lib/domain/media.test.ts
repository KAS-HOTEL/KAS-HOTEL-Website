import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  MEDIA_MIME_TYPES,
  rejectionLabel,
  selectUploads,
} from './media';

/**
 * Splitting a multi-file pick into what will be sent and what will not.
 *
 * The rule this file exists to hold: **nothing is discarded silently**. A picker
 * that quietly drops the two files it did not like — out of the nine somebody
 * selected — loses a photograph without anyone noticing, and the operator finds
 * out weeks later when a room looks thin.
 */

function file(name: string, type: string, size: number): File {
  const blob = new Blob([new Uint8Array(Math.max(size, 0))], { type });
  return new File([blob], name, { type });
}

describe('choosing which picked files to upload', () => {
  it('keeps the order the operator picked them in', () => {
    const { accepted } = selectUploads([
      file('c.jpg', 'image/jpeg', 10),
      file('a.jpg', 'image/jpeg', 10),
      file('b.jpg', 'image/jpeg', 10),
    ]);

    // That order becomes display_order, so it is the order a guest scrolls
    // through. Sorting by name here would quietly overrule the operator.
    expect(accepted.map((f) => f.name)).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
  });

  it('accepts every type the backend accepts, and only those', () => {
    const picked = MEDIA_MIME_TYPES.map((type, n) => file(`p${n}`, type, 10));
    const { accepted, rejected } = selectUploads(picked);

    // MEDIA_MIME_TYPES is `RegisterMediaRequest`'s own list, so a file refused
    // here would have been refused there. One policy, applied earlier.
    expect(accepted).toHaveLength(MEDIA_MIME_TYPES.length);
    expect(rejected).toHaveLength(0);
  });

  it('refuses a type the backend would refuse, and says which file', () => {
    const { accepted, rejected } = selectUploads([
      file('brochure.pdf', 'application/pdf', 10),
      file('photo.jpg', 'image/jpeg', 10),
    ]);

    expect(accepted.map((f) => f.name)).toEqual(['photo.jpg']);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.file.name).toBe('brochure.pdf');
    expect(rejected[0]?.reason).toBe('type');
  });

  it('refuses an original too large to be worth sending', () => {
    const { accepted, rejected } = selectUploads([
      file('huge.jpg', 'image/jpeg', MAX_UPLOAD_BYTES + 1),
    ]);

    // A client-side guard, not a mirrored backend rule — there is no size limit
    // in the API. Refusing before the first byte leaves beats refusing after a
    // long push over a hotel's uplink.
    expect(accepted).toHaveLength(0);
    expect(rejected[0]?.reason).toBe('size');
  });

  it('accepts a file exactly at the limit', () => {
    const { accepted } = selectUploads([file('big.jpg', 'image/jpeg', MAX_UPLOAD_BYTES)]);
    expect(accepted).toHaveLength(1);
  });

  it('refuses an empty file rather than uploading nothing', () => {
    const { rejected } = selectUploads([file('empty.jpg', 'image/jpeg', 0)]);

    // Zero bytes would mint a URL, PUT nothing, and fail the magic-byte check
    // at `complete` — three round trips to learn what the size already said.
    expect(rejected[0]?.reason).toBe('empty');
  });

  it('returns every rejection, not just the first', () => {
    const { accepted, rejected } = selectUploads([
      file('a.pdf', 'application/pdf', 10),
      file('good.jpg', 'image/jpeg', 10),
      file('b.txt', 'text/plain', 10),
    ]);

    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.file.name)).toEqual(['a.pdf', 'b.txt']);
  });

  it('has a sentence for every reason it can give', () => {
    // A reason with no words is a file that vanishes with no explanation.
    for (const reason of ['type', 'size', 'empty'] as const) {
      expect(rejectionLabel(reason).length).toBeGreaterThan(0);
    }
  });
});
