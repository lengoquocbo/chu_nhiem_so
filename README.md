# Hệ thống Quản lý Lớp học, Điểm danh và Thi đua

Kiến trúc: **Next.js (React)** + **Python/FastAPI** (Vercel Serverless Function)
+ **Supabase** (Postgres + Auth + RLS).

```
Frontend (Next.js) ──── đọc trực tiếp ────► Supabase (RLS bảo vệ theo scope)
      │
      └──── ghi sự việc / duyệt điểm / chốt tuần ────► /api/* (Python/FastAPI)
                                                              │
                                                              └──► Supabase (service_role,
                                                                   tự kiểm tra quyền trong code)
```

## 1. Cấu trúc thư mục

```
app/                  Next.js App Router (frontend)
lib/                  Supabase client (frontend)
api/
  index.py            FastAPI app - entrypoint DUY NHẤT cho Vercel
  requirements.txt
  _lib/
    supabase_client.py  Client dùng service_role key (backend)
    auth.py             Verify JWT + kiểm tra role/scope
    score_engine.py      Lõi: ghi sự việc -> đối chiếu tiêu chí -> tạo transaction
    week_engine.py        Chốt tuần -> tính weekly_score_summary -> khóa
supabase/
  migrations/          Chạy TUẦN TỰ theo số thứ tự 001 -> 033
vercel.json            Route /api/* vào api/index.py
.env.example           Danh sách biến môi trường cần set
```

## 2. Setup Supabase

Dự án này dùng **hệ key mới của Supabase** (`sb_publishable_...` / `sb_secret_...`
+ xác thực JWT qua JWKS) — không phải `anon`/`service_role` key kiểu cũ.

1. Vào Supabase Dashboard -> SQL Editor.
2. Chạy lần lượt từng file trong `supabase/migrations/` theo đúng thứ tự
   (001 -> 033). Mỗi file phụ thuộc bảng được tạo ở file trước; riêng 030
   phải commit xong trước khi chạy 031 vì thêm giá trị enum mới.
   Nếu nâng cấp database đang dùng từ 027, xem [hướng dẫn nhiều trường](docs/multi-school.md)
   trước khi triển khai frontend/API mới.
3. Vào **Project Settings -> API**, lấy:
   - `Project URL` -> dùng cho cả `SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable key` (sb_publishable_...) -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `Secret key` (sb_secret_...) -> `SUPABASE_SECRET_KEY` (**KHÔNG** đưa lên frontend,
     có toàn quyền admin trên database)
   - JWKS URL có dạng cố định: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
     -> `SUPABASE_JWKS_URL`

## 3. Đã test thật trước khi giao (không chỉ đọc code)

Các kết quả test cũ ở mục 7 chỉ áp dụng cho phạm vi migration đã chạy khi đó.
Migration nhiều trường 028–032 đã được áp dụng vào Supabase mà cấu hình local trỏ tới và
kiểm tra backfill/quyền admin cấp hệ thống. Trước khi dùng ở môi trường khác,
cần sao lưu và kiểm thử phân quyền giữa ít nhất hai trường.

## 4. Chạy local

```bash
npm install
cp .env.example .env.local   # điền giá trị thật
npm run setup:api            # chạy một lần để tạo .venv và cài Python API
npm run dev
```

`npm run dev` chạy đồng thời Next.js ở cổng `3000` và FastAPI ở cổng `8000`.
Trong môi trường development, Next.js tự chuyển `/api/*` sang FastAPI nên hành
vi local giống cấu hình route trên Vercel. Có thể đổi cổng bằng biến `PORT` và
`PYTHON_API_PORT`. FastAPI tự nạp `.env.local` rồi `.env` khi chạy local; biến
môi trường do hệ thống hoặc Vercel cung cấp luôn được ưu tiên và không bị ghi đè.

## 5. Deploy lên Vercel

1. Push code lên GitHub, import repo vào Vercel.
2. Vào Project Settings -> Environment Variables, thêm toàn bộ biến trong
   `.env.example` (giá trị thật).
3. Vercel tự nhận diện Next.js ở root + Python function trong `api/index.py`
   nhờ `vercel.json`.

## 6. Admin cấp hệ thống và hiệu trưởng đầu tiên

Sau khi chạy migration 028–033, tài khoản quản trị hiện có được gán role
`system_admin` bằng migration 031, không còn role `principal`. Đăng nhập sẽ
chuyển đến `/system`: trước tiên **thêm trường học**, sau đó chọn trường và
**cấp tài khoản hiệu trưởng**. Mỗi hiệu trưởng chỉ gắn với một trường.
Hiệu trưởng đăng nhập vào `/admin` để quản lý năm học, lớp và giáo viên của
trường mình; không thể tự cấp tài khoản hiệu trưởng. Admin cấp hệ thống có thể
chọn một trường tại `/system` rồi dùng đầy đủ quyền hiệu trưởng trong đúng trường
đó. Không lưu mật khẩu trong migration, source hay tài liệu.

