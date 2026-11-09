# 157 — Production trên Render bằng image build từ GitLab CI (05/11/2026)

Thay cho bước 0–1 của [doc 156](156-production-render-setup.md). Mã nguồn **chỉ nằm trên GitLab công ty**. Render không đọc code; nó kéo image do GitLab CI build.

Render chỉ kéo được image **private** từ Docker Hub, GitHub Container Registry, GitLab.com, Google Artifact Registry và AWS ECR, không từ registry tự host (`registry.kasbookingapp.com`). Vì vậy CI đẩy image vào cả hai nơi: registry GitLab công ty (lưu trữ nội bộ) và **một repository private trên Docker Hub** (để Render kéo).

## Luồng

```
push / merge vào main
  -> test (backend, console, website)
  -> build:images
       registry.kasbookingapp.com/kas-web/kas-web-full/{backend,website,console}:sha-<commit> (+ :latest)
       docker.io/<DOCKERHUB_REPO>:{backend,website,console}-sha-<commit> (+ -latest)
  -> deploy:webdemo (tự động)
  -> deploy:production (bấm tay): deploy hook Render với imgURL=docker.io/<repo>:<name>-sha-<commit>
       backend trước, chờ /actuator/health = UP, rồi website + console
  -> verify:production
```

Rollback production: Render → service → **Events** → chọn bản deploy trước → **Rollback**; hoặc chạy lại `deploy:production` của pipeline cũ (image cũ vẫn còn trên Docker Hub).

## Thiết lập một lần

### 1. Docker Hub
1. Tạo tài khoản (hoặc organization) tại hub.docker.com.
2. **Create repository**: tên `kas-web`, visibility **Private**. Cả 3 image dùng chung repo này, phân biệt bằng tag (`backend-…`, `website-…`, `console-…`).
3. **Account settings → Personal access tokens → Generate new token**, tạo 2 token:
   - `gitlab-ci-push`: quyền **Read & Write** (cho GitLab CI đẩy image).
   - `render-pull`: quyền **Read-only** (cho Render kéo image).

### 2. Biến GitLab CI/CD (Settings → CI/CD → Variables)

| Key | Giá trị | Ghi chú |
|---|---|---|
| `DOCKERHUB_REPO` | `<namespace>/kas-web` | |
| `DOCKERHUB_USERNAME` | username Docker Hub | |
| `DOCKERHUB_TOKEN` | token `gitlab-ci-push` | Visibility **Masked** |
| `PROD_KAS_API_ORIGIN` | địa chỉ private của `kas-backend` (Connect → Internal), ví dụ `http://kas-backend-xxxx:10000` | console build sẵn giá trị này vào image |
| `RENDER_DEPLOY_HOOK_BACKEND` / `_WEBSITE` / `_CONSOLE` | Render → service → Settings → Deploy Hook | Masked + Protected |
| `PROD_BACKEND_HEALTH_URL` | `https://<kas-backend>.onrender.com/actuator/health` | |
| `PROD_WEBSITE_URL` | `https://<kas-website>.onrender.com` (domain thật sau cut-over) | |
| `PROD_CONSOLE_URL` | `https://<kas-console>.onrender.com`, sau DNS là `https://admin.kasluxuryhotel.com` | |

Biến Protected chỉ đọc được trên nhánh protected (`main`). Khi còn thử trên nhánh `snapshot/…`, để `DOCKERHUB_*` không Protected.

### 3. Registry credential trên Render
Render → **Workspace Settings → Registry Credentials** → *Add*:
- Name: **`kas-dockerhub`**
- Registry: **Docker**
- Username: username Docker Hub; Token: token `render-pull`.

### 4. Image đầu tiên
Chạy `build:images` (tự động trên `main`, bấm tay trên nhánh khác) để có image trên Docker Hub trước khi tạo dịch vụ.

### 5. Tạo dịch vụ (bằng tay, theo `render.yaml`)
Blueprint của Render chỉ đọc `render.yaml` từ GitHub/GitLab.com/Bitbucket, nên ở phương án này các dịch vụ được tạo bằng tay; `render.yaml` là bản mô tả chuẩn:
- **New → Postgres**: `kas-postgres`, region Singapore, database `kas_web_dev`, user `kas_web_app`.
- **New → Web Service → Existing Image** (×3), region Singapore, credential `kas-dockerhub`:
  - `kas-backend`: `docker.io/<repo>:backend-sha-<commit>`, plan Standard, health check `/actuator/health`
  - `kas-website`: `docker.io/<repo>:website-sha-<commit>`, plan Starter, health check `/health`, disk `kas-website-data` gắn `/var/data` (1 GB)
  - `kas-console`: `docker.io/<repo>:console-sha-<commit>` (build **sau khi** đã đặt `PROD_KAS_API_ORIGIN`), plan Starter, health check `/admin/login`
- Tắt **Auto-Deploy** ở cả 3 dịch vụ. Biến môi trường: chép đúng từ `render.yaml` (secret theo bảng doc 156 bước 2).

### 6. DNS, tài khoản Admin, cut-over
Giữ nguyên doc 156 bước 3, 4, 5, 6.

## Cần kiểm tra ở lần chạy đầu
- Website chạy user `node` trong container; disk Render gắn ở `/var/data`. Nếu upload báo lỗi quyền ghi, xử lý quyền thư mục trước khi cut-over.
