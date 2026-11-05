// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem, MediaAssetView, MediaLinkView } from '@/lib/domain/media';
import type * as MediaEndpoints from '@/lib/api/endpoints/media';
import type * as Primitives from '@/ui/primitives';

const uploadUrl = vi.fn();
const complete = vi.fn();
const attach = vi.fn();
const setCover = vi.fn();
const setOrder = vi.fn();
const detach = vi.fn();
const uploadToStorage = vi.fn();
const revalidate = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  mediaApi: {
    uploadUrl: (...a: unknown[]) => uploadUrl(...a),
    complete: (...a: unknown[]) => complete(...a),
    attach: (...a: unknown[]) => attach(...a),
    setCover: (...a: unknown[]) => setCover(...a),
    setOrder: (...a: unknown[]) => setOrder(...a),
    detach: (...a: unknown[]) => detach(...a),
  },
}));
vi.mock('@/lib/api/endpoints/media', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaEndpoints>();
  return { ...actual, uploadToStorage: (...a: unknown[]) => uploadToStorage(...a) };
});
vi.mock('./actions', () => ({ revalidateRoomGallery: (...a: unknown[]) => revalidate(...a) }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }) };
});

const { RoomMediaManager } = await import('./RoomMediaManager');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

function asset(id: string): MediaAssetView {
  return {
    id,
    mimeType: 'image/jpeg',
    category: 'ROOM',
    width: 2400,
    height: 1600,
    sizeBytes: 800_000,
    status: 'DRAFT',
    url: `https://media.kas.invalid/m/${id}`,
  };
}

function link(id: string, assetId: string, order: number, isCover = false): MediaLinkView {
  return {
    id,
    mediaAssetId: assetId,
    ownerType: 'ROOM_TYPE',
    ownerId: ROOM,
    displayOrder: order,
    isCover,
    status: 'DRAFT',
  } as MediaLinkView;
}

function item(n: number, isCover = false): GalleryItem {
  return { asset: asset(`a-${n}`), link: link(`l-${n}`, `a-${n}`, n, isCover) };
}

function manager(items: GalleryItem[]) {
  return render(
    <RoomMediaManager
      propertyId={PROPERTY}
      roomTypeId={ROOM}
      roomTypeName="Phòng Gia Đình"
      items={items}
    />,
  );
}

/** A real File, so the upload path runs exactly as it would in a browser. */
function jpeg(name = 'room.jpg'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [uploadUrl, complete, attach, setCover, setOrder, detach, uploadToStorage, revalidate, refresh]) {
    fn.mockReset();
  }
  uploadUrl.mockResolvedValue({ mediaAssetId: 'a-new', uploadUrl: 'https://r2.invalid/put' });
  uploadToStorage.mockResolvedValue(undefined);
  complete.mockResolvedValue(asset('a-new'));
  attach.mockResolvedValue(link('l-new', 'a-new', 0));
  setCover.mockResolvedValue(undefined);
  setOrder.mockResolvedValue(undefined);
  detach.mockResolvedValue(undefined);
});

describe('the room gallery', () => {
  it('says the room has no photos, and why they matter', () => {
    manager([]);
    expect(screen.getByText('Phòng này chưa có ảnh')).toBeTruthy();
  });

  it('keeps hotel photos and room photos apart in words', () => {
    manager([]);
    // media_link.owner_type distinguishes them; the empty state says so, because
    // "where do I put the lobby photo" is the question this screen creates.
    expect(screen.getByText(/ảnh toàn khách sạn thuộc mục Hình ảnh của khách sạn/)).toBeTruthy();
  });

  it('shows every photo, with the cover leading', () => {
    manager([item(1, true), item(2)]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // The large image is the cover until another thumbnail is chosen.
    const main = screen.getByAltText('Phòng Gia Đình — ảnh phòng') as HTMLImageElement;
    expect(main.src).toContain('a-1');
  });

  it('switches the large photo when a thumbnail is chosen', async () => {
    manager([item(1, true), item(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Xem ảnh 2' }));

    const main = screen.getByAltText('Phòng Gia Đình — ảnh phòng') as HTMLImageElement;
    expect(main.src).toContain('a-2');
  });

  it('renders no broken image when no delivery URL is configured', () => {
    const noUrl = item(1, true);
    manager([{ ...noUrl, asset: { ...noUrl.asset, url: null } }]);

    // A deployment without `kas.media.delivery-base-url` degrades to a sentence,
    // not to a broken image or a crash.
    expect(screen.getByText(/Chưa cấu hình đường dẫn ảnh/)).toBeTruthy();
    expect(screen.queryByAltText('Phòng Gia Đình — ảnh phòng')).toBeNull();
  });
});

describe('uploading', () => {
  it('runs the three-step R2 flow and links the asset to the room type', async () => {
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());

    await waitFor(() => expect(attach).toHaveBeenCalled());
    // Mint → PUT straight to storage → complete → link. The bytes never pass
    // through Spring.
    expect(uploadUrl).toHaveBeenCalledWith(expect.objectContaining({ category: 'ROOM' }), { ownerType: 'ROOM_TYPE', ownerId: ROOM });
    expect(uploadToStorage).toHaveBeenCalledWith('https://r2.invalid/put', expect.any(File));
    expect(complete).toHaveBeenCalledWith('a-new');
    expect(attach).toHaveBeenCalledWith('a-new', {
      ownerType: 'ROOM_TYPE',
      ownerId: ROOM,
      displayOrder: 0,
    });
  });

  it('makes the first photo the cover, because nothing else would be', async () => {
    manager([]);
    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());

    await waitFor(() => expect(setCover).toHaveBeenCalledWith('a-new', 'l-new'));
  });

  it('does not steal the cover from an existing photo', async () => {
    manager([item(1, true)]);
    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());

    await waitFor(() => expect(attach).toHaveBeenCalled());
    expect(setCover).not.toHaveBeenCalled();
  });

  it('appends rather than overwriting a position', async () => {
    manager([item(1, true), item(2)]);
    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());

    await waitFor(() => expect(attach).toHaveBeenCalled());
    expect(attach.mock.calls[0]?.[1]).toMatchObject({ displayOrder: 3 });
  });

  it('offers a retry that does not make the operator find the file again', async () => {
    const { StorageUploadError } = await import('@/lib/api/endpoints/media');
    uploadToStorage.mockRejectedValueOnce(new StorageUploadError(500, 'nope'));
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());
    expect(await screen.findByRole('alert')).toBeTruthy();

    uploadToStorage.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(attach).toHaveBeenCalled());
  });

  it('never puts a raw exception on screen', async () => {
    uploadUrl.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:8080'));
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), jpeg());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).not.toMatch(/ECONNREFUSED|10\.0\.0\.4|8080/);
  });
});

