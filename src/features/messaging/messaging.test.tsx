// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Endpoints from '@/lib/api/endpoints';
import type * as Primitives from '@/ui/primitives';
import type { ConversationFilters } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type {
  ConversationPage,
  ConversationSummary,
  ConversationThread,
  MessageTemplate,
} from '@/lib/domain/conversation';

const previewApi = vi.fn();
const recordApi = vi.fn();
const inboxApi = vi.fn();
const refresh = vi.fn();
const toast = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@/lib/api/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof Endpoints>()),
  conversationsApi: {
    inbox: (...a: unknown[]) => inboxApi(...a),
    preview: (...a: unknown[]) => previewApi(...a),
    record: (...a: unknown[]) => recordApi(...a),
  },
}));

vi.mock('@/ui/primitives', async (importOriginal) => ({
  ...(await importOriginal<typeof Primitives>()),
  useToast: () => ({ show: toast }),
}));

const { ConversationList, CONVERSATION_LIST_COPY } = await import('./ConversationList');
const { ConversationView, CONVERSATION_VIEW_COPY } = await import('./ConversationView');
const { MessageComposer, COMPOSER_COPY } = await import('./MessageComposer');
const { AutomationLog, AUTOMATION_LOG_COPY } = await import('./AutomationLog');
const {
  ConversationFilterBar,
  CONVERSATION_FILTER_COPY,
  filtersFromSearchParams,
  inboxHref,
} = await import('./ConversationFilterBar');
const { loadInbox, loadThread } = await import('./load');
const { InboxShell } = await import('@/app/partner/(protected)/messages/InboxShell');

const PROPERTIES = [
  { slug: 'kas-elegance-hotel', label: 'KAS Elegance' },
  { slug: 'kas-riverside', label: 'KAS Riverside' },
];

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    reference: 'KAS-260908-CA9W',
    guestName: 'Nguyễn Văn An',
    guestPhone: '0901234567',
    guestEmail: 'an.nguyen@example.com',
    propertySlug: 'kas-elegance-hotel',
    propertyName: 'KAS Elegance',
    channelType: 'DIRECT',
    checkIn: '2026-09-20',
    checkOut: '2026-09-22',
    lastMessagePreview: 'Chào anh An, phòng đã sẵn sàng.',
    lastMessageAt: '2026-09-09T10:42:00Z',
    lastMessageAutomated: false,
    messageCount: 2,
    ...overrides,
  };
}

function page(overrides: Partial<ConversationPage> = {}): ConversationPage {
  return { items: [conversation()], page: 0, size: 20, total: 1, ...overrides };
}

function thread(overrides: Partial<ConversationThread> = {}): ConversationThread {
  return {
    subject: {
      reference: 'KAS-260908-CA9W',
      guestName: 'Nguyễn Văn An',
      guestPhone: '0901234567',
      guestEmail: 'an.nguyen@example.com',
      propertySlug: 'kas-elegance-hotel',
      propertyName: 'KAS Elegance',
      channelType: 'DIRECT',
      checkIn: '2026-09-20',
      checkOut: '2026-09-22',
      nights: 2,
      adults: 2,
      children: 0,
      rooms: 1,
    },
    messages: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        body: 'Chào anh An, phòng đã sẵn sàng.',
        locale: 'vi',
        createdAt: '2026-09-09T10:42:00Z',
        sentAt: null,
        automated: false,
        templateName: null,
      },
    ],
    deliveryChannel: 'IN_KAS',
    ...overrides,
  };
}

function template(overrides: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Nhắc nhận phòng',
    body: 'Xin chào {{guestName}}.',
    locale: 'vi',
    trigger: 'MANUAL',
    leadDays: null,
    enabled: true,
    propertySlug: null,
    propertyName: null,
    variables: ['guestName'],
    createdAt: '2026-09-09T09:00:00Z',
    updatedAt: '2026-09-09T09:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  previewApi.mockReset();
  recordApi.mockReset();
  inboxApi.mockReset();
  refresh.mockReset();
  toast.mockReset();
  cleanup();
});

// ---------------------------------------------------------------- URL state

