'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '@/features/auth/messages';
import { propertiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import type { PropertyAdminView, UpdatePropertyRequest } from '@/lib/domain/property';
import { Button, Input, Textarea, useToast } from '@/ui/primitives';
import { FormSection } from './FormSection';
import overviewStyles from './Overview.module.css';
import { revalidateProperties } from './actions';
import styles from './Property.module.css';

/**
 * Editing a property's own information.
 *
 * <h2>Exactly the fields the API accepts</h2>
 *
 * Name per locale, district, ward, city, phone, latitude, longitude — the whole
 * of what `POST`/`PATCH /admin/properties` take. Lifecycle, flagship and sort order are
 * displayed on the overview and are not editable here: a Partner publishing
 * their own hotel by PATCHing a state is precisely what the approval workflow
 * exists to prevent, and the request record has no field for it.
 *
 * <h2>The version is the whole point</h2>
 *
 * It is loaded with the property, held in state, sent with every save, and
 * replaced from each response. A stale one comes back as 409 and the Partner is
 * told to reload — which is the behaviour that replaced "both saves succeed and
 * the second silently erases the first".
 *
 * <h2>Clearing a value is not expressible</h2>
 *
 * `PATCH` treats a null field as "leave unchanged" (`coalesce`), so the contract
 * has no way to say "make this empty". Rather than send `""` and quietly store a
 * blank string where NULL is meant, the form refuses to submit a cleared field
 * and says why. Silently ignoring the edit would be worse than either — the
 * Partner would watch their change disappear on reload. Recorded as OQ-136.
 *
 * <p>The coordinates added in Step 16A.46 inherit that rule rather than getting
 * an exception to it. They can be authored and corrected, but a stored point
 * cannot be removed — so no "clear coordinates" control is offered, because the
 * route has no way to carry out what such a control would promise.
 */

interface Draft {
  readonly nameVi: string;
  readonly nameEn: string;
  /** Doc 23 §3.2: ≤ 90 characters, and a publish invariant (doc 52 §3.1). */
  readonly signatureVi: string;
  readonly signatureEn: string;
  /** Doc 23 §3.2: ≤ 220 characters, required in **both** locales to publish. */
  readonly shortVi: string;
  readonly shortEn: string;
  readonly district: string;
  readonly ward: string;
  readonly city: string;
  readonly phone: string;
  /**
   * Held as text, like every other field, even though the API takes a number.
   *
   * That is what lets {@link clearedFields} see an emptied coordinate the same
   * way it sees an emptied ward. A `number | null` draft would make "never
   * filled in" and "just deleted" the same value, and the OQ-136 refusal below
   * would go quiet for exactly the two fields whose stored value a Partner is
   * most likely to want to correct.
   */
  readonly latitude: string;
  readonly longitude: string;
}

const CLEARING_UNSUPPORTED = 'Chưa thể xoá giá trị đã lưu. Hãy nhập giá trị mới.';

/**
 * The coordinate bounds, taken from the database's own `property_lat_range` and
 * `property_lng_range` checks and mirrored by the backend's `@DecimalMin` /
 * `@DecimalMax` since Step 16A.45.
 *
 * Checked here as well as there so the Partner is told before a round trip, not
 * because the browser is trusted: the backend refuses the same values whatever
 * this file does. Nothing narrower is imposed — no mandatory pair, no "inside
 * Ho Chi Minh City", no rounding — because nothing in the contract says so.
 */
const BOUNDS = {
  latitude: { min: -90, max: 90, message: 'Vĩ độ nằm trong khoảng -90 đến 90.' },
  longitude: { min: -180, max: 180, message: 'Kinh độ nằm trong khoảng -180 đến 180.' },
} as const;

const NOT_A_NUMBER = 'Nhập toạ độ dạng số thập phân, ví dụ 10.772500.';

export function PropertyInformationForm({ property }: { readonly property: PropertyAdminView }) {
  const router = useRouter();
  const toast = useToast();

  const initial = toDraft(property);
  const [draft, setDraft] = useState<Draft>(initial);
  const [version, setVersion] = useState<number>(property.version);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  // Adopt a newer server record when one arrives.
  //
  // `useState` initialisers do not re-run for a prop change, so without this the
  // form keeps the `version` it first mounted with no matter what the server
  // later says. That breaks the one recovery this form offers: the conflict
  // alert tells the Partner to reload and try again, "Tải lại thông tin mới
  // nhất" calls `router.refresh()`, the Server Component re-renders with the
  // current record — and the form went on holding the stale version, so the
  // retry failed with the very same conflict. The only way out was a full
  // browser reload, which the page never mentions.
  //
  // Resetting the draft too is what the button's own label promises: the latest
  // information, not the latest version number under the old text. The trade is
  // deliberate — edits made after the conflict are dropped, because they were
  // written against a record the server has already replaced, and silently
  // saving them over the newer one is the worse of the two.
  //
  // The stamp carries the id as well as the version, because two different
  // properties can sit at the same version: keying on the number alone would let
  // a move from one hotel's editor to another's leave the previous hotel's draft
  // on screen under the new hotel's heading.
  //
  // Written during render rather than in an effect: React's documented way to
  // adjust state on a prop change, and it re-renders before the browser paints,
  // so no stale frame is ever shown.
  const serverStamp = `${property.id}@${property.version}`;
  const [loadedStamp, setLoadedStamp] = useState<string>(serverStamp);
  if (serverStamp !== loadedStamp) {
    setLoadedStamp(serverStamp);
    setVersion(property.version);
    setDraft(initial);
    setConflict(false);
    setFormError(null);
    setFieldErrors({});
  }

  const dirty = isDirty(initial, draft);

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setConflict(false);

    // Both checks at once, not the first one that trips: a Partner fixing one
    // problem per save is the slow loop the backend already refuses to impose
    // when it reports every bad locale together.
    const problems = { ...clearedFields(initial, draft), ...coordinateErrors(draft) };
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems);
      return;
    }
    setFieldErrors({});

    const body = requestFrom(draft, version);
    setSaving(true);
    try {
      const saved = await propertiesApi.update(property.id, body);
      // The response is authoritative for the next save. Keeping the old version
      // would make the very next edit fail with a conflict of our own making.
      setVersion(saved.version);
      await revalidateProperties();
      router.refresh();
      toast.show('success', 'Đã lưu thông tin khách sạn.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors(mapFieldErrors(caught));
        setFormError(messageFor(caught));
        setConflict(caught.isConflict);
      } else {
        // Never surface the raw exception — it can carry a URL or an internal
        // hostname.
        setFormError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError === null ? null : (
        <div className={styles.formAlert} role="alert">
          <p className={styles.formAlertText}>{formError}</p>
          {conflict ? (
            // A conflict is the one error the Partner cannot fix by retyping.
            // Reloading is the action, so it is offered rather than described.
            <Button variant="secondary" onClick={() => router.refresh()}>
              Tải lại thông tin mới nhất
            </Button>
          ) : null}
        </div>
      )}

      <FormSection
        title="Thông tin cơ bản"
        note="Tên và mô tả ngắn cần có ở cả hai ngôn ngữ trước khi gửi duyệt."
      >
        <div className={overviewStyles.formFields}>
          <Input
            id="name-vi"
            label="Tên khách sạn (Tiếng Việt)"
            value={draft.nameVi}
            onChange={set('nameVi')}
            error={fieldErrors['nameVi']}
            maxLength={200}
          />
          <Input
            id="name-en"
            label="Tên khách sạn (English)"
            value={draft.nameEn}
            onChange={set('nameEn')}
            error={fieldErrors['nameEn']}
            maxLength={200}
          />

          {/*
            The publish gate's own fields. Doc 52 §3.1 makes a signature line and
            both-locale short descriptions invariants of a publishable property,
            and the completeness check has always demanded them — but until Step
            16A.27 no endpoint could write them, so these inputs are what make
            that half of the gate satisfiable at all.
          */}
          <Input
            id="signature-vi"
            label="Câu giới thiệu (Tiếng Việt)"
            value={draft.signatureVi}
            onChange={set('signatureVi')}
            error={fieldErrors['signatureVi']}
            maxLength={90}
          />
          <Input
            id="signature-en"
            label="Câu giới thiệu (English)"
            value={draft.signatureEn}
            onChange={set('signatureEn')}
            error={fieldErrors['signatureEn']}
            maxLength={90}
          />

          {/* A 220-character sentence in a half-width column is unreadable. */}
          <div className={overviewStyles.formFieldWide}>
            <Textarea
              id="short-vi"
              label="Mô tả ngắn (Tiếng Việt)"
              value={draft.shortVi}
              onChange={set('shortVi')}
              error={fieldErrors['shortVi']}
              maxLength={220}
              rows={3}
            />
          </div>
          <div className={overviewStyles.formFieldWide}>
            <Textarea
              id="short-en"
              label="Mô tả ngắn (English)"
              value={draft.shortEn}
              onChange={set('shortEn')}
              error={fieldErrors['shortEn']}
              maxLength={220}
              rows={3}
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Địa chỉ & liên hệ">
        <div className={overviewStyles.formFields}>
          <Input
            id="ward"
            label="Phường/Xã"
            value={draft.ward}
            onChange={set('ward')}
            error={fieldErrors['ward']}
            maxLength={120}
          />
          <Input
            id="district"
            label="Quận/Huyện"
            value={draft.district}
            onChange={set('district')}
            error={fieldErrors['district']}
            maxLength={120}
          />
          <Input
            id="city"
            label="Tỉnh/Thành phố"
            value={draft.city}
            onChange={set('city')}
            error={fieldErrors['city']}
            maxLength={120}
          />
          <Input
            id="phone"
            label="Điện thoại"
            type="tel"
            value={draft.phone}
            onChange={set('phone')}
            error={fieldErrors['phone']}
            maxLength={40}
          />

          {/*
            Typed, not picked from a map. Step 16A.46 makes the column the
            backend has accepted since 16A.45 reachable, and nothing more: there
            is no map provider, no geocoder and no address lookup behind these
            two inputs, so whatever a Partner enters is what is stored.

            `step` is the column's own scale — numeric(9,6) — rather than a
            precision rule invented here.
          */}
          <Input
            id="latitude"
            label="Vĩ độ"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min={BOUNDS.latitude.min}
            max={BOUNDS.latitude.max}
            value={draft.latitude}
            onChange={set('latitude')}
            error={fieldErrors['latitude']}
            description="Từ -90 đến 90"
          />
          <Input
            id="longitude"
            label="Kinh độ"
            type="number"
            inputMode="decimal"
            step="0.000001"
            min={BOUNDS.longitude.min}
            max={BOUNDS.longitude.max}
            value={draft.longitude}
            onChange={set('longitude')}
            error={fieldErrors['longitude']}
            description="Từ -180 đến 180"
          />
        </div>
      </FormSection>

      <div className={styles.formActions}>
        {/*
          Announced, not just coloured: an operator who has been typing for a
          minute should be told there is something to save without having to
          infer it from an enabled button.
        */}
        <p className={styles.dirtyHint} role="status">
          {dirty ? 'Có thay đổi chưa lưu.' : 'Không có thay đổi nào.'}
        </p>
        <Button type="submit" loading={saving} disabled={saving || !dirty}>
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}

