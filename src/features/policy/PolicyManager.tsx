'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { policiesApi } from '@/lib/api/endpoints';
import { sharedPoliciesApi } from '@/lib/api/endpoints/sharedPolicies';
import { ApiError } from '@/lib/api/errors';
import {
  allowedTransitions,
  canRequestActivation,
  hasBody,
  newestByType,
  POLICY_LOCALES,
  POLICY_TIMING_LABELS,
  POLICY_TYPES,
  policyStatusLabel,
  policyStatusTone,
  policyTiming,
  policyTransitionLabel,
  policyTypeLabel,
  type PolicyStatus,
  type PolicyType,
  type PolicyView,
} from '@/lib/domain/policy';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Textarea,
  useToast,
} from '@/ui/primitives';
import { revalidatePolicies } from './actions';
import styles from './Policy.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * Property policy management.
 *
 * <h2>One row per frozen type, not one form per policy</h2>
 *
 * All eleven types are listed whether or not a version exists, because "this
 * property has no cancellation policy" is the fact a Partner most needs to see.
 * Editing opens a drawer, so the page stays a compact extranet screen rather than
 * eleven expanded forms.
 *
 * <h2>Nothing here decides anything the backend decides</h2>
 *
 * The activation gate, the current-version resolution and public visibility all
 * live in SQL. This component *shows* the gate before a Partner hits it — it
 * never substitutes for it, and a save refused by the backend is reported as
 * refused.
 */