describe('reading inbox filters out of the URL', () => {
  it('treats an absent or empty parameter as no filter', () => {
    expect(filtersFromSearchParams({})).toEqual({});
    expect(filtersFromSearchParams({ q: '', property: '', channelType: '' })).toEqual({});
  });

  it('reads every filter the backend accepts, and no more', () => {
    expect(
      filtersFromSearchParams({
        q: 'An',
        property: 'kas-elegance-hotel',
        channelType: 'DIRECT',
        page: '2',
        size: '10',
        // There is no unread state in this domain, so there is nothing to read.
        unread: 'true',
      }),
    ).toEqual({
      q: 'An',
      property: 'kas-elegance-hotel',
      channelType: 'DIRECT',
      page: 2,
      size: 10,
    });
  });

  it('builds a conversation link that keeps the filters', () => {
    expect(inboxHref({ q: 'An', channelType: 'DIRECT' }, 'KAS-260908-CA9W')).toBe(
      '/partner/messages/KAS-260908-CA9W?q=An&channelType=DIRECT',
    );
    // Page 0 is the canonical first page and carries no parameter.
    expect(inboxHref({ q: 'An', page: 0 })).toBe('/partner/messages?q=An');
    expect(inboxHref({}, 'KAS-260908-CA9W')).toBe('/partner/messages/KAS-260908-CA9W');
  });
});

describe('the filter bar', () => {
  function bar(active: ConversationFilters = {}) {
    return render(
      <ConversationFilterBar
        active={active}
        properties={PROPERTIES}
        copy={CONVERSATION_FILTER_COPY}
      />,
    );
  }

  it('is a GET form, so the URL becomes the state', () => {
    const { container } = bar();
    expect(container.querySelector('form')?.getAttribute('method')).toBe('get');
  });

  it('names every control after the backend parameter it sets', () => {
    bar();
    const names = Array.from(document.querySelectorAll('input[name], select[name]')).map((e) =>
      e.getAttribute('name'),
    );
    // Two visible controls. `channelType` has no widget on this screen any
    // more — an inbox is searched by guest and by hotel, not sorted by booking
    // channel while answering someone.
    expect(names).toEqual(['q', 'property']);
  });

  it('keeps a channel filter it was given, without offering one', () => {
    bar({ channelType: 'OTA' });

    // The parameter is still read, still submitted and still on the contract.
    // Without the hidden field a search from inside `?channelType=OTA` would
    // submit a form that omits it and silently drop the filter.
    const hidden = document.querySelector('input[type="hidden"][name="channelType"]');
    expect(hidden?.getAttribute('value')).toBe('OTA');
    expect(screen.queryByLabelText(/Kênh/)).toBeNull();
  });

  it('shows the active filters as the controls own values', () => {
    bar({ q: 'An', property: 'kas-riverside', channelType: 'OTA' });
    const value = (label: string) =>
      (screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement).value;

    expect(value(CONVERSATION_FILTER_COPY.search)).toBe('An');
    expect(value(CONVERSATION_FILTER_COPY.property)).toBe('kas-riverside');
    // channelType is carried in a hidden field now — covered above.
  });

  it('offers no unread filter, because there is no unread state', () => {
    bar();
    expect(document.body.textContent ?? '').not.toMatch(/Chưa đọc|unread/i);
  });

  it('offers a clear link only when something is filtered', () => {
    bar();
    expect(screen.queryByText(CONVERSATION_FILTER_COPY.clear)).toBeNull();

    cleanup();
    bar({ q: 'An' });
    expect(screen.getByText(CONVERSATION_FILTER_COPY.clear).getAttribute('href')).toBe(
      '/partner/messages',
    );
  });
});

// ------------------------------------------------------------------- inbox

