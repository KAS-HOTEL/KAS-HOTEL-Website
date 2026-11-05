// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, PropertyCompleteness } from '@/lib/domain/property';
import type * as Primitives from '@/ui/primitives';

const publish = vi.fn();
const refresh = vi.fn();
const toastShow = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/api/endpoints', () => ({
  propertiesApi: { publish: (...args: unknown[]) => publish(...args) },
}));
vi.mock('./actions', () => ({ revalidateProperties: () => Promise.resolve() }));
vi.mock('@/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof Primitives>();
  return { ...actual, useToast: () => ({ show: toastShow, dismiss: vi.fn() }) };
});

const { PublishPanel } = await import('./PublishPanel');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';

function property(overrides: Partial<PropertyAdminView> = {}): PropertyAdminView {
  return {
    id: PROPERTY_ID,
    slug: 'hotel-alpha',
    names: { vi: 'Khách sạn Alpha', en: 'Alpha Hotel' },
    signatureLines: { vi: 'Một câu riêng' },
    shortDescriptions: { vi: 'Mô tả', en: 'Description' },
    amenityCodes: [],
    tripIntentCodes: [],
    lifecycleState: 'DRAFT',
    isFlagship: false,
    district: 'Quận 1',
    city: 'Ho Chi Minh City',
    sortOrder: 1,
    version: 4,
    ...overrides,
  };
}

const COMPLETE: PropertyCompleteness = {
  sections: [
    { name: 'Basic information', complete: true, missing: [] },
    { name: 'Location', complete: true, missing: [] },
  ],
  complete: true,
};

const INCOMPLETE: PropertyCompleteness = {
  sections: [
    { name: 'Basic information', complete: true, missing: [] },
    { name: 'Property images', complete: false, missing: ['hero image'] },
    { name: 'Signature experiences', complete: false, missing: ['at least one signature experience'] },
  ],
  complete: false,
};

function button() {
  return screen.getByRole('button', { name: 'Đưa vào hoạt động' });
}

afterEach(cleanup);
beforeEach(() => {
  publish.mockReset();
  refresh.mockReset();
  toastShow.mockReset();
});

describe('when the property is ready', () => {
  it('publishes with the version the server gave it', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN', version: 5 }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    await waitFor(() => expect(publish).toHaveBeenCalled());
    // Doc 58 §2 — without it, publishing could overwrite an edit never seen.
    expect(publish.mock.calls[0]).toEqual([PROPERTY_ID, { version: 4 }]);
  });

  it('lets the server say what happened, and re-reads it', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN', version: 5 }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    // Nothing is simulated locally: the panel refreshes and renders whatever the
    // server then reports.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toastShow).toHaveBeenCalledWith('success', expect.stringMatching(/hoạt động/));
  });

  it('says what activation does, without a raw state name in sight', () => {
    const { container } = render(<PublishPanel property={property()} completeness={COMPLETE} />);

    expect(screen.getByText(/hiển thị trên website/)).toBeTruthy();
    expect(screen.getByText(/gửi yêu cầu đặt phòng/)).toBeTruthy();
    // "OPEN" and "COMING_SOON" were both printed on this card. A hotelier is
    // not reading a lifecycle enum.
    expect(container.textContent).not.toMatch(/OPEN|COMING_SOON|DRAFT/);
  });

  it('never presents inventory or rates as blockers — OQ-101', () => {
    const { container } = render(
      <PublishPanel property={property()} completeness={COMPLETE} />,
    );

    // The ruling: they are business inputs for sellability, not conditions of
    // the lifecycle. A panel that listed them would invent a gate.
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(container.textContent).not.toMatch(/Còn thiếu/);
  });
});

describe('when the checklist is unmet', () => {
  it('disables the action and lists the server’s own blockers', () => {
    render(<PublishPanel property={property()} completeness={INCOMPLETE} />);

    expect(button().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('hero image')).toBeTruthy();
    expect(screen.getByText('at least one signature experience')).toBeTruthy();
  });

  it('does not call the endpoint', async () => {
    render(<PublishPanel property={property()} completeness={INCOMPLETE} />);

    await userEvent.click(button());

    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the readiness rules that the removed approval step never owned', () => {
    // Dropping the Admin approval dropped a workflow, not doc 52 §3.1. An
    // incomplete hotel is still refused, by the same checklist as before.
    render(<PublishPanel property={property({ lifecycleState: 'DRAFT' })} completeness={INCOMPLETE} />);

    expect(button().hasAttribute('disabled')).toBe(true);
  });

  it('lets the server decide when the checklist itself could not be read', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN' }));
    render(<PublishPanel property={property()} completeness={null} />);

    // This used to disable the button. A transient failure on a *supporting*
    // read then blocked the product's main action outright, for a hotel that
    // may well be publishable — and the endpoint re-runs the same check anyway,
    // so the worst case of trying is a refusal that names what is missing.
    expect(button().hasAttribute('disabled')).toBe(false);
    expect(screen.getByText(/Không đọc được tiến độ hồ sơ/)).toBeTruthy();

    await userEvent.click(button());
    await waitFor(() => expect(publish).toHaveBeenCalled());
  });
});

