// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { CalendarCell } from './CalendarCell';
import { ConfirmDialog, Modal } from './Dialog';
import { Badge } from './Display';
import { Input, Select, Textarea } from './Form';
import { Table, type Column } from './Table';

afterEach(cleanup);

/**
 * Primitive behaviour, asserted through the accessibility tree rather than
 * class names — that is what a user of assistive technology actually receives,
 * and it does not break when the CSS is restyled.
 */

describe('Input', () => {
  it('associates label, description and error with the control', () => {
    render(
      <Input
        id="email"
        label="Email"
        description="Địa chỉ đăng nhập"
        error="Email không hợp lệ"
        required
      />,
    );

    const input = screen.getByLabelText(/Email/);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    // Both the description and the error must be announced, in that order.
    const described = input.getAttribute('aria-describedby') ?? '';
    expect(described).toContain('email-description');
    expect(described).toContain('email-error');
    expect(screen.getByRole('alert').textContent).toContain('Email không hợp lệ');
  });

  it('omits aria-describedby when there is nothing to describe', () => {
    render(<Input id="plain" label="Tên" />);
    expect(screen.getByLabelText('Tên').getAttribute('aria-describedby')).toBeNull();
  });

  it('marks an optional field so required is not the assumed default', () => {
    render(<Input id="opt" label="Ghi chú" />);
    expect(screen.getByText('không bắt buộc')).toBeTruthy();
  });
});