/**
 * Whether anything on the form differs from what the backend returned.
 *
 * <h2>Why the button must be gated on this</h2>
 *
 * `PATCH /admin/properties/{id}` bumps `version` whether or not a column
 * changed — the SQL is an unconditional `version = p.version + 1`, and it has to
 * be, because a rename lives in another table and would otherwise leave the row
 * untouched. So an idle click is not a no-op: it invalidates the `version`
 * every other open editor is holding, and their next save fails with a 409 they
 * did nothing to cause.
 *
 * <p>The amenities panel on this same page has always gated its save this way.
 * The form did not, which is the inconsistency this closes.
 */
function isDirty(initial: Draft, draft: Draft): boolean {
  return (Object.keys(initial) as (keyof Draft)[]).some((key) => initial[key] !== draft[key]);
}

function toDraft(property: PropertyAdminView): Draft {
  return {
    nameVi: property.names['vi'] ?? '',
    nameEn: property.names['en'] ?? '',
    signatureVi: property.signatureLines['vi'] ?? '',
    signatureEn: property.signatureLines['en'] ?? '',
    shortVi: property.shortDescriptions['vi'] ?? '',
    shortEn: property.shortDescriptions['en'] ?? '',
    district: property.district ?? '',
    ward: property.ward ?? '',
    city: property.city,
    phone: property.phone ?? '',
    // A property with no point shows two empty boxes. The obvious-looking
    // alternative — seeding the city centre so the map has something — would
    // put a coordinate no one authored one save away from being stored as if
    // someone had.
    latitude: coordinateText(property.latitude),
    longitude: coordinateText(property.longitude),
  };
}