describe('the conversation list', () => {
  function list(conversations: readonly ConversationSummary[], active?: string) {
    return render(
      <ConversationList
        conversations={conversations}
        {...(active === undefined ? {} : { activeReference: active })}
        hrefFor={(reference) => `/partner/messages/${reference}`}
        copy={CONVERSATION_LIST_COPY}
      />,
    );
  }

  it('renders the real conversation with its reservation context', () => {
    list([conversation()]);

    // Four tiers: who, which booking, when they stay, what was last said.
    expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
    expect(screen.getByText('KAS-260908-CA9W')).toBeTruthy();
    expect(screen.getByText(/KAS Elegance/)).toBeTruthy();
    // Dates as an operator writes them. `2026-09-20` is the wire form, and a
    // rail 300px wide spent its third line on a format nobody says out loud.
    expect(screen.getByText('20/09/2026 → 22/09/2026')).toBeTruthy();
    expect(screen.queryByText(/2026-09-20/)).toBeNull();
    expect(screen.getByText('Chào anh An, phòng đã sẵn sàng.')).toBeTruthy();
  });

  it('drops the rows an inbox does not need to show', () => {
    list([conversation()]);

    // The message count and the channel badge were rows of their own on every
    // card; the phone number was repeated once per row down the column. All
    // three are in the conversation's own header, one click away.
    expect(screen.queryByText('2 tin nhắn')).toBeNull();
    expect(screen.queryByText('0901234567')).toBeNull();
    expect(screen.queryByText('Trực tiếp')).toBeNull();
  });

  it('renders no underlined metadata, though the row is one link', () => {
    list([conversation()]);

    // The row is a Link, so without an explicit rule every line inside it —
    // name, reference, hotel, dates, preview — carried the browser's default
    // underline and read as five separate links.
    const link = screen.getByRole('link');
    expect(link.className).toMatch(/listItem/);
    for (const node of link.querySelectorAll('span, time')) {
      expect(getComputedStyle(node).textDecorationLine).not.toBe('underline');
    }
  });

  it('marks the open conversation accessibly, not by colour alone', () => {
    list([conversation()], 'KAS-260908-CA9W');
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-current')).toBe('true');
  });

  it('renders without a phone, whether or not the server sent one', () => {
    // The number is a contact action and belongs where you would act on it —
    // the conversation header — not on every row of the list. The row must
    // render identically either way rather than leaving a gap.
    list([conversation()]);
    expect(screen.queryByText('0901234567')).toBeNull();
    const withPhone = screen.getByRole('link').textContent;

    cleanup();
    list([conversation({ guestPhone: null })]);
    expect(screen.getByRole('link').textContent).toBe(withPhone);
  });

  it("marks an automated last message, in the preview rather than on a badge", () => {
    list([conversation({ lastMessageAutomated: true })]);
    // Who wrote the newest message now prefixes the preview, where a sender
    // name goes in any inbox, instead of occupying a badge row of its own.
    expect(screen.getByText(new RegExp(`^${CONVERSATION_LIST_COPY.automated}:`))).toBeTruthy();
  });

  it('shows no unread badge, because nothing can be unread', () => {
    list([conversation()]);
    expect(document.body.textContent ?? '').not.toMatch(/Chưa đọc/);
  });

  it('says the inbox is empty without inventing a conversation', () => {
    list([]);
    expect(screen.getByText(CONVERSATION_LIST_COPY.emptyTitle)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/KAS-\d/);
  });

  it('distinguishes a page past the end from an empty inbox', () => {
    render(
      <ConversationList
        conversations={[]}
        pastEnd
        hrefFor={(reference) => `/partner/messages/${reference}`}
        copy={CONVERSATION_LIST_COPY}
      />,
    );
    expect(screen.getByText(CONVERSATION_LIST_COPY.pastEndTitle)).toBeTruthy();
    expect(screen.queryByText(CONVERSATION_LIST_COPY.emptyTitle)).toBeNull();
  });
});

// ------------------------------------------------------------ conversation

