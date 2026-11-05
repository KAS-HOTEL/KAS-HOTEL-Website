'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '@/features/auth/messages';
import { propertiesApi } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { slugFromName, uniqueSlug } from '@/lib/domain/property';
import { Button, Input, useToast } from '@/ui/primitives';
import { FormSection } from './FormSection';
import { revalidateProperties } from './actions';
import styles from './Property.module.css';

/**
 * Adding a hotel to the partner's estate.
 *
 * <h2>Two requests, because the API is two requests</h2>
 *
 * `POST /admin/properties` takes a name and a slug and nothing else — the
 * address columns live on `PATCH /{id}`. The form collects both in one screen
 * because that is one act to the operator, and then makes the two calls the
 * contract actually has. No endpoint was invented to flatten them.
 *
 * <p>The order matters when the second fails. The hotel exists after the first
 * call, so a failed address save leaves a real draft with a real name, and the
 * operator lands on its information page with the error shown rather than
 * losing the hotel they just created. The reverse order has no such recovery.
 *
 * <h2>The slug is derived, never typed</h2>
 *
 * `property.slug` is a routing key with a database CHECK on its shape. Asking a
 * hotelier for one would be the most technical field in the console, in front of
 * the person it serves least — so {@link slugFromName} derives it and
 * {@link uniqueSlug} steps around names the partner has already used. It is
 * shown, read-only and clearly labelled as the web address, because it does
 * become part of a public URL and a surprise there is worse than a plain fact.
 *
 * <h2>One submission</h2>
 *
 * The button is disabled for the whole of the round trip. A double click on a
 * creation form is the one that leaves two hotels behind, and neither the
 * endpoint nor the table has an idempotency key to lean on.
 */
export function CreatePropertyForm({
  existingSlugs,
}: {
  /**
   * Slugs already used in this partner's own estate, so the derived one can
   * step around them before the server has to refuse it.
   *
   * <p>Deliberately not "every slug in the system": the console cannot see
   * another partner's properties and must not learn them from a uniqueness
   * probe. A collision across partners comes back as a field error instead.
   */
  readonly existingSlugs: readonly string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [ward, setWard] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const trimmedName = name.trim();
  const slug = uniqueSlug(slugFromName(trimmedName), existingSlugs);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setFormError(null);
    setFieldErrors({});

    if (trimmedName === '') {
      setFieldErrors({ name: 'Nhập tên khách sạn.' });
      return;
    }
    if (slug === '') {
      // A name of punctuation alone leaves nothing a URL can carry. Said before
      // the request rather than after the database refuses it.
      setFieldErrors({
        name: 'Tên cần có ít nhất một chữ cái hoặc chữ số để tạo địa chỉ trang.',
      });
      return;
    }

    setSaving(true);
    try {
      const created = await propertiesApi.create({ slug, name: trimmedName });

      // Only when the operator actually filled something in: a PATCH of three
      // empty strings would write blanks over columns the create left null, and
      // the completeness checker counts blank as missing either way.
      const address = {
        ...(district.trim() === '' ? {} : { district: district.trim() }),
        ...(ward.trim() === '' ? {} : { ward: ward.trim() }),
        ...(city.trim() === '' ? {} : { city: city.trim() }),
        ...(phone.trim() === '' ? {} : { phone: phone.trim() }),
      };

      if (Object.keys(address).length > 0) {
        try {
          await propertiesApi.update(created.id, { version: created.version, ...address });
        } catch (addressFailure) {
          // The hotel is already real. Say what happened, send them to the page
          // that can finish it, and do not pretend the whole thing failed.
          await revalidateProperties();
          toast.show(
            'warning',
            'Đã tạo khách sạn nhưng chưa lưu được địa chỉ. Vui lòng kiểm tra lại thông tin.',
            addressFailure instanceof ApiError && addressFailure.correlationId !== null
              ? addressFailure.correlationId
              : undefined,
          );
          router.replace(`/partner/properties/${created.id}/information`);
          return;
        }
      }

      await revalidateProperties();
      toast.show('success', `Đã tạo ${trimmedName}.`);
      router.replace(`/partner/properties/${created.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const fields = caught.fieldErrors();
        setFieldErrors(
          // The server's complaint is about the slug, which this form does not
          // show as an input — so it is reported against the field the operator
          // can actually change.
          fields['slug'] === undefined
            ? fields
            : { ...fields, name: 'Tên này đã được dùng. Hãy chọn một tên khác.' },
        );
        setFormError(messageFor(caught));
      } else {
        setFormError('Không thể kết nối tới hệ thống. Vui lòng thử lại.');
      }
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError === null ? null : (
        <div className={styles.formAlert} role="alert">
          <p className={styles.formAlertText}>{formError}</p>
        </div>
      )}

      <FormSection
        title="Thông tin cơ bản"
        note="Tên khách sạn sẽ hiển thị cho khách và trong toàn bộ hệ thống KAS."
      >
        <div className={styles.formGrid}>
          <Input
            id="create-name"
            label="Tên khách sạn"
            required
            value={name}
            maxLength={200}
            autoComplete="off"
            placeholder="Kas Riverside Hotel"
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors['name']}
            disabled={saving}
          />
          {/*
            Read-only, and present rather than hidden. It becomes part of the
            public address for this hotel, so an operator who later sees it in a
            URL should have met it once here instead of wondering where it came
            from. There is no input to get wrong.
          */}
          <Input
            id="create-slug"
            label="Địa chỉ trang"
            readOnly
            value={slug === '' ? '—' : slug}
            description="Tự động tạo từ tên khách sạn."
            optionalLabel="tự động"
            tabIndex={-1}
          />
        </div>
      </FormSection>

      <FormSection
        title="Địa chỉ & liên hệ"
        note="Có thể bổ sung sau. Khách sạn cần địa chỉ đầy đủ trước khi gửi duyệt."
      >
        <div className={styles.formGrid}>
          <Input
            id="create-district"
            label="Quận / Huyện"
            value={district}
            maxLength={120}
            onChange={(event) => setDistrict(event.target.value)}
            error={fieldErrors['district']}
            disabled={saving}
          />
          <Input
            id="create-ward"
            label="Phường / Xã"
            value={ward}
            maxLength={120}
            onChange={(event) => setWard(event.target.value)}
            error={fieldErrors['ward']}
            disabled={saving}
          />
          <Input
            id="create-city"
            label="Tỉnh / Thành phố"
            value={city}
            maxLength={120}
            onChange={(event) => setCity(event.target.value)}
            error={fieldErrors['city']}
            disabled={saving}
          />
          <Input
            id="create-phone"
            label="Điện thoại"
            type="tel"
            inputMode="tel"
            value={phone}
            maxLength={40}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrors['phone']}
            disabled={saving}
          />
        </div>
      </FormSection>

      <div className={styles.formActions}>
        <Button type="submit" loading={saving} disabled={saving}>
          {saving ? 'Đang tạo…' : 'Tạo khách sạn'}
        </Button>
        <Button
          variant="secondary"
          type="button"
          disabled={saving}
          onClick={() => router.push('/partner/properties')}
        >
          Huỷ
        </Button>
      </div>

      {/* Stated up front, because "created" and "live" are different things and
          the difference is the whole review workflow. */}
      <p className={styles.formNote}>
        Khách sạn mới được tạo ở trạng thái bản nháp. Bạn có thể bổ sung phòng, hình ảnh và giá
        trước khi gửi duyệt.
      </p>
    </form>
  );
}
