# KAS Admin V4

This build adds:
- Editable room rates for Jul-Sep, Oct, Nov-Jan with weekday/weekend values.
- Editable KAS Collection hero/card image for each of the 8 branches.
- Persistent runtime config stored under `KAS_CONFIG_DIR` (Render: `/var/data/kas-config`).
- Persistent uploads under `UPLOAD_DIR` (Render: `/var/data/uploads`).
- Live rate overlay into the existing hotel/room flow so edited rates propagate without rebuilding the static rate sheet.

Render environment variables:
- `ADMIN_KEY` = your admin password
- `UPLOAD_DIR` = `/var/data/uploads`
- `KAS_CONFIG_DIR` = `/var/data/kas-config` (optional; recommended for explicitness)