describe('the conversation view', () => {
  function view(data = thread()) {
    return render(
      <ConversationView
        thread={data}
        templates={[]}
        backHref="/partner/messages"
        copy={CONVERSATION_VIEW_COPY}
      />,
    );
  }

  it('shows the real guest, reservation and stay context', () => {
    view();
    expect(screen.getByText('Nguyễn Văn An')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'KAS-260908-CA9W' }).getAttribute('href')).toBe(
      '/partner/reservations/KAS-260908-CA9W',
    );
    // Booking then stay, two muted lines under the name, instead of the five
    // labelled rows that restated the inbox row the operator just clicked.
    expect(screen.getByText(/KAS Elegance/)).toBeTruthy();
    expect(screen.getByText(/20\/09\/2026 → 22\/09\/2026/)).toBeTruthy();
    expect(screen.queryByText(/2026-09-20/)).toBeNull();
    // And the labels those rows carried are gone with them.
    expect(screen.queryByText('Kỳ nghỉ')).toBeNull();
    expect(screen.queryByText('Khách sạn')).toBeNull();
  });

  it('renders the real message history', () => {
    view();
    expect(screen.getByText('Chào anh An, phòng đã sẵn sàng.')).toBeTruthy();
    // A clock in the property own zone, not the wire instant. 10:42Z is 17:42
    // in Asia/Ho_Chi_Minh, which is the time the desk reading it kept.
    expect(screen.getByText("09/09 · 17:42")).toBeTruthy();
    expect(screen.queryByText("2026-09-09T10:42:00Z")).toBeNull();
  });

  it('states the position honestly, in one short line', () => {
    view();
    const text = document.body.textContent ?? '';

    // The claim that matters survives: filed against the booking, not sent.
    expect(screen.getByText(CONVERSATION_VIEW_COPY.composerNote)).toBeTruthy();
    expect(text).toMatch(/chưa gửi tới khách/);

    // It is one sentence now. The old notice also named the delivery channel
    // and listed the transports the system does not have.
    expect(CONVERSATION_VIEW_COPY.composerNote.length).toBeLessThan(70);
    expect(text).not.toMatch(/Lưu trong KAS|SMS hay ứng dụng/);

    // Exactly once. The composer carried its own copy of the same point, so
    // the operator met the disclaimer twice in consecutive paragraphs.
    expect(screen.getAllByText(/chưa gửi tới khách/)).toHaveLength(1);

    // And still never a claim of delivery.
    expect(text).not.toMatch(/Đã gửi tới khách|Email đã gửi|SMS đã gửi|đã đọc|delivered/i);
  });

  it('puts the composer on the conversation surface, under the thread', () => {
    const { container } = view();

    // One surface, three bands. The header used to be its own bordered card
    // with a gap under it, and the composer another below that; the operator
    // read three panels where there is one conversation.
    const surface = container.querySelector('section[class*="conversation"]');
    if (surface === null) {
      throw new Error('the conversation surface is not rendered');
    }
    const header = surface.querySelector('[class*="conversationHeader"]');
    const scroll = surface.querySelector('[class*="threadScroll"]');
    const composer = surface.querySelector('[class*="composerBar"]');
    if (header === null || scroll === null || composer === null) {
      throw new Error('the conversation is not one surface of three bands');
    }

    // And the composer is a sibling after the thread, not nested inside it.
    expect(scroll.contains(composer)).toBe(false);
    expect(
      scroll.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The textarea the operator types into is still there and still labelled.
    expect(screen.getByLabelText(COMPOSER_COPY.body)).toBeTruthy();
  });

  it('states each fact once', () => {
    view();

    // The reference, hotel and stay each appear in exactly one place in the
    // header — the context line — rather than in a labelled row as well.
    expect(screen.getAllByText('KAS-260908-CA9W')).toHaveLength(1);
    expect(screen.getAllByText(/KAS Elegance/)).toHaveLength(1);
    expect(screen.getAllByText('Nguyễn Văn An')).toHaveLength(1);
  });

  it('marks an automated message and names its template', () => {
    view(
      thread({
        messages: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            body: 'Nhắc nhận phòng.',
            locale: 'vi',
            createdAt: '2026-09-09T11:00:00Z',
            sentAt: null,
            automated: true,
            templateName: 'Nhắc nhận phòng',
          },
        ],
      }),
    );
    // One line, not two: an automated message names itself and its template
    // together in the bubble's footer.
    expect(screen.getByText('Tự động · Nhắc nhận phòng')).toBeTruthy();
  });

  it('puts every bubble on the sending side, and draws no guest side', () => {
    const { container } = view();

    // The model has no direction and no inbound row, so a left-hand column
    // would be an empty promise of replies this product cannot receive.
    const bubbles = container.querySelectorAll('li[data-author]');
    expect(bubbles.length).toBeGreaterThan(0);
    for (const bubble of bubbles) {
      expect(bubble.getAttribute('data-author')).toMatch(/^(staff|automation)$/);
    }
    expect(container.querySelector('li[data-author="guest"]')).toBeNull();
  });

  it('says the thread is empty rather than showing nothing', () => {
    view(thread({ messages: [] }));
    expect(screen.getByText(CONVERSATION_VIEW_COPY.noMessages)).toBeTruthy();
  });
});

