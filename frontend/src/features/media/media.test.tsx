// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import {
  coverOf,
  galleryOrder,
  nextDisplayOrder,
  type GalleryItem,
  type MediaAssetView,
  type MediaLinkView,
} from '@/lib/domain/media';
import type * as MediaEndpoints from '@/lib/api/endpoints/media';
import type * as Primitives from '@/ui/primitives';

const library = vi.fn();
const usages = vi.fn();
const register = vi.fn();
const uploadUrl = vi.fn();
const complete = vi.fn();
const uploadToStorage = vi.fn();
const attach = vi.fn();
const setCover = vi.fn();
const detach = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  mediaApi: {
    library: (...a: unknown[]) => library(...a),
    usages: (...a: unknown[]) => usages(...a),
    register: (...a: unknown[]) => register(...a),
    uploadUrl: (...a: unknown[]) => uploadUrl(...a),
    complete: (...a: unknown[]) => complete(...a),
    attach: (...a: unknown[]) => attach(...a),
    setCover: (...a: unknown[]) => setCover(...a),
    detach: (...a: unknown[]) => detach(...a),
  },
}));
vi.mock('@/lib/api/endpoints/media', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaEndpoints>();
  return { ...actual, uploadToStorage: (...a: unknown[]) => uploadToStorage(...a) };
});
vi.mock('./actions', () => ({ revalidateGallery: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { StorageUploadError, uploadToStorage: realUploadToStorage } =
  await vi.importActual<typeof MediaEndpoints>('@/lib/api/endpoints/media');
const { PropertyMediaManager } = await import('./PropertyMediaManager');
const { loadPropertyGallery } = await import('./load');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const OTHER_PROPERTY = '22222222-2222-4222-8222-222222222222';

function asset(id: string, overrides: Partial<MediaAssetView> = {}): MediaAssetView {
  return {
    id,
    mimeType: 'image/jpeg',
    category: 'EXTERIOR',
    width: 2400,
    height: 1600,
    sizeBytes: 840_000,
    status: 'DRAFT',
    // The delivery URL the admin surface gained in STEP H, so a Partner can see
    // the photograph they are arranging rather than a list of ids.
    url: `https://media.kas.invalid/m/${id}`,
    ...overrides,
  };
}

function link(id: string, assetId: string, overrides: Partial<MediaLinkView> = {}): MediaLinkView {
  return {
    id,
    mediaAssetId: assetId,
    ownerType: 'PROPERTY',
    ownerId: PROPERTY,
    displayOrder: 0,
    isCover: false,
    status: 'DRAFT',
    ...overrides,
  };
}

function item(n: number, overrides: Partial<MediaLinkView> = {}): GalleryItem {
  const assetId = `aaaaaaaa-0000-4000-8000-00000000000${n}`;
  return { asset: asset(assetId), link: link(`bbbbbbbb-0000-4000-8000-00000000000${n}`, assetId, overrides) };
}

afterEach(cleanup);
beforeEach(() => {
  for (const fn of [library, usages, register, uploadUrl, complete, uploadToStorage,
                    attach, setCover, detach, refresh, toastShow]) {
    fn.mockReset();
  }
});

describe('the gallery ordering', () => {
  it('puts the cover first, then display order', () => {
    const ordered = galleryOrder([
      item(1, { displayOrder: 2 }),
      item(2, { displayOrder: 5, isCover: true }),
      item(3, { displayOrder: 1 }),
    ]);

    // The cover is the one placement the publish checklist asks about, so a
    // Partner scanning the screen should not have to hunt for it.
    expect(ordered.map((i) => i.link.displayOrder)).toEqual([5, 1, 2]);
  });

  it('reports the cover, or that there is none', () => {
    expect(coverOf([item(1), item(2, { isCover: true })])?.link.displayOrder).toBe(0);
    expect(coverOf([item(1), item(2)])).toBeNull();
  });

  it('numbers a new attachment past every existing one', () => {
    expect(nextDisplayOrder([])).toBe(0);
    expect(nextDisplayOrder([item(1, { displayOrder: 0 }), item(2, { displayOrder: 4 })])).toBe(5);
  });
});

describe('the loader', () => {
  it('keeps only the links that belong to this property', async () => {
    library.mockResolvedValue([asset('a1'), asset('a2'), asset('a3')]);
    usages.mockImplementation((id: string) => {
      if (id === 'a1') return Promise.resolve([link('l1', 'a1')]);
      if (id === 'a2') return Promise.resolve([link('l2', 'a2', { ownerId: OTHER_PROPERTY })]);
      return Promise.resolve([link('l3', 'a3', { ownerType: 'ROOM_TYPE' })]);
    });

    const result = await loadPropertyGallery(PROPERTY, 'cookie');

    // Another property's placement and a room-type placement are both real links
    // on assets this partner owns — neither belongs on this screen.
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.items.map((i) => i.link.id)).toEqual(['l1']);
    expect(result.library).toHaveLength(3);
  });

  it('names the owner, which the endpoint requires', async () => {
    library.mockResolvedValue([asset('a1')]);
    usages.mockResolvedValue([]);

    await loadPropertyGallery(PROPERTY, 'cookie');

    // `GET /{assetId}/usages` takes `ownerType` and `ownerId` as *required*
    // query parameters — it reads one owner's links and keeps this asset's.
    // Omitting them is a 400, which reached the screen as a generic error the
    // first time this ran against the real backend.
    expect(usages.mock.calls[0]).toEqual(['a1', 'PROPERTY', PROPERTY, 'cookie']);
  });

  it('does not call the backend for a malformed id', async () => {
    const result = await loadPropertyGallery('not-a-uuid');

    expect(result).toEqual({ status: 'ok', items: [], library: [] });
    expect(library).not.toHaveBeenCalled();
  });

  it('surfaces a backend failure as an error', async () => {
    library.mockRejectedValue(new ApiError(500, {
      code: 'INTERNAL_ERROR', message: 'boom', details: [], correlationId: 'c1',
    }));

    expect((await loadPropertyGallery(PROPERTY)).status).toBe('error');
  });
});

describe('the hero image state', () => {
  it('says the requirement is unmet when nothing is the cover', () => {
    render(<PropertyMediaManager propertyId={PROPERTY} items={[item(1)]} library={[]} />);

    // The cover is shown as a photograph now, so "no cover" is a stated absence
    // where a preview would be, not a badge beside a UUID.
    expect(screen.getByText('Chưa chọn ảnh đại diện')).toBeTruthy();
    expect(screen.getByText(/Bắt buộc trước khi mở bán/)).toBeTruthy();
  });

  it('says it is met once a cover exists', () => {
    render(
      <PropertyMediaManager propertyId={PROPERTY} items={[item(1, { isCover: true })]} library={[]} />,
    );

    expect(screen.getByText(/Ảnh này dẫn trang khách sạn/)).toBeTruthy();
    // Scoped to the gallery tile: "Ảnh đại diện" is also the section heading,
    // and an unscoped match would pass on the heading alone without the tile
    // ever being marked.
    const entry = screen.getByRole('listitem');
    expect(within(entry).getByText('Ảnh đại diện')).toBeTruthy();
    // And the cover itself is rendered as the picture it is.
    expect(screen.getByAltText('Ảnh đại diện khách sạn')).toBeTruthy();
  });

  it('cannot re-set the cover on the image that already is one', () => {
    render(
      <PropertyMediaManager propertyId={PROPERTY} items={[item(1, { isCover: true })]} library={[]} />,
    );

    // Disabled rather than absent: the four tile actions are a fixed grid, and
    // removing one would shift the other three under the pointer between tiles.
    const button = screen.getByRole('button', { name: 'Đặt ảnh 1 làm ảnh đại diện' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('adding an image', () => {
  it('uploads the file to storage and attaches the finished asset', async () => {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y?X-Amz-Expires=600',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
    uploadToStorage.mockResolvedValue(undefined);
    complete.mockResolvedValue(asset('new-asset'));
    attach.mockResolvedValue(link('new-link', 'new-asset'));
    render(
      <PropertyMediaManager
        propertyId={PROPERTY}
        items={[item(1, { displayOrder: 3 })]}
        library={[]}
      />,
    );

    await userEvent.upload(screen.getByLabelText(/Chọn tệp ảnh/), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    // Doc 62 §4, in order: mint, PUT, confirm, then place it.
    await waitFor(() => expect(attach).toHaveBeenCalled());
    expect(uploadUrl.mock.calls[0]).toEqual([{ mimeType: 'image/png', category: 'EXTERIOR' }, { ownerType: 'PROPERTY', ownerId: PROPERTY }]);
    expect(uploadToStorage.mock.calls[0]?.[0])
      .toBe('https://storage.invalid/p/x/y?X-Amz-Expires=600');
    expect(complete.mock.calls[0]).toEqual(['new-asset']);
    // Past every existing placement, so it collides with none of them.
    expect(attach.mock.calls[0]).toEqual([
      'new-asset',
      { ownerType: 'PROPERTY', ownerId: PROPERTY, displayOrder: 4 },
    ]);
  });

  it('sends the bytes to storage and never to the backend', async () => {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
    uploadToStorage.mockResolvedValue(undefined);
    complete.mockResolvedValue(asset('new-asset'));
    attach.mockResolvedValue(link('new-link', 'new-asset'));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    const file = pngFile();
    await userEvent.upload(screen.getByLabelText(/Chọn tệp ảnh/), file);
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    await waitFor(() => expect(uploadToStorage).toHaveBeenCalled());
    // Doc 62 §4: "the application server never proxies image bytes". The file
    // goes to the signed URL; every KAS request carries only identifiers.
    expect(uploadToStorage.mock.calls[0]?.[1]).toBe(file);
    expect(JSON.stringify(uploadUrl.mock.calls[0])).not.toContain('data:');
    expect(complete.mock.calls[0]).toEqual(['new-asset']);
  });

  it('never asks for the new image to be the cover', async () => {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
    uploadToStorage.mockResolvedValue(undefined);
    complete.mockResolvedValue(asset('new-asset'));
    attach.mockResolvedValue(link('new-link', 'new-asset'));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    await userEvent.upload(screen.getByLabelText(/Chọn tệp ảnh/), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    // `AttachMediaRequest` has no cover field and `is_cover` defaults false, so a
    // first attachment must not silently become the hero image. Choosing it is a
    // separate, deliberate act.
    await waitFor(() => expect(attach).toHaveBeenCalled());
    expect(Object.keys(attach.mock.calls[0]?.[1] as object)).toEqual([
      'ownerType', 'ownerId', 'displayOrder',
    ]);
    expect(setCover).not.toHaveBeenCalled();
  });

  it('sends the chosen category and the file’s own type', async () => {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
    uploadToStorage.mockResolvedValue(undefined);
    complete.mockResolvedValue(asset('new-asset'));
    attach.mockResolvedValue(link('new-link', 'new-asset'));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    await userEvent.selectOptions(document.getElementById('media-category') as HTMLSelectElement, 'DINING');
    await userEvent.upload(
      screen.getByLabelText(/Chọn tệp ảnh/),
      new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'a.webp', { type: 'image/webp' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    // The type comes from the file, not a dropdown: the browser knows what was
    // picked, and the signature binds that type at storage.
    await waitFor(() => expect(uploadUrl).toHaveBeenCalled());
    expect(uploadUrl.mock.calls[0]).toEqual([{ mimeType: 'image/webp', category: 'DINING' }, { ownerType: 'PROPERTY', ownerId: PROPERTY }]);
  });

  it('will not even select a type outside the allowlist', async () => {
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    const input = screen.getByLabelText(/Chọn tệp ảnh/) as HTMLInputElement;
    await userEvent.upload(input, new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));

    // SVG is an XML document that can carry script. `accept` keeps it out of the
    // control, so the file is never chosen and the button stays disabled — the
    // request is not merely refused, it is never composed. `isSupported` in the
    // component is the second lock, for a file that arrives some other way, and
    // the backend's type allowlist plus magic-byte check is the third.
    expect(input.files?.length ?? 0).toBe(0);
    expect((screen.getByRole('button', { name: 'Tải ảnh lên' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(uploadUrl).not.toHaveBeenCalled();
  });

  it('reports a storage failure and does not claim the image arrived', async () => {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
    uploadToStorage.mockRejectedValue(new StorageUploadError(403));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    await userEvent.upload(screen.getByLabelText(/Chọn tệp ảnh/), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    // A failed PUT must not be followed by complete or attach — otherwise the
    // library would hold a record of an image that is not there.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(complete).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });

  it('attaches an asset already in the library without registering a second one', async () => {
    attach.mockResolvedValue(link('new-link', 'spare'));
    render(
      <PropertyMediaManager propertyId={PROPERTY} items={[]} library={[asset('spare')]} />,
    );

    await userEvent.selectOptions(screen.getByLabelText(/Ảnh có sẵn/), 'spare');
    await userEvent.click(screen.getByRole('button', { name: 'Gắn ảnh có sẵn' }));

    await waitFor(() => expect(attach).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
    expect(attach.mock.calls[0]?.[0]).toBe('spare');
  });

  it('does not offer an asset that is already on this property', () => {
    const placed = item(1);
    render(
      <PropertyMediaManager
        propertyId={PROPERTY}
        items={[placed]}
        library={[placed.asset, asset('spare')]}
      />,
    );

    const options = screen.getByLabelText(/Ảnh có sẵn/).querySelectorAll('option');
    const values = [...options].map((o) => o.getAttribute('value'));
    expect(values).not.toContain(placed.asset.id);
    expect(values).toContain('spare');
  });
});

describe('choosing and removing', () => {
  it('sets the cover with one request, naming asset and link', async () => {
    setCover.mockResolvedValue(link('bbbbbbbb-0000-4000-8000-000000000001', 'x', { isCover: true }));
    const only = item(1);
    render(<PropertyMediaManager propertyId={PROPERTY} items={[only]} library={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Đặt ảnh 1 làm ảnh đại diện' }));

    // The database holds `UNIQUE (owner_type, owner_id) WHERE is_cover`, so this
    // is never a clear-then-set pair and the property is never coverless midway.
    await waitFor(() => expect(setCover).toHaveBeenCalled());
    expect(setCover.mock.calls[0]).toEqual([only.asset.id, only.link.id]);
    expect(refresh).toHaveBeenCalled();
  });

  it('detaches the placement, not the asset', async () => {
    detach.mockResolvedValue(undefined);
    const only = item(1);
    render(<PropertyMediaManager propertyId={PROPERTY} items={[only]} library={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh 1 khỏi khách sạn' }));

    await waitFor(() => expect(detach).toHaveBeenCalled());
    expect(detach.mock.calls[0]).toEqual([only.asset.id, only.link.id]);
  });

  it('shows the backend’s refusal and does not claim success', async () => {
    setCover.mockRejectedValue(new ApiError(404, {
      code: 'NOT_FOUND', message: 'Media link not found.', details: [], correlationId: 'c2',
    }));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[item(1)]} library={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Đặt ảnh 1 làm ảnh đại diện' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(toastShow).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('what this screen does and does not offer', () => {
  it('accepts a file, and only the allowlisted types', () => {
    const { container } = render(
      <PropertyMediaManager propertyId={PROPERTY} items={[item(1)]} library={[]} />,
    );

    // Step 16A.49 closed OQ-106, so the control exists. `accept` is the four
    // raster types the backend allows — SVG is excluded because it is an XML
    // document that can carry script.
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');
    expect(input?.getAttribute('accept')).not.toContain('svg');
  });

  it('offers no descriptor-only registration, which would make a byte-less cover', () => {
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    // `POST /admin/media` still exists for the doc 62 §3 folder import, but a
    // Partner reaching it here could set a cover with nothing behind it: the
    // publish checklist would pass and the guest page would show nothing.
    expect(screen.queryByRole('button', { name: 'Thêm ảnh mới' })).toBeNull();
    expect(screen.getByLabelText('URL ảnh')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm và xuất bản ảnh URL' })).toBeTruthy();
  });

  it('renders no image element for a placement that has no file', () => {
    // `url` is null when no delivery base URL is configured for the deployment.
    const one = item(1, { isCover: true });
    const withoutFile: GalleryItem = { asset: { ...one.asset, url: null }, link: one.link };
    const { container } = render(
      <PropertyMediaManager propertyId={PROPERTY} items={[withoutFile]} library={[]} />,
    );

    // A broken <img> would read as a failure of this screen rather than an
    // absent capability. The tile says so in words instead.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getAllByText(/Không có bản xem trước|Chưa cấu hình đường dẫn ảnh/).length)
      .toBeGreaterThan(0);
  });
});

/**
 * A real PNG header in a real `File`.
 *
 * The bytes matter: the backend's magic-byte check is what makes an upload
 * trustworthy, and a fixture of `['x']` would pass here while failing there.
 */
function pngFile(): File {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([header], 'rooftop.png', { type: 'image/png' });
}

describe('a failed direct upload says which failure it was', () => {
  function mintOk() {
    uploadUrl.mockResolvedValue({
      uploadUrl: 'https://storage.invalid/p/x/y',
      mediaAssetId: 'new-asset',
      expiresAt: '2026-09-03T12:00:00Z',
    });
  }

  async function attemptUpload() {
    await userEvent.upload(screen.getByLabelText(/Chọn tệp ảnh/), pngFile());
    await userEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));
    return screen.findByRole('alert');
  }

  it('names a refused preflight as a storage configuration problem', async () => {
    mintOk();
    // `fetch` rejecting rather than resolving is what a blocked CORS preflight
    // looks like from JavaScript — the browser never let the request be sent.
    uploadToStorage.mockRejectedValue(new StorageUploadError(null));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    const alert = await attemptUpload();

    // The Partner cannot fix a bucket policy, so the message says who can. The
    // old text — "Không thực hiện được." — was true of every possible failure
    // and therefore useless for diagnosing this one.
    expect(alert.textContent).toContain('CORS');
    expect(alert.textContent).toContain('quản trị hệ thống');
    expect(alert.textContent).not.toBe('Không thực hiện được.');
  });

  it('reports the status when storage answered and refused', async () => {
    mintOk();
    uploadToStorage.mockRejectedValue(new StorageUploadError(403));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    const alert = await attemptUpload();

    // A status means storage was reachable and said no — usually an expired URL,
    // which retrying fixes. Different failure, different advice.
    expect(alert.textContent).toContain('403');
    expect(alert.textContent).toContain('thử tải lên lại');
    expect(alert.textContent).not.toContain('CORS');
  });

  it('discloses no bucket, endpoint or credential in either message', async () => {
    mintOk();
    uploadToStorage.mockRejectedValue(new StorageUploadError(403));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    const alert = await attemptUpload();

    // The status is a number; doc 62 §6 keeps everything else about storage off
    // any surface a person sees.
    expect(alert.textContent).not.toMatch(/bucket|r2|cloudflare|amz|secret|accesskey/i);
  });

  it('leaves the library untouched when the upload never lands', async () => {
    mintOk();
    uploadToStorage.mockRejectedValue(new StorageUploadError(null));
    render(<PropertyMediaManager propertyId={PROPERTY} items={[]} library={[]} />);

    await attemptUpload();

    // This is what the real failure looked like: upload-url had already created
    // the asset row, and neither complete nor attach ever ran.
    expect(complete).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    expect(toastShow).not.toHaveBeenCalled();
  });
});

describe('uploadToStorage', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('turns a rejected fetch into a no-status StorageUploadError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    // A blocked preflight, an offline browser and an unresolvable host all
    // surface this way: no response object at all.
    const failure = await realUploadToStorage('https://storage.invalid/k', pngFile())
      .then(() => null, (e: unknown) => e);

    expect(failure).toBeInstanceOf(StorageUploadError);
    expect((failure as InstanceType<typeof StorageUploadError>).status).toBeNull();
  });

  it('carries the status when storage answers with one', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response);

    const failure = await realUploadToStorage('https://storage.invalid/k', pngFile())
      .then(() => null, (e: unknown) => e);

    expect((failure as InstanceType<typeof StorageUploadError>).status).toBe(403);
  });

  it('sends the file with the content type the URL was signed for, and no cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    globalThis.fetch = fetchMock;
    const file = pngFile();

    await realUploadToStorage('https://storage.invalid/k', file);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://storage.invalid/k');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
    // Never `include`: the signed URL is its own authorisation and this origin is
    // not KAS. The platform default sends nothing cross-origin.
    expect(init.credentials).toBeUndefined();
  });
});
