'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { messageTemplatesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  MESSAGE_TRIGGERS,
  present,
  triggerLabel,
  unsupportedVariables,
  variablesIn,
  type MessageTemplate,
} from '@/lib/domain/conversation';
import { Badge, Button, Card, Input, Textarea, useToast } from '@/ui/primitives';
import styles from './Messaging.module.css';

/**
 * The template shelf — create, edit, enable, disable and delete.
 *
 * <h2>Enabling is separate from editing, in the UI as in the API</h2>
 *
 * The switch on each row calls `PUT /{id}/enabled` and nothing else. Turning a
 * check-in reminder on is the moment its body starts being written to real
 * reservations on a schedule, and that must not be reachable as a side effect of
 * fixing a typo — so the editor cannot flip it, and the switch cannot change the
 * text.
 *
 * <h2>Variables are checked here as a courtesy and there as a rule</h2>
 *
 * The editor warns about an unsupported `{{placeholder}}` while typing, using the
 * list the server itself supplies. The **authoritative** check is the backend's,
 * which refuses the save with a 400 naming the variable. Duplicating the decision
 * would create two rules that could disagree; mirroring the *display* of it just
 * means the operator finds out before pressing save.
 */
export function TemplateManager({
  templates,
  variables,
  properties,
  copy,
}: {
  readonly templates: readonly MessageTemplate[];
  /** The placeholders the server accepts, fetched rather than hardcoded. */
  readonly variables: readonly string[];
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
  readonly copy: TemplateCopy;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>, success: string): Promise<void> {
    if (busy !== null) {
      return;
    }
    setBusy(key);
    setProblem(null);
    try {
      await action();
      // The server owns the shelf: re-read rather than patching local state, so
      // the screen can never show a template the record does not have.
      router.refresh();
      toast.show('success', success);
      setEditing(null);
    } catch (caught) {
      setProblem(caught instanceof ApiError ? messageFor(caught) : copy.failed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.templates}>
      {problem === null ? null : (
        <p className={styles.composerProblem} role="alert">
          {problem}
        </p>
      )}

      <div className={styles.templateActions}>
        <Button
          onClick={() => {
            setProblem(null);
            setEditing(blank());
          }}
          disabled={busy !== null}
        >
          {copy.create}
        </Button>
      </div>

      {editing === null ? null : (
        <TemplateEditor
          draft={editing}
          variables={variables}
          properties={properties}
          busy={busy !== null}
          copy={copy}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={(draft) =>
            void run('save', () => {
              const input = {
                name: draft.name.trim(),
                body: draft.body.trim(),
                locale: draft.locale,
                trigger: draft.trigger,
                ...(draft.trigger === 'BEFORE_CHECK_IN'
                  ? { leadDays: Number.parseInt(draft.leadDays, 10) }
                  : {}),
                // Only honoured on create: a template never moves between
                // properties, because that would silently change who a running
                // automation writes to.
                ...(draft.id === null && draft.property !== ''
                  ? { property: draft.property }
                  : {}),
              };
              return draft.id === null
                ? messageTemplatesApi.create(input)
                : messageTemplatesApi.update(draft.id, input);
            }, draft.id === null ? copy.created : copy.updated)
          }
        />
      )}

      {templates.length === 0 ? (
        <p className={styles.templateEmpty}>{copy.empty}</p>
      ) : (
        <ul className={styles.templateList}>
          {templates.map((template) => (
            <li key={template.id}>
              <Card title={template.name}>
                <div className={styles.templateMeta}>
                  <Badge tone={template.enabled ? 'success' : 'neutral'}>
                    {template.enabled ? copy.on : copy.off}
                  </Badge>
                  <Badge tone="neutral">{triggerLabel(template.trigger)}</Badge>
                  {/*
                    `present`, not `=== null`. The backend omits null fields
                    entirely (`default-property-inclusion: non_null`), so a
                    MANUAL template's `leadDays` and a portfolio-wide
                    template's `propertySlug` arrive as `undefined` — and
                    `undefined === null` is false. The first rendered
                    "undefined ngày trước"; the second fell to the slug branch
                    and printed nothing at all instead of "tất cả khách sạn".
                  */}
                  {present(template.leadDays) ? (
                    <span className={styles.templateLead}>
                      {copy.leadDaysValue(template.leadDays)}
                    </span>
                  ) : null}
                  <span className={styles.templateLocale}>{template.locale}</span>
                  <span className={styles.templateScope}>
                    {present(template.propertySlug)
                      ? (template.propertyName ?? template.propertySlug)
                      : copy.allProperties}
                  </span>
                </div>

                <p className={styles.templateBody}>{template.body}</p>

                {template.variables.length === 0 ? null : (
                  <p className={styles.templateVariables}>
                    {copy.usesVariables(
                      template.variables.map((name) => `{{${name}}}`).join(', '),
                    )}
                  </p>
                )}

                <div className={styles.templateRowActions}>
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => {
                      setProblem(null);
                      setEditing(draftOf(template));
                    }}
                  >
                    {copy.edit}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        template.id,
                        () => messageTemplatesApi.setEnabled(template.id, !template.enabled),
                        template.enabled ? copy.disabled : copy.enabled,
                      )
                    }
                  >
                    {busy === template.id
                      ? copy.saving
                      : template.enabled
                        ? copy.turnOff
                        : copy.turnOn}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        template.id,
                        () => messageTemplatesApi.remove(template.id),
                        copy.deleted,
                      )
                    }
                  >
                    {copy.remove}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateEditor({
  draft,
  variables,
  properties,
  busy,
  copy,
  onChange,
  onCancel,
  onSave,
}: {
  readonly draft: Draft;
  readonly variables: readonly string[];
  readonly properties: readonly { readonly slug: string; readonly label: string }[];
  readonly busy: boolean;
  readonly copy: TemplateCopy;
  readonly onChange: (draft: Draft) => void;
  readonly onCancel: () => void;
  readonly onSave: (draft: Draft) => void;
}) {
  const unknown = unsupportedVariables(draft.body, variables);
  const used = variablesIn(draft.body);
  const automated = draft.trigger === 'BEFORE_CHECK_IN';
  const leadValid = !automated || /^\d+$/.test(draft.leadDays);
  const ready =
    draft.name.trim() !== '' && draft.body.trim() !== '' && unknown.length === 0 && leadValid;

  return (
    <Card title={draft.id === null ? copy.create : copy.edit}>
      <form
        className={styles.templateForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy) {
            onSave(draft);
          }
        }}
      >
        <Input
          id="template-name"
          label={copy.name}
          value={draft.name}
          disabled={busy}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />

        <Textarea
          id="template-body"
          label={copy.body}
          rows={5}
          value={draft.body}
          disabled={busy}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
        />

        {/*
          The list the server supplies, so the editor offers exactly what the
          validator accepts. Buttons rather than prose: an operator should not
          have to type braces correctly.
        */}
        <div className={styles.variablePalette}>
          <span className={styles.variableHint}>{copy.variableHint}</span>
          {variables.map((name) => (
            <button
              key={name}
              type="button"
              className={styles.variableChip}
              disabled={busy}
              onClick={() => onChange({ ...draft, body: `${draft.body}{{${name}}}` })}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>

        {unknown.length === 0 ? null : (
          <p className={styles.composerProblem} role="alert">
            {copy.unknownVariables(unknown.map((name) => `{{${name}}}`).join(', '))}
          </p>
        )}

        {used.length === 0 || unknown.length > 0 ? null : (
          <p className={styles.templateVariables}>
            {copy.usesVariables(used.map((name) => `{{${name}}}`).join(', '))}
          </p>
        )}

        <div className={styles.templateFormRow}>
          <div className={styles.filterField}>
            <label htmlFor="template-trigger">{copy.trigger}</label>
            <select
              id="template-trigger"
              className={styles.control}
              value={draft.trigger}
              disabled={busy}
              onChange={(event) => onChange({ ...draft, trigger: event.target.value })}
            >
              {MESSAGE_TRIGGERS.map((value) => (
                <option key={value} value={value}>
                  {triggerLabel(value)}
                </option>
              ))}
            </select>
          </div>

          {/* Only a check-in reminder has a lead time; the backend refuses one otherwise. */}
          {automated ? (
            <Input
              id="template-lead"
              label={copy.leadDays}
              type="number"
              min={0}
              max={30}
              inputMode="numeric"
              value={draft.leadDays}
              disabled={busy}
              onChange={(event) => onChange({ ...draft, leadDays: event.target.value })}
            />
          ) : null}

          <div className={styles.filterField}>
            <label htmlFor="template-locale">{copy.locale}</label>
            <select
              id="template-locale"
              className={styles.control}
              value={draft.locale}
              disabled={busy}
              onChange={(event) => onChange({ ...draft, locale: event.target.value })}
            >
              <option value="vi">vi</option>
              <option value="en">en</option>
            </select>
          </div>

          {/* Absent when editing: a template never moves between properties. */}
          {draft.id === null ? (
            <div className={styles.filterField}>
              <label htmlFor="template-property">{copy.property}</label>
              <select
                id="template-property"
                className={styles.control}
                value={draft.property}
                disabled={busy}
                onChange={(event) => onChange({ ...draft, property: event.target.value })}
              >
                <option value="">{copy.allProperties}</option>
                {properties.map((property) => (
                  <option key={property.slug} value={property.slug}>
                    {property.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {automated ? <p className={styles.templateNote}>{copy.automationNote}</p> : null}

        <div className={styles.templateFormActions}>
          <Button variant="secondary" type="button" onClick={onCancel} disabled={busy}>
            {copy.cancel}
          </Button>
          <Button type="submit" disabled={busy || !ready}>
            {busy ? copy.saving : copy.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface Draft {
  readonly id: string | null;
  readonly name: string;
  readonly body: string;
  readonly locale: string;
  readonly trigger: string;
  readonly leadDays: string;
  readonly property: string;
}

function blank(): Draft {
  return {
    id: null,
    name: '',
    body: '',
    locale: 'vi',
    trigger: 'MANUAL',
    leadDays: '1',
    property: '',
  };
}

function draftOf(template: MessageTemplate): Draft {
  return {
    id: template.id,
    name: template.name,
    body: template.body,
    locale: template.locale,
    trigger: template.trigger,
    leadDays: template.leadDays === null ? '1' : String(template.leadDays),
    property: template.propertySlug ?? '',
  };
}

export interface TemplateCopy {
  readonly create: string;
  readonly edit: string;
  readonly remove: string;
  readonly save: string;
  readonly saving: string;
  readonly cancel: string;
  readonly name: string;
  readonly body: string;
  readonly trigger: string;
  readonly leadDays: string;
  readonly locale: string;
  readonly property: string;
  readonly allProperties: string;
  readonly on: string;
  readonly off: string;
  readonly turnOn: string;
  readonly turnOff: string;
  readonly empty: string;
  readonly created: string;
  readonly updated: string;
  readonly deleted: string;
  readonly enabled: string;
  readonly disabled: string;
  readonly failed: string;
  readonly variableHint: string;
  readonly automationNote: string;
  readonly usesVariables: (names: string) => string;
  readonly unknownVariables: (names: string) => string;
  readonly leadDaysValue: (days: number) => string;
}

/** Vietnamese only — doc 69 §325, one console language in V1 (config A12). */
export const TEMPLATE_COPY: TemplateCopy = {
  create: 'Tạo tin nhắn mẫu',
  edit: 'Chỉnh sửa',
  remove: 'Xoá',
  save: 'Lưu',
  saving: 'Đang lưu…',
  cancel: 'Huỷ',
  name: 'Tên mẫu',
  body: 'Nội dung',
  trigger: 'Kích hoạt',
  leadDays: 'Số ngày trước khi nhận phòng',
  locale: 'Ngôn ngữ',
  property: 'Khách sạn',
  allProperties: 'Tất cả khách sạn',
  on: 'Đang bật',
  off: 'Đang tắt',
  turnOn: 'Bật',
  turnOff: 'Tắt',
  empty: 'Chưa có tin nhắn mẫu nào.',
  created: 'Đã tạo tin nhắn mẫu.',
  updated: 'Đã cập nhật tin nhắn mẫu.',
  deleted: 'Đã xoá tin nhắn mẫu. Các tin nhắn đã gửi vẫn được giữ nguyên.',
  enabled: 'Đã bật tin nhắn mẫu.',
  disabled: 'Đã tắt tin nhắn mẫu.',
  failed: 'Không lưu được. Vui lòng thử lại.',
  variableHint: 'Chèn biến:',
  automationNote:
    'Khi bật, hệ thống sẽ tự động ghi tin nhắn này vào các đặt phòng đã xác nhận lưu trú, '
    + 'đúng số ngày trước ngày nhận phòng. Mỗi đặt phòng chỉ nhận một lần. '
    + 'Tin nhắn được lưu trong KAS và chưa được gửi tới khách.',
  usesVariables: (names) => `Biến đang dùng: ${names}`,
  unknownVariables: (names) =>
    `Hệ thống không điền được biến: ${names}. Vui lòng dùng các biến ở trên.`,
  leadDaysValue: (days) => `${days} ngày trước`,
};