## 7. Đã TEST THẬT (không chỉ đọc code)

Toàn bộ mục dưới đây đã được verify bằng cách chạy Postgres 16 thật + FastAPI
thật + Next.js build thật (không phải suy đoán từ code):

- [x] **12 file migration chạy thành công** trên Postgres thật, không lỗi
      (phát hiện + sửa 1 lỗi thật: cast `date::text` trong generated column
      không phải hàm IMMUTABLE, khiến toàn bộ migration sau đó lỗi cascade)
- [x] **7/7 test nghiệp vụ end-to-end PASS**: tạo lớp → GVCN tự có scope,
      GVBM join lớp → tự có scope, chỉ định tổ trưởng → scope tự sync,
      **chỉ định chức vụ TRƯỚC khi có tài khoản đăng nhập rồi tạo tài khoản
      SAU → trigger backfill tự chạy đúng** (bug thật đã phát hiện + sửa),
      ghi trùng sự kiện bị chặn đúng bởi unique index, tính điểm tuần đúng
      công thức (100 + cộng - trừ), xếp loại tự động đúng theo `rank_configs`
- [x] **7/7 test RLS (Row Level Security) PASS** - mô phỏng đăng nhập từng
      vai trò và xác nhận cách ly dữ liệu: GVCN chỉ thấy đúng 1 lớp mình
      quản lý, không thấy học sinh lớp khác; học sinh/phụ huynh chỉ thấy
      đúng dữ liệu của mình; GVBM bị RLS chặn khi cố sửa tiêu chí; người
      lạ (không có scope) không thấy gì cả
- [x] **FastAPI backend chạy thật** (uvicorn), 23 route đăng ký đúng,
      `/api/health` trả về 200 OK, không lỗi import/circular import
- [x] **Next.js build thật thành công** (`next build`), cả 6 trang
      (`/`, `/admin`, `/homeroom`, `/teacher`, `/student`, `/parent`)
      compile sạch, không lỗi TypeScript/JSX

### Tài khoản học sinh

- GVCN có thể tạo một tài khoản hoặc tạo hàng loạt từ danh sách học sinh đã
  import vào đúng lớp mình phụ trách. Kết quả tạo tài khoản có thể tải lại
  dưới dạng Excel.
- Tài khoản học sinh mới bị khóa khỏi dữ liệu nghiệp vụ cho tới khi học sinh
  đổi mật khẩu lần đầu. Cơ chế này cần migration
  `015_student_first_login_password.sql`.

2 file test SQL nằm ở `supabase/test_setup/` - bạn có thể tự chạy lại trên
Supabase thật (SQL Editor) để tái xác nhận, hoặc dùng làm tài liệu tham khảo
luồng dữ liệu.

⚠️ **Giới hạn của việc test này**: môi trường sandbox không có quyền truy cập
mạng tới `*.supabase.co`, nên **chưa test được** qua Supabase Auth thật (JWKS
xác thực JWT thật, Supabase Admin API tạo user thật, RLS chạy trên Supabase
thay vì Postgres tự cài). Logic đã đúng theo tài liệu Supabase, nhưng bạn
cần tự chạy thử 1 lượt thật trên project của mình để chắc chắn 100%.

## 8. Trạng thái theo từng vai trò (trả lời "đủ role chưa, full chức năng chưa")

| Vai trò | Đăng nhập | Chức năng đã có | Còn thiếu |
|---|---|---|---|
| **Admin cấp hệ thống** | `/system`, role `system_admin` | Thêm trường, cấp hiệu trưởng cho một trường | Cần kiểm thử staging với database thật |
| **BGH/Hiệu trưởng** | `/admin`, role `principal` | Tạo tài khoản giáo viên/học sinh/phụ huynh trong trường, tạo năm học/khối/lớp, phân công GVCN | Quản lý giáo viên nâng cao (khóa tài khoản, đổi thông tin), báo cáo toàn trường |
| **GVCN** | ✅ (`/homeroom`, role `homeroom_teacher`) | Import Excel học sinh, tạo tài khoản đăng nhập học sinh/phụ huynh, cấu hình tiêu chí + ánh xạ sự kiện, tạo tổ + thêm thành viên, chỉ định lớp trưởng/lớp phó/tổ trưởng, tạo/chốt/mở khóa tuần thi đua, duyệt/điều chỉnh điểm | Phân quyền chi tiết cho từng cán bộ lớp (`officer_permissions` đã có schema, chưa có UI) |
| **GVBM** | ✅ (`/teacher`, role `subject_teacher`) | Tham gia lớp bằng mã lớp, điểm danh hàng loạt theo tiết (tự sinh sự kiện + điểm), ghi nhận cộng/trừ + note | - |
| **Lớp trưởng/Lớp phó/Tổ trưởng** | ⚠️ Có scope quyền (RLS đã test pass) nhưng **chưa có trang giao diện riêng** - hiện dùng chung UI với GVCN nếu được cấp quyền tương tự | - | Trang riêng cho các vai trò này (hiện họ có quyền trong DB nhưng chưa có UI để thao tác) |
| **Học sinh** | ✅ (`/student`, role `student`, tài khoản do GVCN tạo) | Xem điểm hiện tại, lịch sử tuần, sự việc gần đây | Xem nhiệm vụ/hoạt động (chưa có module nhiệm vụ/hoạt động) |
| **Phụ huynh** | ✅ (`/parent`, role `parent`, tài khoản do GVCN tạo) | Chọn con (nếu nhiều con), xem điểm/lịch sử con | Nhận thông báo Zalo/Telegram cần tự liên kết tài khoản (chưa có webhook) |