// --------------------------------------------------------------- composer

describe('the composer', () => {
  function composer(templates: readonly MessageTemplate[] = []) {
    return render(
      <MessageComposer
        reference="KAS-260908-CA9W"
        templates={templates}
        copy={COMPOSER_COPY}
      />,
    );
  }

  it('will not send an empty message', () => {
    composer();
    expect(
      (screen.getByRole('button', { name: COMPOSER_COPY.record }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('blocks sending while a variable is unresolved, and says why', async () => {
    const user = userEvent.setup();
    composer();

    // paste, not type: userEvent reads '{{' as an escape for a literal '{', so
    // typing a template body would silently produce different text.
    await user.click(screen.getByLabelText(COMPOSER_COPY.body));
    await user.paste('Xin chào {{guestName}}');

    expect(screen.getByText(/Còn biến chưa được điền/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: COMPOSER_COPY.record }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(recordApi).not.toHaveBeenCalled();
  });

  it('previews on the server and sends exactly what came back', async () => {
    const user = userEvent.setup();
    previewApi.mockResolvedValue({ body: 'Xin chào Nguyễn Văn An', variables: ['guestName'] });
    recordApi.mockResolvedValue(thread());
    composer();

    const body = screen.getByLabelText(COMPOSER_COPY.body);
    await user.click(body);
    await user.paste('Xin chào {{guestName}}');
    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.preview }));

    // The server's rendering replaces the draft, so what is sent is what was read.
    await waitFor(() => expect((body as HTMLTextAreaElement).value).toBe('Xin chào Nguyễn Văn An'));
    expect(previewApi).toHaveBeenCalledWith('KAS-260908-CA9W', 'Xin chào {{guestName}}');

    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.record }));
    await waitFor(() => expect(recordApi).toHaveBeenCalledTimes(1));
    expect(recordApi).toHaveBeenCalledWith('KAS-260908-CA9W', 'Xin chào Nguyễn Văn An', undefined);
  });

  it('re-reads the server record rather than appending optimistically', async () => {
    const user = userEvent.setup();
    recordApi.mockResolvedValue(thread());
    composer();

    await user.type(screen.getByLabelText(COMPOSER_COPY.body), 'Xin chào');
    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.record }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith('success', COMPOSER_COPY.recorded);
    // Cleared, so the same message cannot be sent twice by a second Enter.
    expect((screen.getByLabelText(COMPOSER_COPY.body) as HTMLTextAreaElement).value).toBe('');
  });

  it('sends once even when submitted twice in a row', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    recordApi.mockImplementation(
      () => new Promise((resolve) => {
        release = resolve;
      }),
    );
    composer();

    await user.type(screen.getByLabelText(COMPOSER_COPY.body), 'Xin chào');
    const button = screen.getByRole('button', { name: COMPOSER_COPY.record });
    await user.click(button);
    await user.click(button);

    // The guard is the busy state, not the disabled attribute: a second click
    // landing between the first and the re-render must still be a no-op.
    expect(recordApi).toHaveBeenCalledTimes(1);
    release(thread());
  });

  it('keeps the draft and shows the failure when the server refuses', async () => {
    const user = userEvent.setup();
    recordApi.mockRejectedValue(
      new ApiError(500, {
        code: 'INTERNAL_ERROR',
        message: 'nope',
        details: [],
        correlationId: 'abc',
      }),
    );
    composer();

    await user.type(screen.getByLabelText(COMPOSER_COPY.body), 'Xin chào');
    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.record }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    // The words are not lost, so the operator can retry rather than retype.
    expect((screen.getByLabelText(COMPOSER_COPY.body) as HTMLTextAreaElement).value)
      .toBe('Xin chào');
    expect(refresh).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('retries after a failure and succeeds', async () => {
    const user = userEvent.setup();
    recordApi
      .mockRejectedValueOnce(
        new ApiError(500, {
          code: 'INTERNAL_ERROR',
          message: 'nope',
          details: [],
          correlationId: 'abc',
        }),
      )
      .mockResolvedValueOnce(thread());
    composer();

    await user.type(screen.getByLabelText(COMPOSER_COPY.body), 'Xin chào');
    const button = screen.getByRole('button', { name: COMPOSER_COPY.record });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.record }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(recordApi).toHaveBeenCalledTimes(2);
  });

  it('inserts a template body and records its provenance', async () => {
    const user = userEvent.setup();
    previewApi.mockResolvedValue({ body: 'Xin chào Nguyễn Văn An', variables: ['guestName'] });
    recordApi.mockResolvedValue(thread());
    composer([template()]);

    await user.selectOptions(
      screen.getByLabelText(COMPOSER_COPY.template),
      '22222222-2222-4222-8222-222222222222',
    );
    expect((screen.getByLabelText(COMPOSER_COPY.body) as HTMLTextAreaElement).value)
      .toBe('Xin chào {{guestName}}.');

    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.preview }));
    await waitFor(() =>
      expect((screen.getByLabelText(COMPOSER_COPY.body) as HTMLTextAreaElement).value)
        .toBe('Xin chào Nguyễn Văn An'),
    );

    await user.click(screen.getByRole('button', { name: COMPOSER_COPY.record }));
    await waitFor(() => expect(recordApi).toHaveBeenCalledTimes(1));
    // Provenance, not instruction — the server does not re-expand it.
    expect(recordApi).toHaveBeenCalledWith(
      'KAS-260908-CA9W',
      'Xin chào Nguyễn Văn An',
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('carries no disclaimer of its own — the conversation states it once', () => {
    composer();

    // The composer used to end with its own three-sentence notice, and the
    // conversation adds one under it, so the same point was made twice in a
    // row. The statement is still made — see the conversation view's test —
    // but by the screen that owns the composer, once.
    expect(screen.queryByText(/chưa được gửi tới khách|chưa gửi tới khách/)).toBeNull();
    expect(screen.queryByText(/SMS hay ứng dụng/)).toBeNull();
  });
});

