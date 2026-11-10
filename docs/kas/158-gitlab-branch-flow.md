# 158 — Quy trình nhánh GitLab: feature → staging → main (06/11/2026)

Áp dụng cho `KAS-WEB/kas-web-full` trên https://gitlab.kasbookingapp.com. Thay cho cách cũ (làm trên `snapshot/2026-10-24`, bấm deploy bằng tay, hoặc chạy `publish-webdemo.sh` từ máy cá nhân).

## 1. Các nhánh

| Nhánh | Bảo vệ | Ai merge | Khi có merge, pipeline làm gì |
|---|---|---|---|
| `main` | Không ai push, không force push | Maintainer (leader) | Build image production. Nếu đã có deploy hook của Render (doc 157) thì deploy production luôn |
| `staging` (nhánh mặc định) | Không ai push, không force push | Maintainer (leader) | Tự deploy lên hệ thống test https://webdemo.kasbookingapp.com, sau đó chạy kiểm tra |
| `feat/<task>`, `fix/<task>` | Không | — | Chỉ chạy test |

## 2. Các bước làm

1. **Dev nhận task**, tạo nhánh từ `staging` mới nhất:
   ```bash
   git fetch gitlab && git switch -c feat/ten-chuc-nang gitlab/staging
   ```
2. Làm và test ở máy local (`run-kas-local`). Commit, rồi push nhánh: `git push -u gitlab feat/ten-chuc-nang`.
3. **Tạo Merge Request vào `staging`.** Pipeline của MR chạy các bước:
   - `mr:target`: kiểm tra MR có nhắm đúng nhánh không;
   - `backend:test`: test backend với PostgreSQL 17;
   - `console:test`: typecheck, lint, vitest và build Next.js;
   - `website:check`: kiểm tra cú pháp website.

   GitLab không cho merge khi pipeline chưa xanh hoặc còn thread review chưa resolve.
4. **Leader review code**, rồi bấm Merge.
5. Merge vào `staging` thì pipeline tự chạy:
   - `deploy:staging`: build và chạy bản mới trên webdemo. Database được sao lưu trước. Nếu bản mới không lên được, server tự quay về bản cũ;
   - `verify:staging`: kiểm tra health và các trang chính;
   - `smoke:staging`: bộ kiểm tra hồi quy chỉ đọc trong `qa/smoke`. Bước này chỉ báo kết quả, không chặn pipeline.
6. **QC test trên webdemo.** Nếu có lỗi, dev sửa trên một nhánh `fix/...` mới rồi quay lại bước 3.

   Nếu cần quay về bản trước ngay lập tức, leader bấm job thủ công `rollback:staging` trong pipeline của `staging`. Lưu ý job này **không** khôi phục database.
7. **QC đồng ý → leader tạo MR `staging` → `main` và merge.** Job `mr:target` chặn mọi MR vào `main` không xuất phát từ `staging`. Merge vào `main` thì pipeline build image production và deploy lên production (doc 157).

## 3. Cài đặt GitLab đang áp dụng

Những cài đặt sau được cấu hình bằng API, dùng token trong `.env-gitlab`:

- Nhánh mặc định là `staging`, nên MR mới mặc định nhắm vào `staging`.
- Cả `main` và `staging` đều được bảo vệ: Allowed to push = No one, Allowed to merge = Maintainers, không cho force push.
- Merge request:
  - phải có pipeline thành công mới được merge;
  - pipeline bị bỏ qua (skipped) không được tính là thành công;
  - mọi thread phải được resolve;
  - nhánh nguồn tự xóa sau khi merge. Nhánh được bảo vệ (`staging`) thì không bao giờ bị xóa.
- Các biến CI `WEBDEMO_SSH_KEY`, `WEBDEMO_SSH_KNOWN_HOSTS` và `DOCKERHUB_*` đều để **Protected**. Chỉ pipeline của `staging` và `main` đọc được chúng, nên nhánh feature không thể deploy và không lấy được secret.
- **Phân quyền:** dev phải có vai trò **Developer**: được push nhánh feature và tạo MR, nhưng không merge được vào nhánh được bảo vệ. Leader có vai trò **Maintainer**. Hiện project mới chỉ có tài khoản `duke.kashotel` (Owner); thành viên được thêm ở *Manage → Members*.

## 4. Deploy lên webdemo (server kas-staging 202.143.110.15)

- Khóa SSH của CI bị giới hạn trong `authorized_keys` bằng `restrict,command="/srv/kas-web/bin/ci-gate.sh"`. Khóa này chỉ chạy được ba lệnh: `deploy <tên>` (gói mã nguồn gửi qua stdin), `rollback` và `status`. Không có shell, không dùng được scp hay port forwarding.
- Bản gốc của các file này nằm ở `deploy/webdemo/` (`deploy.sh`, `ci-gate.sh`, `compose.yml`). Chúng được cài lên server bằng tay, xem README trong thư mục đó.
- Image trên webdemo được build bằng chính các file `docker/*.Dockerfile` của bản release, tức là cùng file dùng để build image production.

## 5. Thời gian build image

Ngày 06/11/2026, job `build:images` mất 29 phút. Phần build chỉ mất khoảng 3 phút; khoảng 25 phút còn lại là đẩy image từ VPS lên Docker Hub. Riêng image console có 555 MB layer ứng dụng, mất khoảng 20 phút.

Các thay đổi đã làm:
- **Console** dùng `output: 'standalone'` của Next.js (bật khi build image, qua biến `KAS_NEXT_STANDALONE=1`). Layer ứng dụng giảm từ khoảng 555 MB xuống khoảng 58 MB. Phần `node_modules` đã trace nằm ở một layer riêng, chỉ đổi khi `package-lock.json` thay đổi.
- **Backend** giải nén jar theo các layer của Spring Boot, thư viện nằm ở layer dưới. Khi chỉ sửa code thì chỉ layer `application` (nhỏ) thay đổi.
- **CI** dùng inline cache, lấy `:latest` từ registry nội bộ (đường truyền nhanh) làm cache. Layer không đổi giữ nguyên digest, nên Docker Hub báo "Layer already exists" thay vì nhận lại toàn bộ.
- Ba image được push song song. Tag `:latest` được push sau, để không có hai lượt push cùng tải lên một layer.

Runner (`kas-staging-runner`) chạy chung máy với webdemo và app staging của nhóm khác. Máy có 4 CPU, 3,7 GB RAM, chạy tối đa 2 job cùng lúc. Nếu pipeline vẫn chậm, bước tiếp theo nên là chuyển runner sang một máy riêng.