describe('arranging', () => {
  it('sets a different photo as the primary one', async () => {
    manager([item(1, true), item(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Đặt ảnh 2 làm ảnh chính' }));

    // One request: the database holds "one cover per owner", so this never
    // clears-then-sets and the room is never briefly coverless.
    await waitFor(() => expect(setCover).toHaveBeenCalledWith('a-2', 'l-2'));
  });

  it('will not offer to re-cover the photo that is already the cover', () => {
    manager([item(1, true), item(2)]);
    const first = within(screen.getAllByRole('listitem')[0]!);
    expect(
      (first.getByRole('button', { name: /làm ảnh chính/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('moves a photo later by writing both positions', async () => {
    manager([item(1, true), item(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Chuyển ảnh 1 xuống sau' }));

    // Positions, not a swap: each link is told its new index outright.
    await waitFor(() => expect(setOrder).toHaveBeenCalledTimes(2));
    expect(setOrder).toHaveBeenCalledWith('a-1', 'l-1', 1);
    expect(setOrder).toHaveBeenCalledWith('a-2', 'l-2', 0);
  });

  it('cannot move the first photo earlier or the last one later', () => {
    manager([item(1, true), item(2)]);
    const items = screen.getAllByRole('listitem');

    expect(
      (within(items[0]!).getByRole('button', { name: /lên trước/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(items[1]!).getByRole('button', { name: /xuống sau/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('removes the placement, not the asset', async () => {
    manager([item(1, true), item(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh 2 khỏi phòng' }));

    // `media_link` has ON DELETE RESTRICT against the asset: detaching frees the
    // room, and the photograph stays in the partner's library.
    await waitFor(() => expect(detach).toHaveBeenCalledWith('a-2', 'l-2'));
  });

  it('revalidates the room’s pages after every change', async () => {
    manager([item(1, true), item(2)]);

    await userEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh 2 khỏi phòng' }));

    await waitFor(() => expect(revalidate).toHaveBeenCalledWith(PROPERTY, ROOM));
    expect(refresh).toHaveBeenCalled();
  });
});

/**
 * Uploading several photographs in one go.
 *
 * A room is not one picture, and picking them one at a time meant an operator
 * with nine bedroom photos performed the same four-step ritual nine times. The
 * gallery could always hold them; only the picker could not offer them.
 */
describe('uploading many at once', () => {
  /** Distinct ids per call, so a batch does not look like one asset uploaded twice. */
  function mintSequentially(): void {
    let n = 0;
    uploadUrl.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ mediaAssetId: `a-new-${n}`, uploadUrl: `https://r2.invalid/put/${n}` });
    });
    complete.mockImplementation((id: string) => Promise.resolve(asset(id)));
    attach.mockImplementation((id: string, body: { displayOrder: number }) =>
      Promise.resolve(link(`l-${id}`, id, body.displayOrder)),
    );
  }

  it('uploads every selected file, each through the full R2 flow', async () => {
    mintSequentially();
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [
      jpeg('one.jpg'),
      jpeg('two.jpg'),
      jpeg('three.jpg'),
    ]);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(3));
    // Three mints, three direct PUTs, three completes. Nothing is batched into a
    // single request the backend has no contract for.
    expect(uploadUrl).toHaveBeenCalledTimes(3);
    expect(uploadToStorage).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it('gives each photo its own position, in the order they were picked', async () => {
    mintSequentially();
    manager([item(1, true)]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('a.jpg'), jpeg('b.jpg')]);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
    // `items` has not been refetched mid-batch, so deriving each position from it
    // would give every file the same one — they would all claim slot 2.
    expect(attach.mock.calls[0]?.[1]).toMatchObject({ displayOrder: 2, ownerId: ROOM });
    expect(attach.mock.calls[1]?.[1]).toMatchObject({ displayOrder: 3, ownerId: ROOM });
  });

  it('attaches every photo to the same room type', async () => {
    mintSequentially();
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('a.jpg'), jpeg('b.jpg')]);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
    for (const call of attach.mock.calls) {
      expect(call[1]).toMatchObject({ ownerType: 'ROOM_TYPE', ownerId: ROOM });
    }
  });

  it('makes only the first of a batch the cover of an empty room', async () => {
    mintSequentially();
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('a.jpg'), jpeg('b.jpg')]);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
    // Otherwise the last file uploaded would silently become the cover — the
    // operator's choice, made by whichever file happened to be picked last.
    expect(setCover).toHaveBeenCalledTimes(1);
  });

  it('refetches once for the whole batch, not once per file', async () => {
    mintSequentially();
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [
      jpeg('a.jpg'),
      jpeg('b.jpg'),
      jpeg('c.jpg'),
    ]);

    await waitFor(() => expect(revalidate).toHaveBeenCalled());
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it('names every file and what happened to it', async () => {
    mintSequentially();
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('bed.jpg'), jpeg('bath.jpg')]);

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
    // The list stays after the batch: the run worth reading is the one where
    // something failed, and a list that clears itself cannot be read afterwards.
    expect(screen.getByText('bed.jpg')).toBeTruthy();
    expect(screen.getByText('bath.jpg')).toBeTruthy();
    expect(screen.getAllByText('Đã tải lên')).toHaveLength(2);
  });

  it('finishes the batch when one file fails, and says which', async () => {
    mintSequentially();
    const { StorageUploadError } = await import('@/lib/api/endpoints/media');
    uploadToStorage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new StorageUploadError(500))
      .mockResolvedValueOnce(undefined);
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [
      jpeg('one.jpg'),
      jpeg('two.jpg'),
      jpeg('three.jpg'),
    ]);

    // One unreadable file among three costs that file, not the other two.
    await waitFor(() => expect(attach).toHaveBeenCalledTimes(2));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('1/3');
    expect(screen.getByText(/Thất bại/)).toBeTruthy();
  });

  it('retries only the files that failed', async () => {
    mintSequentially();
    const { StorageUploadError } = await import('@/lib/api/endpoints/media');
    uploadToStorage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new StorageUploadError(500));
    manager([]);

    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('ok.jpg'), jpeg('bad.jpg')]);
    await screen.findByRole('alert');

    uploadToStorage.mockResolvedValue(undefined);
    const before = attach.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    // Exactly one more attach: the file that already landed is not sent again,
    // which would duplicate it in the gallery.
    await waitFor(() => expect(attach.mock.calls.length).toBe(before + 1));
  });

  it('refuses an unsupported file by name, and uploads the rest', async () => {
    mintSequentially();
    manager([]);

    const pdf = new File([new Uint8Array([1])], 'brochure.pdf', { type: 'application/pdf' });
    // applyAccept: false — the accept attribute filters the native picker, but a
    // drag-drop or an 'All files' pick still reaches onChange, which is the case
    // this guard exists for.
    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [jpeg('room.jpg'), pdf], {
      applyAccept: false,
    });

    await waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    // Named, not dropped. A picker that silently discards the file it did not
    // like is how a photograph goes missing without anyone noticing.
    expect(screen.getByText('brochure.pdf')).toBeTruthy();
    expect(screen.getByText(/định dạng không được hỗ trợ/)).toBeTruthy();
  });

  it('offers no retry for a file that can never succeed', async () => {
    manager([]);

    const pdf = new File([new Uint8Array([1])], 'brochure.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/Tải ảnh lên/), [pdf], { applyAccept: false });

    // A wrong type fails identically however many times it is sent, so a retry
    // button here would be a control that cannot work.
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(uploadUrl).not.toHaveBeenCalled();
  });

  it('will not start a second batch while one is running', async () => {
    // A holder rather than a bare `let`: the assignment happens inside a callback
    // TypeScript cannot see running, so it would narrow the variable to `never`.
    const held: { release: () => void } = { release: () => {} };
    uploadToStorage.mockImplementation(
      () => new Promise<void>((resolve) => { held.release = resolve; }),
    );
    manager([]);

    const input = screen.getByLabelText(/Tải ảnh lên/) as HTMLInputElement;
    await userEvent.upload(input, [jpeg('a.jpg'), jpeg('b.jpg')]);

    // Disabled while the batch runs: a second pick would interleave display
    // orders with the first and land photographs in an order nobody chose.
    await waitFor(() => expect(input.disabled).toBe(true));
    held.release();
  });
});