**Giao diện đã thêm phân quyền theo vai trò**: đăng nhập vào `/` giờ chỉ hiện
đúng menu tương ứng role của tài khoản; vào nhầm trang (`/admin` khi không
phải Hiệu trưởng...) sẽ hiện "không có quyền truy cập" thay vì hiện form gây
hiểu lầm là dùng được.

## 9. Đã code (checklist đầy đủ)

- [x] Schema: năm học, khối, lớp, học sinh, tổ, ban cán sự, GVBM join lớp
- [x] Bảng scope phẳng + trigger tự đồng bộ khi phân công/chỉ định
- [x] Trigger backfill scope khi tạo tài khoản SAU khi đã chỉ định chức vụ (đã test)
- [x] RLS đầy đủ theo scope cho toàn bộ bảng (đã test cách ly dữ liệu thật)
- [x] Tiêu chí thi đua + ánh xạ event_type → criteria (hệ thống tự đối chiếu, không hard-code)
- [x] Score engine: ghi sự việc, đối chiếu tiêu chí, chống trùng, snapshot điểm, APPROVE/ADJUST
- [x] Chốt tuần: tính weekly_score_summary, khóa/mở khóa có audit bắt buộc lý do
- [x] Điểm danh hàng loạt theo tiết → tự sinh sự kiện + score transaction
- [x] Import Excel học sinh: validate + preview + confirm, chống trùng, check định dạng
- [x] Báo cáo tuần (theo lớp/tổ), tổng hợp tháng/kỳ/năm từ summary đã LOCKED
- [x] Gửi thông báo phụ huynh (Zalo OA / Telegram Bot) khi transaction được duyệt -
      cần set `ZALO_OA_ACCESS_TOKEN` / `TELEGRAM_BOT_TOKEN` và phụ huynh liên kết
      `profiles.zalo_user_id` / `profiles.telegram_chat_id` trước
- [x] Audit log tự động cho mọi hành động ghi/duyệt/điều chỉnh/khóa/mở khóa/import
- [x] Admin tạo tài khoản GVCN/GVBM qua Supabase Admin API
- [x] GVCN tạo tài khoản đăng nhập cho học sinh/phụ huynh (học sinh không tự đăng ký)
- [x] GVCN chỉ định lớp trưởng/lớp phó/tổ trưởng + thêm học sinh vào tổ
- [x] Giao diện Next.js theo vai trò: `/admin`, `/homeroom`, `/teacher`, `/student`, `/parent`
- [x] Chặn UI theo vai trò (vào nhầm trang báo "không có quyền" thay vì hiện form)

## 10. Còn thiếu / cần hoàn thiện thêm

- [ ] Quy trình duyệt điểm đầy đủ qua lớp trưởng/tổ trưởng (CLASS_LEADER_CHECK/CONFIRMED) -
      hiện GVCN có thể approve/adjust thẳng, chưa có UI cho bước kiểm tra trung gian
- [ ] Trang giao diện riêng cho lớp trưởng/lớp phó/tổ trưởng (họ đã có quyền/scope
      đúng trong DB - đã test RLS pass - nhưng chưa có màn hình thao tác riêng)
- [ ] `week_unlock_requests` UI (hiện GVCN tự mở khóa lớp mình trực tiếp qua API,
      chưa bắt buộc luồng "yêu cầu → Hiệu trưởng duyệt")
- [ ] Webhook nhận `zalo_user_id`/`telegram_chat_id` khi phụ huynh follow OA / bấm /start bot
- [ ] `officer_permissions` UI (phân quyền chi tiết linh hoạt cho từng cán bộ lớp - đã có schema)
- [ ] Trang xem báo cáo tuần/tháng dạng bảng cho GVCN/BGH (API `/api/reports/*` đã có, chưa có UI)
- [ ] Module nhiệm vụ/hoạt động (task/activity) - chưa có schema lẫn UI
- [ ] Dashboard tổng quan cho từng vai trò (số liệu tổng hợp, biểu đồ)
- [ ] Vercel Cron gọi định kỳ `/api/notifications/process-pending` để retry thông báo lỗi
- [ ] Test qua Supabase thật (Auth JWKS, Admin API) - sandbox không có mạng ra supabase.co
- [ ] Giới hạn CORS về đúng domain thật trước khi lên production (hiện đang mở `*`)
