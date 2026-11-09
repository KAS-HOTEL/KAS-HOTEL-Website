'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '@/features/auth/messages';
import { experiencesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import {
  experienceTitle,
  nextSortOrder,
  swapTargets,
  swappedOrders,
  type ExperienceView,
  type ExperienceWriteRequest,
} from '@/lib/domain/experience';
import { Button, Card, EmptyState, Input, Textarea, useToast } from '@/ui/primitives';
import { revalidateExperiences } from './actions';
import styles from './Experience.module.css';
import propertyStyles from '@/features/property/Property.module.css';

/**
 * A property's signature experiences — doc 67 §1's section 5, written here and
 * read by a guest on the property detail.
 *
 * <h2>This is the panel that unblocks publishing</h2>
 *
 * Doc 52 §3.1 makes "≥1 signature experience" a publish invariant and
 * `PropertyCompletenessChecker` has always enforced it — but nothing could write
 * one, so every property was permanently `DRAFT`. The empty state therefore says
 * what is at stake rather than merely noting an absence.
 *
 * <h2>Three fields, by owner decision</h2>
 *
 * Title (required), description (optional), order. `timeOfDay` and `image` are
 * out of V1 scope — Step 16A.47 — so there is no control for either, and the
 * backend rejects them outright rather than accepting and dropping them.
 *
 * <h2>Reordering is two writes, not N</h2>
 *
 * Moving an item swaps its `sortOrder` with its neighbour's. A whole-list
 * renumber would be one PATCH per row and could leave the list half-renumbered
 * if one failed. The text is untouched: a locale the request omits keeps its
 * stored words, so a reorder never has to re-send the story to avoid erasing it.
 */
export function PropertyExperiencesPanel({
  propertyId,
  experiences,
}: {
  readonly propertyId: string;
  readonly experiences: readonly ExperienceView[];
}) {
  const router = useRouter();
  const { show } = useToast();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The experience being edited, or `'new'`, or nothing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function openNew() {
    setDraft(emptyDraft());
    setEditing('new');
    setError(null);
  }

  function openEdit(experience: ExperienceView) {
    setDraft({
      titleVi: experience.titles['vi'] ?? '',
      titleEn: experience.titles['en'] ?? '',
      descriptionVi: experience.descriptions['vi'] ?? '',
      descriptionEn: experience.descriptions['en'] ?? '',
      sortOrder: experience.sortOrder,
    });
    setEditing(experience.id);
    setError(null);
  }

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await revalidateExperiences(propertyId);
      router.refresh();
      setEditing(null);
      show('success', done);
    } catch (caught) {
      // The console mapping: the backend's own words, which name the field and
      // the locale. A friendlier sentence would hide both.
      setError(caught instanceof ApiError ? messageFor(caught) : 'Không lưu được.');
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const body = toRequest(draft);
    if (editing === 'new') {
      return run('save', () => experiencesApi.create(propertyId, {
        ...body,
        sortOrder: nextSortOrder(experiences),
      }), 'Đã thêm trải nghiệm.');
    }
    const experienceId = editing as string;
    return run('save', () => experiencesApi.update(propertyId, experienceId, body),
      'Đã lưu trải nghiệm.');
  }

  function move(id: string, direction: 'up' | 'down') {
    const targets = swapTargets(experiences, id, direction);
    if (targets === null) {
      return undefined;
    }
    const { moving, other } = targets;
    const { movingTo, otherTo } = swappedOrders(moving, other, direction);

    // Sequential, not concurrent: two PATCHes on sibling rows of the same
    // property, and ordering them keeps the intermediate state readable if the
    // second one fails.
    return run(`move-${id}`, async () => {
      await experiencesApi.update(propertyId, moving.id, { translations: {}, sortOrder: movingTo });
      await experiencesApi.update(propertyId, other.id, { translations: {}, sortOrder: otherTo });
    }, 'Đã đổi thứ tự.');
  }

  const titleGiven = draft.titleVi.trim() !== '' || draft.titleEn.trim() !== '';

  return (
    <Card
      title="Trải nghiệm đặc trưng"
      actions={
        editing === null ? (
          <Button variant="secondary" onClick={openNew}>Thêm trải nghiệm</Button>
        ) : null
      }
    >
      <p className={propertyStyles.pageIntro}>
        Những điều chỉ khách sạn này mới có — bữa sáng trên sân thượng, giờ hoàng hôn ở quầy bar.
        Cần ít nhất một trải nghiệm trước khi gửi duyệt.
      </p>

      {error === null ? null : (
        <p className={propertyStyles.publishError} role="alert">{error}</p>
      )}

      {editing === null ? null : (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>
            {editing === 'new' ? 'Trải nghiệm mới' : 'Sửa trải nghiệm'}
          </h3>

          <div className={styles.editorGrid}>
            <Input
              id="experience-title-vi"
              label="Tên (tiếng Việt)"
              value={draft.titleVi}
              maxLength={160}
              onChange={(event) => setDraft((d) => ({ ...d, titleVi: event.target.value }))}
            />
            <Input
              id="experience-title-en"
              label="Tên (tiếng Anh)"
              value={draft.titleEn}
              maxLength={160}
              onChange={(event) => setDraft((d) => ({ ...d, titleEn: event.target.value }))}
            />
          </div>

          <Textarea
            id="experience-description-vi"
            label="Mô tả (tiếng Việt)"
            optionalLabel="không bắt buộc"
            rows={3}
            value={draft.descriptionVi}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionVi: event.target.value }))}
          />
          <Textarea
            id="experience-description-en"
            label="Mô tả (tiếng Anh)"
            optionalLabel="không bắt buộc"
            rows={3}
            value={draft.descriptionEn}
            onChange={(event) => setDraft((d) => ({ ...d, descriptionEn: event.target.value }))}
          />

          <p className={styles.editorHint}>
            Khách chỉ thấy trải nghiệm ở ngôn ngữ đã có tên. Mô tả có thể để trống và bổ sung sau.
          </p>

          <div className={propertyStyles.formActions}>
            <Button onClick={save} disabled={busy !== null || !titleGiven}>
              {busy === 'save' ? 'Đang lưu…' : 'Lưu trải nghiệm'}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy !== null}>
              Huỷ
            </Button>
          </div>
        </div>
      )}

      {experiences.length === 0 ? (
        <EmptyState title="Chưa có trải nghiệm nào">
          Khách sạn cần ít nhất một trải nghiệm đặc trưng thì mới gửi duyệt được. Hãy mô tả một
          điều mà chỉ khách sạn này mang lại.
        </EmptyState>
      ) : (
        <ol className={styles.list}>
          {experiences.map((experience, index) => (
            <li key={experience.id} className={styles.item}>
              <div className={styles.itemHead}>
                <p className={styles.itemName}>
                  {experienceTitle(experience) ?? 'Chưa đặt tên'}
                </p>
                <span className={styles.itemPosition}>{index + 1}</span>
              </div>

              <dl className={styles.itemLocales}>
                {['vi', 'en'].map((locale) => (
                  <div key={locale}>
                    <dt>{locale === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}</dt>
                    <dd>
                      {experience.titles[locale] === undefined ? (
                        <span className={styles.missing}>Chưa có tên</span>
                      ) : (
                        experience.titles[locale]
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={styles.itemActions}>
                <Button
                  variant="ghost"
                  disabled={busy !== null || index === 0}
                  aria-label={`Đưa lên trên: ${experienceTitle(experience) ?? 'trải nghiệm'}`}
                  onClick={() => move(experience.id, 'up')}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy !== null || index === experiences.length - 1}
                  aria-label={`Đưa xuống dưới: ${experienceTitle(experience) ?? 'trải nghiệm'}`}
                  onClick={() => move(experience.id, 'down')}
                >
                  ↓
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => openEdit(experience)}
                >
                  Sửa
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `delete-${experience.id}`,
                      () => experiencesApi.remove(propertyId, experience.id),
                      'Đã xoá trải nghiệm.',
                    )
                  }
                >
                  {busy === `delete-${experience.id}` ? 'Đang xoá…' : 'Xoá'}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

interface Draft {
  readonly titleVi: string;
  readonly titleEn: string;
  readonly descriptionVi: string;
  readonly descriptionEn: string;
  readonly sortOrder: number;
}

function emptyDraft(): Draft {
  return {
    titleVi: '',
    titleEn: '',
    descriptionVi: '',
    descriptionEn: '',
    sortOrder: 0,
  };
}

/**
 * Only the locales that actually have a title are sent.
 *
 * A locale with a description but no title is dropped rather than sent: the
 * column is `NOT NULL`, so the backend would refuse it, and the Partner is
 * already prevented from saving by the disabled button.
 */
function toRequest(draft: Draft): ExperienceWriteRequest {
  const translations: Record<string, { title: string; description?: string }> = {};

  const add = (locale: string, title: string, description: string) => {
    if (title.trim() === '') {
      return;
    }
    translations[locale] = description.trim() === ''
      ? { title: title.trim() }
      : { title: title.trim(), description: description.trim() };
  };

  add('vi', draft.titleVi, draft.descriptionVi);
  add('en', draft.titleEn, draft.descriptionEn);

  return { translations, sortOrder: draft.sortOrder };
}