export function PolicyManager({
  propertyId,
  shared = false,
  policies,
  today,
}: {
  readonly propertyId: string;
  readonly shared?: boolean;
  readonly policies: readonly PolicyView[];
  /** ISO date, resolved on the server so the client clock cannot shift it. */
  readonly today: string;
}) {
  const policyClient = shared ? sharedPoliciesApi : policiesApi;
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<PolicyView | null>(null);
  const [filter, setFilter] = useState<'all' | PolicyStatus>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newest = useMemo(() => newestByType(policies), [policies]);

  const rows = POLICY_TYPES.map((type) => ({ type, policy: newest.get(type) ?? null })).filter(
    (row) => filter === 'all' || row.policy?.status === filter,
  );

  const filterLabel = filter === 'all' ? 'Tất cả' : policyStatusLabel(filter);

  async function run(action: () => Promise<PolicyView>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const saved = await action();
      setEditing(saved);
      if (shared) await revalidatePolicies(propertyId, true);
      else await revalidatePolicies(propertyId);
      router.refresh();
      toast.show('success', success);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? messageFor(caught)
          : 'Không thể kết nối tới hệ thống. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  const create = (type: PolicyType) =>
    run(
      () => policyClient.create(propertyId, { type, effectiveFrom: today }),
      'Đã tạo bản nháp chính sách.',
    );

  return (
    <div className={styles.manager}>
      <div className={styles.filters} role="group" aria-label="Lọc theo trạng thái">
        {/*
          PAUSED was missing from this row while being one of the four states a
          policy can be in — so a partner who paused a policy had no way to list
          what they had paused, and the "Tất cả" tab was the only place it
          appeared. The order follows the lifecycle: draft, applied, withdrawn,
          filed away.
        */}
        {(['all', 'DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'secondary'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'Tất cả' : policyStatusLabel(value)}
          </Button>
        ))}
      </div>

      {error === null ? null : (
        <div className={propertyStyles.formAlert} role="alert">
          <p className={propertyStyles.formAlertText}>{error}</p>
        </div>
      )}

      {policies.length === 0 ? (
        // A lead paragraph, not an EmptyState card. The list below is never
        // empty — all eleven policy types are always listed, each with its own
        // "Tạo bản nháp" — so a card announcing that there is nothing here sat
        // directly above the eleven rows that say otherwise. The guidance is
        // worth keeping; the competing empty-state framing is not.
        <p className={styles.lead}>
          Chưa có chính sách nào được thiết lập. Thiết lập chính sách giúp khách hiểu rõ điều kiện
          lưu trú trước khi đặt phòng — chọn “Tạo bản nháp” ở loại chính sách bạn muốn bắt đầu.
        </p>
      ) : null}

      {/*
        A filter matching nothing used to render a blank area under the tabs —
        no list, no message, no way to tell a working filter from a broken
        screen. Most visible on the new "Tạm ngưng áp dụng" tab, which is empty
        whenever nothing is paused, which is most of the time.
      */}
      {rows.length === 0 ? (
        <EmptyState title={`Không có chính sách nào ở trạng thái “${filterLabel}”`}>
          Toàn bộ {POLICY_TYPES.length} loại chính sách vẫn còn nguyên.{' '}
          <button type="button" className={styles.inlineAction} onClick={() => setFilter('all')}>
            Xem tất cả
          </button>
        </EmptyState>
      ) : null}

      <ul className={styles.rows}>
        {rows.map(({ type, policy }) => (
          <li key={type}>
            <Card>
              <div className={styles.row}>
                <div className={styles.rowIdentity}>
                  {/*
                    The Vietnamese name only. The raw constant — CANCELLATION,
                    NO_SHOW, ACCESSIBILITY — was printed in mono underneath
                    every row: a database value shown to a hotelier, directly
                    below the words that already name the same thing.
                  */}
                  <span className={styles.rowTitle}>{policyTypeLabel(type)}</span>
                </div>

                {policy === null ? (
                  <span className={styles.unconfigured}>Chưa cấu hình</span>
                ) : (
                  <div className={styles.rowState}>
                    {/*
                      `data-policy-status` stays — it is how a test and any
                      future selector addresses the row, and an attribute is
                      not a label. The `title` beside it was: hovering the
                      badge popped up "PAUSED" over "Tạm ngưng áp dụng".
                    */}
                    <span data-policy-status={policy.status}>
                      <Badge tone={policyStatusTone(policy.status)}>
                        {policyStatusLabel(policy.status)}
                      </Badge>
                    </span>
                    <span className={styles.timing}>
                      {POLICY_TIMING_LABELS[policyTiming(policy, today)]}
                    </span>
                    <span className={styles.meta}>
                      Bản {policy.version} · từ {policy.effectiveFrom}
                    </span>
                    <span className={styles.locales}>
                      {POLICY_LOCALES.map((locale) => (
                        <Badge key={locale} tone={hasBody(policy, locale) ? 'success' : 'neutral'}>
                          {locale.toUpperCase()} {hasBody(policy, locale) ? 'đã có' : 'chưa có'}
                        </Badge>
                      ))}
                    </span>
                  </div>
                )}

                <div className={styles.rowActions}>
                  {policy === null ? (
                    <Button variant="secondary" loading={busy} onClick={() => create(type)}>
                      Tạo bản nháp
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => setEditing(policy)}>
                      Chỉnh sửa
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {editing === null ? null : (
        <PolicyDrawer
          propertyId={propertyId}
          policy={editing}
          today={today}
          busy={busy}
          onClose={() => setEditing(null)}
          onSaveBody={(locale, body) =>
            run(
              () => policyClient.setTranslation(propertyId, editing.id, { locale, body }),
              `Đã lưu nội dung ${locale.toUpperCase()}.`,
            )
          }
          onSetStatus={(status) =>
            run(
              () => policyClient.setStatus(propertyId, editing.id, status),
              'Đã cập nhật trạng thái chính sách.',
            )
          }
        />
      )}
    </div>
  );
}

function PolicyDrawer({
  policy,
  today,
  busy,
  onClose,
  onSaveBody,
  onSetStatus,
}: {
  readonly propertyId: string;
  readonly policy: PolicyView;
  readonly today: string;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSaveBody: (locale: 'vi' | 'en', body: string) => Promise<void>;
  readonly onSetStatus: (status: PolicyStatus) => Promise<void>;
}) {
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [bodies, setBodies] = useState<Record<string, string>>({
    vi: policy.translations['vi'] ?? '',
    en: policy.translations['en'] ?? '',
  });

  const activatable = canRequestActivation(policy);
  /*
    Archiving is irreversible, so it is the destructive control and it sits
    to the left of the constructive one — the same order `ConfirmDialog` uses.
    `allowedTransitions` returns ['ACTIVE','ARCHIVED'], which would have put
    the danger button last, next to the edge a hand reaches for.
  */
  const transitions = [...allowedTransitions(policy.status)].sort(
    (a, b) => Number(b === 'ARCHIVED') - Number(a === 'ARCHIVED'),
  );
  const activationBlocked = transitions.includes('ACTIVE') && !activatable;

  return (
    <Drawer
      open
      title={policyTypeLabel(policy.type)}
      onClose={onClose}
      /*
        Every action in one place, pinned below the scroll.

        They were loose in the body, above two explanatory paragraphs, so the
        buttons moved down the drawer as the policy text grew and the sentence
        explaining why one of them was disabled sat underneath it. The footer
        is fixed to the bottom of the panel (Dialog.module.css `.footer`) and
        becomes a full-width stack below 640px.

        "Đóng" is here because it was nowhere: an archived policy offers no
        transition, so the drawer's only exit was the header icon, Escape or a
        backdrop click. A terminal state still needs a way out that looks like
        a button.
      */
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          {transitions.map((target) => (
            <Button
              key={target}
              variant={TRANSITION_VARIANT[target]}
              loading={busy}
              disabled={target === 'ACTIVE' && !activatable}
              /*
                Archiving is the one transition with no way back —
                `allowedTransitions('ARCHIVED')` is empty by design, because a
                reservation's `terms_version` may point at this row. Every
                other transition here is reversible and asking about those
                would only teach a partner to click through the dialog that
                matters. So exactly one action confirms.
              */
              onClick={() =>
                target === 'ARCHIVED' ? setConfirmingArchive(true) : onSetStatus(target)
              }
            >
              {policyTransitionLabel(policy.status, target)}
            </Button>
          ))}
        </>
      }
    >
      <div className={styles.drawerBody}>
        {/*
          Status, version and effective date on one line.

          This was a three-row definition list whose labels — "Trạng thái",
          "Hiệu lực", "Phiên bản" — took a third of the drawer's first screen
          to introduce three short values, and whose status row printed the
          raw enum in mono after the Vietnamese: "Đang áp dụng (ACTIVE)".
        */}
        <p className={styles.drawerState}>
          <Badge tone={policyStatusTone(policy.status)}>{policyStatusLabel(policy.status)}</Badge>
          <span className={styles.drawerMeta}>
            Bản {policy.version} · hiệu lực từ {policy.effectiveFrom} ·{' '}
            {POLICY_TIMING_LABELS[policyTiming(policy, today)]}
          </span>
        </p>

        {POLICY_LOCALES.map((locale) => (
          <div key={locale} className={styles.localeBlock}>
            <Textarea
              id={`policy-body-${locale}`}
              label={locale === 'vi' ? 'Nội dung tiếng Việt' : 'Nội dung tiếng Anh'}
              value={bodies[locale] ?? ''}
              onChange={(event) =>
                setBodies((current) => ({ ...current, [locale]: event.target.value }))
              }
              description="Nội dung do đối tác tự soạn. Hệ thống không gợi ý sẵn điều khoản."
              maxLength={20000}
            />
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => onSaveBody(locale, bodies[locale] ?? '')}
            >
              Lưu nội dung {locale.toUpperCase()}
            </Button>
          </div>
        ))}

        {/*
          One note, chosen by state, instead of up to three stacked.

          The drawer used to end with an archived explanation, a separate
          activation-gate sentence and a standing visibility paragraph — two
          of which were true at once in some states, and all of which sat
          below the buttons they were explaining. Only one of the three can
          be the thing the operator needs to read here, so only one renders.
        */}
        <p className={styles.gateNote}>
          {transitions.length === 0
            ? 'Bản đã lưu trữ được giữ lại vĩnh viễn vì có thể đã gắn với đơn đặt phòng, '
              + 'và không thể áp dụng lại.'
            : activationBlocked
              ? 'Cần nội dung ở cả tiếng Việt và tiếng Anh trước khi có thể áp dụng chính sách này.'
              : 'Khách chỉ thấy chính sách khi khách sạn đã công khai, chính sách đang áp dụng và '
                + 'ngày hiệu lực đã tới.'}
        </p>

        <ConfirmDialog
          open={confirmingArchive}
          title="Lưu trữ chính sách này?"
          confirmLabel="Lưu trữ vĩnh viễn"
          cancelLabel="Giữ nguyên"
          destructive
          busy={busy}
          onCancel={() => setConfirmingArchive(false)}
          onConfirm={() => {
            setConfirmingArchive(false);
            void onSetStatus('ARCHIVED');
          }}
        >
          {/* The consequence in the partner's own terms, and the alternative
              named — "tạm ngưng" is what most people reaching for "lưu trữ"
              actually want, and it is one click away in the same panel. */}
          <p>
            <strong>Không thể khôi phục.</strong> Chính sách đã lưu trữ sẽ ở lại vĩnh viễn trong hồ
            sơ vì có thể đã gắn với đơn đặt phòng đã nhận, và không thể áp dụng lại.
          </p>
          <p>
            Nếu bạn chỉ muốn tạm dừng áp dụng và có thể bật lại sau, hãy chọn “Tạm ngưng” thay vì
            lưu trữ.
          </p>
        </ConfirmDialog>
      </div>
    </Drawer>
  );
}

/**
 * How each transition should look.
 *
 * Activation is the one constructive move a policy can make, so it is the
 * only primary. Pausing is reversible housekeeping and archiving destroys the
 * option to ever apply this version again — `danger` is the honest weight for
 * it, and the confirmation is what actually stands in the way.
 *
 * `DRAFT` is never a target: nothing transitions back to it.
 */
const TRANSITION_VARIANT: Record<PolicyStatus, 'primary' | 'secondary' | 'danger'> = {
  DRAFT: 'secondary',
  ACTIVE: 'primary',
  PAUSED: 'secondary',
  ARCHIVED: 'danger',
};