/**
 * A stored coordinate as the Partner should see it.
 *
 * `String` and not `toFixed(6)`: the column keeps six decimal places, but
 * padding 10.7725 back out to 10.772500 in the input would be this form
 * deciding how many digits the Partner meant. The value round-trips either way.
 */
function coordinateText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/**
 * Only what the Partner actually filled in.
 *
 * A blank field is omitted, which `PATCH` reads as "leave unchanged" — the same
 * rule the backend applies, so an untouched draft field cannot overwrite a value
 * someone else set.
 */
function requestFrom(draft: Draft, version: number): UpdatePropertyRequest {
  const names: Record<string, string> = {};
  if (draft.nameVi.trim() !== '') {
    names['vi'] = draft.nameVi.trim();
  }
  if (draft.nameEn.trim() !== '') {
    names['en'] = draft.nameEn.trim();
  }

  const signatureLines = perLocale(draft.signatureVi, draft.signatureEn);
  const shortDescriptions = perLocale(draft.shortVi, draft.shortEn);

  return {
    version,
    ...(Object.keys(names).length > 0 ? { names } : {}),
    ...(Object.keys(signatureLines).length > 0 ? { signatureLines } : {}),
    ...(Object.keys(shortDescriptions).length > 0 ? { shortDescriptions } : {}),
    ...optional('district', draft.district),
    ...optional('ward', draft.ward),
    ...optional('city', draft.city),
    ...optional('phone', draft.phone),
    ...optionalNumber('latitude', draft.latitude),
    ...optionalNumber('longitude', draft.longitude),
  };
}