describe('Textarea', () => {
  it('carries the same error semantics as Input', () => {
    render(<Textarea id="note" label="Mô tả" error="Quá dài" />);
    const field = screen.getByLabelText('Mô tả');
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Khách sạn A' },
    { value: 'b', label: 'Khách sạn B' },
  ];

  it('renders its options and reports a change', async () => {
    const onChange = vi.fn();
    render(<Select id="p" label="Khách sạn" options={options} value="a" onChange={onChange} />);

    const select = screen.getByLabelText('Khách sạn');
    await userEvent.selectOptions(select, 'b');
    expect(onChange).toHaveBeenCalled();
  });

  it('is disabled and marked busy while loading', () => {
    render(<Select id="p" label="Khách sạn" options={options} value="" loading onChange={vi.fn()} />);
    const select = screen.getByLabelText('Khách sạn');
    expect((select as HTMLSelectElement).disabled).toBe(true);
    expect(select.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Button', () => {
  it('defaults to type=button so it cannot submit a form by accident', () => {
    render(<Button>Lưu</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('announces a busy state rather than only showing a spinner', () => {
    render(<Button loading>Đang lưu</Button>);
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Lưu
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  /*
    The loading transition, which used to crash the room-type form.

    `{loading ? <span/> : null}{children}` asked React to insert an element
    immediately before a raw text node, in the same commit that replaced that
    text ("Lưu thay đổi" → "Đang lưu…"). When the text node it held was no
    longer the child it expected, `insertBefore` threw NotFoundError and
    Next.js showed a runtime overlay — after the save had already succeeded.

    These pin the structure that makes that impossible, rather than the symptom.
  */
  it('keeps the same child nodes across the loading transition', () => {
    const { rerender } = render(<Button loading={false}>Lưu thay đổi</Button>);
    const button = screen.getByRole('button');
    const before = [...button.childNodes];

    // Exactly what a save does: flip loading and swap the label together.
    rerender(<Button loading>Đang lưu…</Button>);
    const during = [...button.childNodes];
    rerender(<Button loading={false}>Lưu thay đổi</Button>);
    const after = [...button.childNodes];

    // Same node identities throughout — nothing is inserted or removed, so
    // there is no insertion point for React to lose.
    expect(during).toHaveLength(before.length);
    expect(during.every((node, i) => node === before[i])).toBe(true);
    expect(after.every((node, i) => node === before[i])).toBe(true);
    expect(button.textContent).toBe('Lưu thay đổi');
  });

  it('never makes a text node a direct child of the button', () => {
    render(<Button>Lưu thay đổi</Button>);
    const button = screen.getByRole('button');

    // The label owns the text. A raw text node here is what the spinner had
    // to be inserted in front of.
    const textChildren = [...button.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(textChildren).toHaveLength(0);
  });

  it('shows the spinner only while loading, without unmounting it', () => {
    const { rerender } = render(<Button loading={false}>Lưu</Button>);
    const button = screen.getByRole('button');
    const spinner = button.firstElementChild as HTMLElement;

    expect(spinner.hasAttribute('hidden')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBeNull();

    rerender(<Button loading>Lưu</Button>);
    expect(spinner.hasAttribute('hidden')).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');
    // Still the very same element, not a re-created one.
    expect(button.firstElementChild).toBe(spinner);
  });

  it('keeps the spinner out of the accessibility tree and the label in it', () => {
    render(<Button loading>Đang lưu…</Button>);
    const button = screen.getByRole('button', { name: 'Đang lưu…' });
    expect(button.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Table', () => {
  interface Row {
    readonly id: string;
    readonly name: string;
  }
  const columns: readonly Column<Row>[] = [
    { key: 'name', header: 'Tên', cell: (row) => row.name },
  ];

  it('renders semantic headers', () => {
    render(
      <Table
        caption="Khách sạn"
        columns={columns}
        rows={[{ id: '1', name: 'KAS Milestone' }]}
        rowKey={(row) => row.id}
      />,
    );
    // A grid of divs would look the same and announce nothing.
    expect(screen.getByRole('columnheader', { name: 'Tên' })).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('KAS Milestone')).toBeTruthy();
  });

  it('shows the empty state instead of an empty table', () => {
    render(
      <Table caption="Khách sạn" columns={columns} rows={[]} rowKey={(row) => row.id} />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
  });

  it('marks itself busy while loading', () => {
    render(
      <Table caption="Khách sạn" columns={columns} rows={[]} rowKey={(r) => r.id} loading />,
    );
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});

describe('Modal', () => {
  it('exposes an accessible name and closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Xác nhận" onClose={onClose}>
        <p>Nội dung</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Xác nhận' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Ẩn" onClose={vi.fn()}>
        <p>Nội dung</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores focus to whatever opened it', async () => {
    function Harness() {
      return (
        <>
          <button type="button" data-testid="opener">
            Mở
          </button>
          <Modal open title="Hộp thoại" onClose={() => undefined}>
            <p>Nội dung</p>
          </Modal>
        </>
      );
    }
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<Harness />);
    unmount();

    // Without restoration a keyboard user lands back at the top of the document
    // every time they dismiss a dialog.
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('gives Escape to the topmost dialog only', () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Modal open title="Biểu mẫu" onClose={closeOuter}>
          <p>Nội dung</p>
        </Modal>
        <Modal open title="Xác nhận" onClose={closeInner}>
          <p>Chắc chắn?</p>
        </Modal>
      </>,
    );

    // Both listen on the document, so without a stack one Escape would dismiss
    // the confirmation *and* the form behind it, discarding the operator's work.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('states the effect and offers both actions', () => {
    render(
      <ConfirmDialog
        open
        title="Áp dụng giá"
        confirmLabel="Áp dụng"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        36 ô sẽ thay đổi
      </ConfirmDialog>,
    );

    // Doc 56 §7: the confirmation must say what is about to happen, not merely
    // ask whether the operator is sure.
    expect(screen.getByText('36 ô sẽ thay đổi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Áp dụng' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeTruthy();
  });

  it('disables both actions while the request is in flight', () => {
    render(
      <ConfirmDialog
        open
        busy
        title="Áp dụng giá"
        confirmLabel="Áp dụng"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        36 ô
      </ConfirmDialog>,
    );

    // A double-submitted bulk apply is precisely the accident this prevents.
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Huỷ' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('CalendarCell', () => {
  it('renders an unconfigured cell as a gap, never as zero', () => {
    render(<CalendarCell date="2026-09-12" value={null} />);

    // Doc 15 §12 and doc 56 §9: a missing inventory row is not "0 available",
    // and an unpriced room is not free.
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('chưa cấu hình')).toBeTruthy();
  });

  it('renders a real zero when the backend genuinely returned zero', () => {
    render(<CalendarCell date="2026-09-12" value={0} />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('chưa cấu hình')).toBeNull();
  });

  it('is a plain grid cell until given a select handler', () => {
    const { rerender } = render(<CalendarCell date="2026-09-12" value={5} />);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(<CalendarCell date="2026-09-12" value={5} onSelect={vi.fn()} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('reports selection through aria-pressed, not colour alone', async () => {
    const onSelect = vi.fn();
    render(<CalendarCell date="2026-09-12" value={5} selected onSelect={onSelect} />);

    const cell = screen.getByRole('button');
    expect(cell.getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith('2026-09-12');
  });

  it('does not fire when disabled', async () => {
    const onSelect = vi.fn();
    render(<CalendarCell date="2026-09-12" value={5} state="disabled" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('gridcell'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('carries the same API for inventory and for rates', () => {
    // The component must not know which it is showing — the proof is that the
    // identical props render both.
    const { rerender } = render(<CalendarCell date="2026-09-12" value={5} secondary="phòng" />);
    expect(screen.getByText('5')).toBeTruthy();

    rerender(<CalendarCell date="2026-09-12" value="1.5M" secondary="VND" />);
    expect(screen.getByText('1.5M')).toBeTruthy();
  });
});

describe('Badge', () => {
  it('carries its meaning as text, so it survives greyscale', () => {
    render(<Badge tone="warning">Nháp</Badge>);
    expect(screen.getByText('Nháp')).toBeTruthy();
  });
});