// --------------------------------------------------------- automation log

describe('the automation log', () => {
  it('reports what was written, with the status the record can prove', () => {
    render(
      <AutomationLog
        entries={[
          {
            reference: 'KAS-260908-CA9W',
            templateName: 'Nhắc nhận phòng',
            trigger: 'BEFORE_CHECK_IN',
            propertySlug: 'kas-elegance-hotel',
            recordedAt: '2026-09-17T01:00:00Z',
            sentAt: null,
            status: 'RECORDED',
          },
        ]}
        copy={AUTOMATION_LOG_COPY}
      />,
    );

    expect(screen.getByText('KAS-260908-CA9W')).toBeTruthy();
    expect(screen.getByText('Nhắc nhận phòng')).toBeTruthy();
    expect(screen.getByText('Đã ghi nhận')).toBeTruthy();
    // Never "sent": sent_at is null because nothing transmitted.
    expect(document.body.textContent ?? '').not.toMatch(/Đã gửi\b/);
  });

  it('says nothing has run rather than inventing an entry', () => {
    render(<AutomationLog entries={[]} copy={AUTOMATION_LOG_COPY} />);
    expect(screen.getByText(AUTOMATION_LOG_COPY.emptyTitle)).toBeTruthy();
    expect(document.body.textContent ?? '').not.toMatch(/KAS-\d/);
  });
});

// ---------------------------------------------------------------- loading

