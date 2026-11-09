'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { propertiesApi } from '@/lib/api/endpoints/properties';
import { ApiError } from '@/lib/api/errors';
import { adminError } from '@/features/adminTools/useAdminList';
import { Button, ConfirmDialog, useToast } from '@/ui/primitives';

/**
 * "Xoá bản nháp" for a hotel that was never published — ADMIN only (owner decision
 * 2026-11-08). A hard delete: the hotel, its room types and their prices go; the backend
 * refuses (409) a hotel that was ever published or has booking or review history.
 */
export function DeleteDraftButton({ propertyId, name }: { readonly propertyId: string; readonly name: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { show } = useToast();

  async function remove() {
    setBusy(true);
    try {
      await propertiesApi.remove(propertyId);
      setOpen(false);
      show('success', `Đã xoá bản nháp “${name}”.`);
      router.refresh();
    } catch (caught) {
      setOpen(false);
      show('error', refusalMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} aria-label={`Xoá bản nháp ${name}`}>
        Xoá
      </Button>
      <ConfirmDialog
        open={open}
        title={`Xoá bản nháp “${name}”?`}
        confirmLabel="Xoá vĩnh viễn"
        cancelLabel="Giữ lại"
        destructive
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void remove()}
      >
        <p>
          <strong>Không thể khôi phục.</strong> Khách sạn, các hạng phòng, giá và vị trí ảnh của
          khách sạn này sẽ bị xoá. Ảnh đã tải lên vẫn còn trong kho ảnh.
        </p>
      </ConfirmDialog>
    </>
  );
}

function refusalMessage(caught: unknown): string {
  if (caught instanceof ApiError && caught.status === 409) {
    const code = caught.details[0]?.code;
    if (code === 'HAS_HISTORY') return 'Không thể xoá: khách sạn đã có đặt phòng hoặc đánh giá.';
    if (code === 'NOT_DRAFT') return 'Chỉ xoá được khách sạn nháp chưa từng xuất bản.';
  }
  return adminError(caught);
}