describe('when the server refuses', () => {
  it('shows the refusal and the fields it named', async () => {
    publish.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'Another published property already uses this signature line.',
      details: [{ field: 'signatureLines.vi', code: 'DUPLICATE', message: 'Đã được dùng.' }],
      correlationId: 'corr-1',
    }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('signature line');
    expect(alert.textContent).toContain('signatureLines.vi');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports a version conflict rather than pretending it published', async () => {
    publish.mockRejectedValue(new ApiError(409, {
      code: 'VERSION_CONFLICT',
      message: 'Property was changed by someone else.',
      details: [],
      correlationId: 'corr-2',
    }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(toastShow).not.toHaveBeenCalled();
  });
});

describe('the server’s blockers are actionable', () => {
  it('shows the message the server sent, not just the field name', async () => {
    // The backend explains how to clear each blocker. Showing only the field
    // name left a Partner with a checklist item and nothing to do about it.
    publish.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'This property is not yet complete enough to publish.',
      details: [{
        field: 'at least one published room type',
        code: 'REQUIRED',
        message: 'Room types are published when the property is put into operation.',
      }],
      correlationId: 'corr-9',
    }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('at least one published room type');
    expect(alert.textContent).toContain('put into operation');
  });

  it('points every known blocker at the screen that fixes it', async () => {
    render(
      <PublishPanel
        property={property()}
        completeness={{
          complete: false,
          sections: [
            { name: 'Room types', complete: false, missing: ['at least one room type'] },
            { name: 'Property images', complete: false, missing: ['hero image'] },
            { name: 'Basic information', complete: false, missing: ['signatureLine'] },
          ],
        }}
      />,
    );

    const href = (name: string) =>
      screen.getByRole('link', { name }).getAttribute('href');

    expect(href('Mở Loại phòng')).toBe(`/partner/properties/${PROPERTY_ID}/rooms`);
    expect(href('Mở Hình ảnh')).toBe(`/partner/properties/${PROPERTY_ID}/media`);
    expect(href('Mở Thông tin khách sạn'))
      .toBe(`/partner/properties/${PROPERTY_ID}/information`);
  });

  it('offers no link for a blocker it does not recognise', async () => {
    // An unmapped label renders no link rather than a guess, so the checklist
    // stays honest if the backend ever adds a section.
    publish.mockRejectedValue(new ApiError(400, {
      code: 'VALIDATION_FAILED',
      message: 'Refused.',
      details: [{ field: 'tax registration', code: 'REQUIRED', message: 'Missing.' }],
      correlationId: 'corr-11',
    }));
    render(<PublishPanel property={property()} completeness={COMPLETE} />);

    await userEvent.click(button());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('tax registration');
    expect(alert.querySelector('a')).toBeNull();
  });

  it('still invents no publishability rule of its own', () => {
    // The published-room-type invariant lives in the backend. This panel enables
    // the button from the server's completeness alone and learns the rest from
    // the server's refusal — it does not re-derive the rule from room data.
    const { container } = render(
      <PublishPanel property={property()} completeness={COMPLETE} />,
    );

    expect(button().hasAttribute('disabled')).toBe(false);
    expect(container.textContent).not.toMatch(/DRAFT|PUBLISHED/);
  });
});

describe('the other lifecycle states', () => {
  it('activates a DRAFT hotel directly — there is no approval step in V1', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN' }));
    render(<PublishPanel property={property({ lifecycleState: 'DRAFT' })} completeness={COMPLETE} />);

    // This card used to refuse anything but COMING_SOON and tell the Partner to
    // get the hotel approved first. With one partner scope and no Admin in the
    // V1 flow, that was asking the operator to submit a hotel to themselves.
    await userEvent.click(button());

    await waitFor(() => expect(publish).toHaveBeenCalledWith(PROPERTY_ID, { version: 4 }));
  });

  it('still activates an approved hotel, so the review path keeps working', async () => {
    publish.mockResolvedValue(property({ lifecycleState: 'OPEN' }));
    render(
      <PublishPanel property={property({ lifecycleState: 'COMING_SOON' })} completeness={COMPLETE} />,
    );

    await userEvent.click(button());

    await waitFor(() => expect(publish).toHaveBeenCalled());
  });

  it('reports an already-open hotel, and points at what is left to sell', () => {
    render(<PublishPanel property={property({ lifecycleState: 'OPEN' })} completeness={COMPLETE} />);

    expect(screen.queryByRole('button', { name: 'Đưa vào hoạt động' })).toBeNull();
    expect(screen.getByText('Đang hoạt động')).toBeTruthy();
    // Inventory and rates are not activation blockers, but they are what makes
    // an open hotel actually sellable — so this is where they are mentioned.
    expect(screen.queryByRole('link', { name: 'Tồn phòng' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Giá' })).toBeTruthy();
  });

  it('offers nothing on a withdrawn hotel, and names the state in words', () => {
    render(
      <PublishPanel
        property={property({ lifecycleState: 'TEMPORARILY_CLOSED' })}
        completeness={COMPLETE}
      />,
    );

    // Reopening is a different decision with no endpoint behind it, so there is
    // no button — and no raw enum standing in for the explanation.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Tạm ngưng')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/TEMPORARILY_CLOSED/);
  });
});
