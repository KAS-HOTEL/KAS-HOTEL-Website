# Hệ thống test (staging): https://webdemo.kasbookingapp.com

Đây là các file chạy trên server `kas-staging` (202.143.110.15, thư mục `/srv/kas-web`). Bình thường chỉ GitLab CI deploy lên server này, qua nhánh `staging` (xem doc 158).

| File trong repo | Vị trí trên server | Công dụng |
|---|---|---|
| `deploy.sh` | `/srv/kas-web/bin/deploy.sh` | Lần lượt: giải nén gói mã nguồn, build image, sao lưu database, chạy bản mới, chờ health; tự quay về bản cũ nếu lỗi. Hỗ trợ thêm `--rollback` và `--status`. |
| `ci-gate.sh` | `/srv/kas-web/bin/ci-gate.sh` | Lệnh bắt buộc của khóa CI: chỉ cho chạy `deploy <tên>`, `rollback`, `status`. |
| `compose.yml` | `/srv/kas-web/compose.yml` | Project `kas-web`, gồm backend, website, console. Build từ `releases/$RELEASE`. |
| `backup.sh` | `/srv/kas-web/bin/backup.sh` | Sao lưu database hằng ngày lúc 01:30 (file cron `/etc/cron.d/kas-web-backup`). |

Các file `.env` và `brevo.env` (mode 600) chỉ có trên server, không bao giờ đưa vào repo.

## Cài lại bản mới lên server
Server **không** tự cài các file này khi deploy. Chúng chạy dưới quyền root, nên một thay đổi đã được review vẫn phải có người cài bằng tay. Chạy từ Git Bash ở thư mục gốc của repo:
```bash
K="-i $HOME/.ssh/id_ed25519_vps -p 38791"; H=root@202.143.110.15
scp ${K/-p/-P} deploy/webdemo/{deploy.sh,ci-gate.sh,compose.yml} $H:/tmp/
ssh $K $H 'cd /srv/kas-web && mkdir -p bak && cp -a bin/deploy.sh bak/deploy.sh.$(date +%s) && cp -a compose.yml bak/compose.yml.$(date +%s) \
  && bash -n /tmp/deploy.sh && bash -n /tmp/ci-gate.sh \
  && RELEASE=$(cat current-release) docker compose -f /tmp/compose.yml --project-directory /srv/kas-web config --quiet \
  && install -m 755 /tmp/deploy.sh /tmp/ci-gate.sh bin/ && install -m 644 /tmp/compose.yml compose.yml && bin/deploy.sh --status'
```

## Khóa CI
Trong `~/.ssh/authorized_keys` của root, dòng chứa khóa CI phải có dạng:
```
restrict,command="/srv/kas-web/bin/ci-gate.sh" ssh-ed25519 AAAA... gitlab-ci kas-web-full webdemo
```
Khóa riêng nằm trong biến CI `WEBDEMO_SSH_KEY` (kiểu File, Protected).

## Xử lý sự cố
- Xem trạng thái: `ssh ... root@202.143.110.15 /srv/kas-web/bin/deploy.sh --status`
- Quay về bản trước: bấm job `rollback:staging` trên GitLab, hoặc chạy `deploy.sh --rollback` trên server. Lệnh này **không** khôi phục database. Mỗi lần deploy đều in đường dẫn file dump `data/backups/predeploy/kas-web-<release>.dump`; nếu cần khôi phục database thì dùng file đó.
- Log của mỗi lần deploy nằm ở `/srv/kas-web/incoming/deploy-<release>.log`.