describe('loading', () => {
  it('treats an empty inbox as a success, not an error', async () => {
    inboxApi.mockResolvedValue(page({ items: [], total: 0 }));
    expect((await loadInbox()).status).toBe('ok');
  });

  it('keeps a failure as its own state', async () => {
    inboxApi.mockRejectedValue(
      new ApiError(500, {
        code: 'INTERNAL_ERROR',
        message: 'nope',
        details: [],
        correlationId: 'abc',
      }),
    );
    expect((await loadInbox()).status).toBe('error');
  });

  it('reports a 404 thread as not found, never as "not permitted"', async () => {
    const threadApi = vi.fn().mockRejectedValue(
      new ApiError(404, {
        code: 'NOT_FOUND',
        message: 'no',
        details: [],
        correlationId: null,
      }),
    );
    const endpoints = await import('@/lib/api/endpoints');
    const original = endpoints.conversationsApi.thread;
    // The scope boundary: another partner's conversation and one that never
    // existed are one answer, and nothing here may re-describe it.
    (endpoints.conversationsApi as { thread: unknown }).thread = threadApi;
    try {
      expect((await loadThread('KAS-260908-XXXX')).status).toBe('notFound');
    } finally {
      (endpoints.conversationsApi as { thread: unknown }).thread = original;
    }
  });
});

// ------------------------------------------------------------ integration

describe('the list and the filter bar together', () => {
  it('keeps the active filters in every conversation link', () => {
    const filters: ConversationFilters = { q: 'An', property: 'kas-elegance-hotel' };
    render(
      <ConversationList
        conversations={[conversation()]}
        hrefFor={(reference) => inboxHref(filters, reference)}
        copy={CONVERSATION_LIST_COPY}
      />,
    );

    // Opening a conversation must not silently drop the search that found it.
    const link = within(screen.getByRole('list')).getAllByRole('link')[0];
    expect(link?.getAttribute('href')).toBe(
      '/partner/messages/KAS-260908-CA9W?q=An&property=kas-elegance-hotel',
    );
  });
});

// ------------------------------------------------------------ the workspace

describe('the inbox workspace', () => {
  const shell = (activeReference?: string) =>
    render(
      <InboxShell
        page={page()}
        filters={{}}
        properties={PROPERTIES}
        {...(activeReference === undefined ? {} : { activeReference })}
      >
        {activeReference === undefined ? undefined : <p>Cuộc trò chuyện đang mở</p>}
      </InboxShell>,
    );

  it('states the delivery position nowhere but the composer', () => {
    shell();

    // The intro used to carry the whole explanation — "lưu trong KAS", "chưa
    // có kênh gửi email, SMS hay ứng dụng" — which the composer states again
    // one click later. One claim, one place: beside the box you type in.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/SMS|chưa nhận được|Lưu trong KAS/);
    // The orientation that was worth keeping is still here.
    expect(screen.getByText(/gắn với từng đặt phòng/)).toBeTruthy();
  });

  it('fills the conversation pane before a conversation is chosen', () => {
    shell();

    // The pane rendered nothing on this route, so most of a desktop screen
    // was empty beside a 300px list. It is a prompt now, not a void.
    expect(screen.getByText('Chọn một cuộc trò chuyện')).toBeTruthy();
  });

  it('gives the pane to the conversation once one is open', () => {
    shell('KAS-260908-CA9W');

    expect(screen.getByText('Cuộc trò chuyện đang mở')).toBeTruthy();
    expect(screen.queryByText('Chọn một cuộc trò chuyện')).toBeNull();
  });
});

describe('stay dates', () => {
  it('reorders the wire date rather than parsing it', async () => {
    const { stayDate, stayRange } = await import('@/lib/domain/conversation');

    expect(stayDate('2026-09-20')).toBe('20/09/2026');
    // The reason it reorders instead of parsing: `new Date('2026-09-20')` is
    // midnight UTC, so a formatter applying any zone west of Greenwich moves
    // the stay to the 19th. A date with no time has no instant to convert.
    expect(stayDate('2026-01-01')).toBe('01/01/2026');
    // Anything the server sends in another shape is shown as sent.
    expect(stayDate('')).toBe('');
    expect(stayDate('không rõ')).toBe('không rõ');
    expect(stayRange({ checkIn: '2026-09-20', checkOut: '2026-09-22' })).toBe(
      '20/09/2026 → 22/09/2026',
    );
  });
});
