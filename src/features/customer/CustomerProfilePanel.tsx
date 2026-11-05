'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Image from 'next/image';
import type { Locale } from '@/config/env';
import { customerProfileApi } from '@/lib/api/endpoints';
import type { CustomerProfile } from '@/lib/api/endpoints/customerProfile';
import { Button, Input } from '@/ui/primitives';
import styles from './CustomerProfilePanel.module.css';

export function CustomerProfilePanel({ profile, locale }: { profile: CustomerProfile; locale: Locale }) {
  const [name, setName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const vi = locale === 'vi';

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      setNotice(vi ? 'Chọn ảnh tối đa 5 MB.' : 'Choose an image up to 5 MB.');
      return;
    }
    setAvatar(URL.createObjectURL(file));
    setNotice(vi ? 'Ảnh đã chọn để xem trước. Lưu trữ ảnh sẽ khả dụng sau khi cấu hình kho ảnh.' : 'Preview selected. Persistent photo storage will be available after image storage is configured.');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      await customerProfileApi.update({ fullName: name.trim(), phone: phone.trim(), locale });
      setNotice(vi ? 'Đã lưu hồ sơ.' : 'Profile saved.');
    } catch {
      setNotice(vi ? 'Không thể lưu hồ sơ. Hãy thử lại.' : 'Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="profile-heading">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>MY KAS</p><h2 id="profile-heading">{vi ? 'Hồ sơ của bạn' : 'Your profile'}</h2></div>
        <span className={styles.tier}>{profile.tier ?? 'Silver'} · {profile.points.toLocaleString(locale)} {vi ? 'điểm' : 'points'}</span>
      </div>
      <div className={styles.content}>
        <div className={styles.avatarColumn}>
          <button className={styles.avatar} type="button" onClick={() => input.current?.click()} aria-label={vi ? 'Tải ảnh đại diện' : 'Upload profile photo'}>
            {avatar ? <Image src={avatar} alt="" width={104} height={104} unoptimized /> : <span>{name.trim().slice(0, 1).toUpperCase() || 'K'}</span>}
          </button>
          <button className={styles.upload} type="button" onClick={() => input.current?.click()}>{vi ? 'Tải ảnh đại diện' : 'Upload photo'}</button>
          <input ref={input} className={styles.file} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectAvatar} />
          <small>{vi ? 'JPG, PNG hoặc WebP · tối đa 5 MB' : 'JPG, PNG or WebP · up to 5 MB'}</small>
        </div>
        <form className={styles.form} onSubmit={save}>
          <Input id="profile-name" label={vi ? 'Họ và tên' : 'Full name'} required maxLength={200} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input id="profile-email" label="Email" value={profile.email} disabled readOnly />
          <Input id="profile-phone" label={vi ? 'Số điện thoại' : 'Phone number'} required minLength={3} maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <div className={styles.actions}><span role="status">{notice}</span><Button type="submit" loading={busy} disabled={busy || !name.trim() || !phone.trim()}>{vi ? 'Lưu thay đổi' : 'Save changes'}</Button></div>
        </form>
      </div>
    </section>
  );
}