/**
 * The numeric counterpart of {@link optional} — blank omitted, everything else
 * sent as a number.
 *
 * Only ever reached after {@link coordinateErrors} has passed, which is what
 * keeps `NaN` out: `JSON.stringify` turns it into `null`, and the backend reads
 * a null as "leave unchanged", so an unreadable coordinate would be dropped in
 * transit and the Partner would watch their edit vanish on reload.
 */
function optionalNumber(key: string, value: string): Record<string, number> {
  return value.trim() === '' ? {} : { [key]: Number(value.trim()) };
}

/**
 * The coordinate fields, checked against {@link BOUNDS}.
 *
 * A blank is not an error here — it means "leave the stored value alone", the
 * same thing a blank means for every other field on this form. An emptied one
 * is {@link clearedFields}' business, and the two cannot both fire for the same
 * field.
 *
 * Nothing is clamped or rounded on the way through. A latitude of 91 is
 * reported, not quietly turned into 90: the Partner typed a real number and
 * deserves to know it was refused rather than silently altered.
 */
function coordinateErrors(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, bound] of Object.entries(BOUNDS)) {
    const text = draft[key as 'latitude' | 'longitude'].trim();
    if (text === '') {
      continue;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      errors[key] = NOT_A_NUMBER;
    } else if (value < bound.min || value > bound.max) {
      errors[key] = bound.message;
    }
  }
  return errors;
}

/**
 * The two locales of one field, blanks omitted.
 *
 * The backend reads a blank as "clear this", but the form does not offer
 * clearing for any field yet — {@link clearedFields} says so plainly rather than
 * letting an accidental deletion through — so a blank here means "untouched".
 */
function perLocale(vi: string, en: string): Record<string, string> {
  return { ...optional('vi', vi), ...optional('en', en) };
}

function optional(key: string, value: string): Record<string, string> {
  return value.trim() === '' ? {} : { [key]: value.trim() };
}

/** Fields that held a value and have been emptied — see the class note. */
function clearedFields(initial: Draft, draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(initial) as (keyof Draft)[]) {
    if (initial[key].trim() !== '' && draft[key].trim() === '') {
      errors[key] = CLEARING_UNSUPPORTED;
    }
  }
  return errors;
}

/**
 * Backend field paths, mapped onto the inputs that own them.
 *
 * Bean validation reports a map entry as `names[vi]` and the service reports an
 * unsupported locale as `names.fr`, so both shapes are folded onto the input the
 * Partner can actually act on. Anything unrecognised is left to the form-level
 * message rather than silently dropped.
 */
/**
 * The per-locale request fields, and the input each locale belongs to.
 *
 * Longest path first is not needed — no path is a prefix of another — but the
 * order is the order the card renders them, so a reader can check the list
 * against the form.
 */
const LOCALISED_FIELDS = [
  { path: 'names', vi: 'nameVi', en: 'nameEn' },
  { path: 'signatureLines', vi: 'signatureVi', en: 'signatureEn' },
  { path: 'shortDescriptions', vi: 'shortVi', en: 'shortEn' },
] as const;

export function mapFieldErrors(error: ApiError): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fieldErrors())) {
    const localised = LOCALISED_FIELDS.find((entry) => field.startsWith(entry.path));
    if (localised !== undefined) {
      const locale = field.match(/[.[]([a-z]{2})[\]]?$/i)?.[1];
      mapped[locale === 'en' ? localised.en : localised.vi] = message;
      continue;
    }
    mapped[field] = message;
  }
  return mapped;
}
