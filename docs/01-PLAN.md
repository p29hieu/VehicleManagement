# VehicleManagement — Kế hoạch triển khai

> Các quyết định dưới đây dựa trên nghiên cứu tài liệu chính thức của Google, đọc mã nguồn
> 9 dự án mã nguồn mở, và kiểm tra trực tiếp registry npm / Public Suffix List / header HTTP
> của GitHub Pages. Chi tiết nguồn ở [`04-RESEARCH.md`](04-RESEARCH.md).

---

## 1. Quyết định kiến trúc lớn nhất: **v1 không tích hợp Google Calendar**

> ✅ **Đã chốt 02/10/2026:** bỏ hẳn chức năng thêm lịch vào Calendar ở v1.
> Nhắc nhở chạy **trong app + Web Push**. Dưới đây là bằng chứng dẫn tới quyết định này,
> giữ lại để sau này cân nhắc v2.

### Bằng chứng

| Scope | Phân loại | Hệ quả |
|---|---|---|
| `drive.appdata` | **Non-sensitive** ✅ | Không cần thẩm định, không giới hạn 100 người, không màn hình cảnh báo, không CASA |
| `drive.file` | **Non-sensitive** ✅ | Dùng được cả với Sheets API để tạo/ghi Google Sheet |
| `openid email profile` | **Non-sensitive** ✅ | Lấy danh tính qua `openidconnect.googleapis.com/v1/userinfo` |
| `spreadsheets` (rộng) | Sensitive ⚠️ | **Không cần** — `drive.file` đã đủ |
| `calendar`, `calendar.events` | Sensitive ⚠️ | Thẩm định thủ công, giới hạn 100 người |
| `calendar.app.created` | **Google không công bố** ❓ | Trang scope của Calendar chỉ có 2 cột Scope\|Meaning, **không có cột phân loại** như Drive và Sheets |

### Và đây là điều chặn đường thật sự

Thẩm định OAuth của Google yêu cầu xác minh sở hữu domain bằng **Search Console Domain property**,
tức là **bản ghi DNS TXT đặt tại nhà đăng ký tên miền**. Phương thức "URL prefix"
(tải file HTML lên, hoặc chèn thẻ meta) **không được chấp nhận** cho mục đích này.

**Bạn không thể thêm bản ghi DNS vào `github.io` — GitHub sở hữu zone đó.**

→ `<user>.github.io` **về mặt cấu trúc không thể vượt qua thẩm định domain của Google.**
Điều này chặn mọi sensitive scope, và chặn cả việc hiện tên + logo riêng trên màn hình đồng ý.

### Lối thoát

Dùng **chỉ scope non-sensitive** thì **không cần thẩm định gì cả** → `github.io` dùng tốt.
Đánh đổi duy nhất: màn hình đồng ý hiện domain thay vì tên app + logo.

### Vậy Calendar làm thế nào?

| Cách | Được | Mất |
|---|---|---|
| **A. Deep link** `calendar.google.com/calendar/render?action=TEMPLATE` | 1 chạm mở sẵn form tạo event. Không scope, không đăng nhập. Hỗ trợ `recur=RRULE:…` và `ctz=Asia/Ho_Chi_Minh` | **Không đặt được nhắc nhở** — tham số `erem` đã hỏng, Google không áp dụng giá trị |
| **B. Tải file `.ics`** | **Đặt được nhắc nhở** (`VALARM` + `TRIGGER:-PT15M`). Chạy offline. Import được vào cả Google / Apple / Outlook | Người dùng phải mở file sau khi tải |
| **C. OAuth Calendar API** | Hai chiều, sửa/xoá được | Sensitive scope → **bị chặn bởi vấn đề domain ở trên**, phải mua domain riêng |

**Đã chốt: v1 không làm cả A, B lẫn C.** Nhắc nhở ở v1 là **trong app + Web Push**.

Hệ quả cho v1 — đều là tin tốt:
- Scope OAuth chỉ còn `openid email profile` + `drive.appdata` + `drive.file`, **toàn bộ non-sensitive**.
- **Không** cần thẩm định, **không** giới hạn 100 người, **không** màn hình cảnh báo, **không** CASA.
- `<user>.github.io` dùng được thoải mái, không cần mua domain.
- P8 nhẹ đi đáng kể: không `.ics`, không deep link, không lo giới hạn 28 ngày của Calendar.

**Chuẩn bị sẵn cho v2:** bảng `reminders` vẫn giữ cột `gcal_event_id`, và tầng nhắc nhở viết sau
một interface `ReminderSink` để v2 cắm thêm Calendar mà không phải migrate dữ liệu.

> ℹ️ Ghi lại cho v2: nhắc nhở của Google Calendar tối đa **40.320 phút = 28 ngày**.
> Không có "nhắc trước 2 tháng". Nhắc nhở trong app của ta **không** có giới hạn này.

## 2. Ràng buộc token (đã xác minh)

- GIS **token model** (`google.accounts.oauth2.initTokenClient`) là con đường **duy nhất** cho web tĩnh.
  Code model **bắt buộc có backend**; "Web application" client của Google không có loại public client,
  nên PKCE không cứu được. Tuyệt đối không nhét `client_secret` vào bundle.
- Access token ~**1 giờ**. **Không có refresh token.** Google đã bỏ hẳn cơ chế tự gia hạn của `gapi.auth2`.
- Xin lại token dùng `prompt: ''`, nhưng **phải xuất phát từ thao tác người dùng** — nó là popup,
  gọi ngoài user gesture sẽ bị chặn (`popup_failed_to_open`).
- **Tin tốt:** popup là điều hướng *top-level* tới `accounts.google.com`, nên dùng cookie **first-party**
  → **không** bị ảnh hưởng bởi Safari ITP hay chuyện cookie bên thứ ba. GitHub Pages cũng không gửi
  header `COOP` nào, nên popup chắc chắn hoạt động.
- **Bỏ qua One Tap và nút "Sign in with Google"** — chúng chạy trong iframe, phụ thuộc cookie bên thứ ba
  và FedCM (chỉ có trên Chrome/Edge; Firefox và Safari đều **không** hỗ trợ). Lấy danh tính từ
  `/v1/userinfo` bằng chính bearer token là đủ.

→ **Thiết kế phải chấp nhận token chết giữa chừng.** Đồng bộ là thao tác **thủ công / gắn với nút bấm**,
không phải timer chạy nền. Hàng đợi bền, hiện nút **"Kết nối lại"**, không bao giờ mất dữ liệu local.

## 3. Công nghệ

| Hạng mục | Chọn | Lý do |
|---|---|---|
| Build | Vite + React + TypeScript | `base: '/VehicleManagement/'` — **bắt buộc có cả dấu `/` đầu và cuối** |
| Dữ liệu local | Dexie (IndexedDB) | Nguồn sự thật |
| State | Zustand | Chỉ state giao diện |
| **Định tuyến** | **`BrowserRouter basename={import.meta.env.BASE_URL}` + copy `index.html` → `404.html`** | ❗ **Đã đổi so với bản nháp.** GitHub Pages trả HTTP 404 thật cho deep link; `404.html` xử lý lần tải đầu, `navigateFallback` của service worker xử lý mọi lần sau **kể cả khi offline** — điều mà `404.html` không bao giờ làm được. Hash routing khiến `navigateFallback` **vô hiệu hoàn toàn** vì fragment không bao giờ tới service worker |
| PWA | vite-plugin-pwa (Workbox) | `id`/`start_url`/`scope` = `/VehicleManagement/`, icon để đường dẫn tương đối, **không** cache origin của Google |
| Biểu đồ | uPlot + wrapper mỏng | ~16 kB gzip. Recharts ~100 kB ăn hết ngân sách |
| Xuất Excel | **`write-excel-file@^4.1.1`** | **~19,5 kB gzip**, MIT, phát hành 08/06/2026, 0 lỗ hổng. Import động → 0 kB ở lần vẽ đầu |
| Gọi Google API | `fetch` thuần | Không cần `gapi`, không cần API key. Đã kiểm CORS preflight từ origin `*.github.io`: Drive, Sheets, Calendar, userinfo đều trả về đúng |
| Form | React Hook Form + Zod | Schema dùng chung cho form và trình nhập liệu |
| Test | Vitest + Playwright | Vitest cho engine, Playwright cho E2E |

### ❗ Không dùng `xlsx` của SheetJS từ npm
Bản npm mới nhất là **0.18.5, phát hành 24/03/2022**, dính 2 CVE mức **High**
(CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). GitHub Advisory ghi
`first_patched_version: null` — **không tồn tại bản vá nào trên npm**, vì SheetJS đã ngừng publish ở đó.
`xlsx-js-style` là bản fork của 0.18.5 nên **thừa kế cả 2 CVE** trong khi `npm audit` vẫn báo sạch.
`exceljs` thì 263 kB gzip và thực tế đã ngừng bảo trì từ 2023.

## 4. Kiến trúc

```
IndexedDB (Dexie)  ←── nguồn sự thật, luôn ghi vào đây trước
        │
        ├── engine tính toán (hàm thuần, test được độc lập)
        │
        └── hàng đợi đồng bộ ──→ Google Drive appDataFolder (state.json)
                                  ↑ bản sao lưu, KHÔNG phải nguồn sự thật
```

### ❗ Drive v3 **không có** ghi có điều kiện

Drive v3 đã **bỏ etag**. Không có `If-Match`, không có compare-and-swap.
**Mọi lần ghi đều là last-writer-wins.** Google phát hiện thay đổi hộ bạn, nhưng **không ngăn** được.

Mẫu phải dùng:
1. Lưu `{fileId, version}` ở local. `version` là *"số phiên bản tăng đơn điệu, phản ánh **mọi** thay đổi trên server"*.
2. Trước mỗi lần ghi: `files.get?fields=version` (5 quota unit).
3. `version` đổi → tải về, **tự hoà trộn trong client**, rồi mới PATCH.
4. Hoà trộn **theo từng bản ghi** (`updated_at` + `device_id`), không phải theo cả file.
5. Dùng `changes.list` với `startPageToken` lưu sẵn để đánh thức khi nhiều thiết bị.

Có một khoảng tranh chấp nhỏ không thể tránh. **Phải tự viết phần hoà trộn — Drive sẽ không phân xử hộ.**

### Tham khảo mã nguồn
- **`rdamazio/efis-editor`** (Apache-2.0) — đây **đúng là** một PWA tĩnh trên GitHub Pages đồng bộ
  Drive `appDataFolder` không backend, đang chạy thật. File `src/model/storage/gdrive.ts` là một
  máy trạng thái đồng bộ 604 dòng (DISCONNECTED → NEEDS_SYNC → SYNCING → IN_SYNC, retry 401/403 ×3).
  **Port file này.**
- **`javedh-dev/tracktor`** (MIT) — thuật toán tiêu thụ bằng TypeScript, ~90 dòng.
  ⚠️ Phần gộp trung bình của nó **sai** (lấy trung bình cộng các tỉ lệ) — xem `03-DATA-MODEL.md` §3.2.

## 5. Các giai đoạn

### P0 — Dựng khung & deploy *(làm trước tiên)*
- Vite + TS + ESLint/Prettier; `base: '/VehicleManagement/'`.
- `public/.nojekyll` (Jekyll âm thầm bỏ file bắt đầu bằng `_`; Rollup có thể sinh `_commonjsHelpers-*.js`
  → precache manifest 404 → **cài service worker hỏng toàn bộ**).
- Post-build: `cp dist/index.html dist/404.html`.
- GitHub Actions deploy khi push `main`.
- ✅ Xong khi: deep link `/VehicleManagement/bao-cao` mở được **trong cửa sổ ẩn danh mới**
  (sau lần đầu, service worker che mất lỗi — phải test ẩn danh).

### P1 — Lõi dữ liệu local ✅ *(xong 04/10/2026)*
- Schema Dexie theo `03-DATA-MODEL.md`. **Đặt tiền tố riêng cho mọi key** — mọi project GitHub Pages
  của cùng một tài khoản dùng **chung một origin**, chung IndexedDB và localStorage.
- CRUD phương tiện + 3 loại bản ghi; màn hình lịch sử gom nhóm theo tháng.
- ✅ **Đã xong.** Nhập `data/vehicle-management-import.json` trong trình duyệt: 2 xe,
  18 bản ghi nhiên liệu, 3 bản ghi bảo dưỡng, 0 lỗi 0 cảnh báo. Timeline hiện đúng 4 nhóm tháng,
  quãng đường giữa các lần đổ khớp từng con số (299/259/315/292/210/215/331/299 km).
  CRUD chạy đủ: tạo → sửa → xoá, kèm 2 luật chặn (ODO lùi, thiếu tiền). Dữ liệu bền qua reload.
  Tương phản WCAG AA đạt trên cả 6 thành phần mới, ở cả light và dark.

### P2 — Design system & nhập liệu nhanh
- Token màu/chữ theo `02-UIUX.md`; Be Vietnam Pro + IBM Plex Mono.
- Bottom sheet nhiên liệu, bàn phím số có phím `000`, chip số tiền, gợi ý ODO.
- `String(v).normalize('NFC')` ở mọi biên nhập liệu.
- ✅ Xong khi: **bấm đồng hồ, thêm một lần đổ xăng dưới 10 giây trên máy thật.**

### P3 — Engine tính toán ⭐ *rủi ro cao nhất*
- Thuật toán đổ-đầy-tới-đổ-đầy, đúng off-by-one (`03-DATA-MODEL.md` §3.1).
- Trung bình **theo trọng số quãng đường**.
- Đủ trường hợp biên: `missed_fill`, ODO rỗng/`0`, `dist <= 0`, bản ghi đầu là đổ không đầy.
- Dải hợp lý **theo loại xe**.
- ✅ Xong khi test khớp **số vàng** từ workbook đã verify:

  | Kiểm thử | Kỳ vọng |
  |---|---|
  | VH002 quãng đường theo dõi | 3.626 km |
  | VH002 chi phí nhiên liệu/km | 1.792,61 đ/km |
  | VH002 chi phí/ngày | 86.138,61 đ |
  | VH002 L/100km @ 21.000 đ/lít | 8,54 |
  | VH001 L/100km @ 21.000 đ/lít | 2,30 *(dưới dải ô tô — **không được** bị loại)* |
  | VH001 khoảng cách TB giữa 2 lần đổ | 170,33 km |

- Test hồi quy lấy từ lỗi thật của OSS:
  - `full → partial → full` phải ra **một** kết quả gộp cả 3 *(lỗi của `linuxserver/Clarkson`)*.
  - Lần đổ **không đầy đứng đầu** danh sách phải cho kết quả **không tính được**, không được
    coi như đổ đầy *(lỗi của `hargata/lubelog`)*.
  - Lần đổ không đầy **sau** lần đổ đầy cuối cùng **không** được lọt vào trung bình tổng *(cũng lỗi LubeLog)*.

### P4 — Báo cáo
3 ô số lớn + cột theo tháng + đường tiêu thụ. Nhãn "ước tính" / "chưa đủ dữ liệu".
✅ Xong khi: số khớp P3 và khớp workbook.

### P5 — PWA
- Manifest: **`id` đặt tường minh ngay từ đầu** (bỏ trống thì mặc định bằng `start_url`;
  sau này đổi `start_url` là trình duyệt coi như app khác, mọi bản đã cài thành mồ côi).
- `vite-plugin-pwa`, `registerType: 'autoUpdate'`, `navigateFallback: 'index.html'`.
- **Không** đặt `runtimeCaching` cho `accounts.google.com` hay `*.googleapis.com`.
- Giữ lại một thế hệ asset cũ (GitHub Pages đặt `max-age=600` cho **mọi** file kể cả file có hash).
- ✅ Xong khi: **chế độ máy bay — mở app, thêm bản ghi, xem lịch sử, deep link đều chạy.**

### P6 — Nhập / Xuất
- Nhập file `vehicle-management/import` v1 (`03-DATA-MODEL.md` §7.2) — đây là đường đi chính.
  Bộ dữ liệu lịch sử đã sẵn ở `data/vehicle-management-import.json`.
- Thêm **giao diện tự ánh xạ cột** cho CSV/XLSX từ nguồn khác (§7.3) — thứ yếu, không chặn P6.
- Xuất `.xlsx` qua `write-excel-file`, import động.
- Định dạng số VN: ghi mã `#,##0" ₫"` và `dd/mm/yyyy` **tường minh** — mã định dạng dựng sẵn của Excel
  bị bản địa hoá theo máy người xem, mã tự định nghĩa thì không.
- ✅ Xong khi: (a) nhập `data/vehicle-management-import.json` ra đúng 2 xe / 18 bản ghi nhiên liệu /
  3 bản ghi bảo trì và các chỉ số khớp số vàng ở P3; (b) xuất ra rồi nhập lại, dữ liệu không đổi.

### P7 — Đồng bộ Google Drive
- GIS token client. Scope: `openid email profile` + `drive.appdata` + `drive.file`.
- Cloud Console: **Authorized JavaScript origin = `https://<user>.github.io`**, không có redirect URI.
- Đồng bộ gắn với nút bấm; hoà trộn theo `version` như §4.
- ✅ Xong khi: 2 thiết bị sửa offline khác nhau → online lại → không mất bản ghi nào.
- ⚠️ **Test sớm trên iPhone thật đã cài PWA.** Không có nguồn chính thức nào nói popup
  `initTokenClient` hoạt động ra sao bên trong PWA standalone trên iOS; có báo cáo cộng đồng
  rằng luồng này thoát ra tab Safari. Chuẩn bị sẵn đường lui (`navigator.standalone`).

### P8 — Nhắc nhở
- Mô hình `maintenance_rules` / `reminders` tách đôi.
- Ngữ nghĩa "km HOẶC thời gian, cái nào tới trước".
- Thông báo trong app + **Web Push**.
- Viết sau interface `ReminderSink` (v1 chỉ có `InAppSink`) để v2 cắm Calendar vào.
- ❌ **Không** làm `.ics`, **không** làm deep link Calendar ở v1.
- ✅ Xong khi: tạo được nhắc "5.000 km hoặc 6 tháng", đúng trục nào tới trước thì kích hoạt.

### P9 — Dự báo
Công thức `03-DATA-MODEL.md` §5 + ngưỡng dữ liệu tối thiểu. Đối chiếu sheet `DuBaoDrivvo`.
*(Không có dự án OSS nào có phần dự báo đáng tham khảo — LubeLog chỉ cộng chi phí theo tháng.
Phần này hoàn toàn là thiết kế của ta.)*

### P10 — Hoàn thiện
Kiểm tra khả dụng tự động, Lighthouse ≥ 90 / ≥ 95, đọc thử ngoài nắng thật.

## 6. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| `github.io` **không thể** vượt thẩm định domain của Google | ~~Chặn đường~~ **Đã hoá giải** | v1 chỉ dùng non-sensitive scope → không cần thẩm định. Chỉ thành vấn đề nếu v2 thêm Calendar |
| Đồng bộ Drive mất dữ liệu âm thầm (last-writer-wins) | **Cao** | Hoà trộn theo `version` + theo từng bản ghi. Viết test cho tình huống này |
| Engine tính toán sai âm thầm | **Cao** | Số vàng ở P3 + test hồi quy từ lỗi thật của OSS |
| Popup OAuth trong PWA standalone trên iOS | Trung bình | Test sớm trên máy thật, có đường lui |
| Origin dùng chung giữa các project GitHub Pages | Trung bình | Đặt tiền tố cho mọi key lưu trữ và tên cache |
| Service worker "thây ma" nếu đổi tên repo | Thấp | Chốt tên repo ngay bây giờ. Nếu phải đổi, deploy `selfDestroying: true` **trước** |
| appDataFolder bị xoá cứng (không có thùng rác) | Thấp | Người dùng xoá được từ Cài đặt Drive. Thiết kế chịu được mất dữ liệu đám mây |

## 7. Đã kiểm chứng / chưa kiểm chứng

### Đã kiểm chứng
- **86 công thức trong workbook đã được evaluate thật**, đối chiếu giá trị tính độc lập bằng Python:
  **50/50 cặp khớp, 0 lỗi.** Phát hiện và sửa **2 lỗi thật** — xem §8.
- Phân loại scope Google: đọc trực tiếp bảng HTML của 5 trang tài liệu chính thức, có đối chiếu
  bản lưu Wayback từ 2019 để chắc chắn phân loại chưa từng đổi.
- Yêu cầu Domain property (DNS TXT) cho thẩm định OAuth: đọc trực tiếp từ trang hỗ trợ của Google.
- `github.io` nằm trong Public Suffix List: tải và kiểm tra file `public_suffix_list.dat` (dòng 13775).
- CORS preflight từ origin `*.github.io` tới Drive / Sheets / Calendar / userinfo: thử thật, đều pass.
- GitHub Pages **không gửi header tuỳ chỉnh nào** (không COOP/COEP/CSP/HSTS), `max-age=600` cho mọi file,
  trả HTTP 404 thật cho deep link: kiểm bằng `curl`.
- `xlsx` npm: tra registry npm + GitHub Advisory API — 0.18.5 (2022), 2 CVE High không có bản vá.
- `write-excel-file` 4.1.1 (08/06/2026), ~19,5 kB gzip: tra registry.
- Thuật toán tiêu thụ: đọc mã nguồn thật 7 dự án (5 đúng, 2 sai).
- Tên cột tiếng Việt của Drivvo: tải `web.drivvo.com/locales/vi.json` (839 khoá).

### Chưa kiểm chứng — xử lý trong quá trình làm
- Phân loại của `calendar.app.created` → chỉ Cloud Console trả lời được (thêm scope vào trình chọn
  và xem nó rơi vào nhóm nào). **Mất 2 phút**, làm khi nào cần tới phương án C.
- Popup `initTokenClient` bên trong PWA standalone trên iOS → test máy thật ở P7.
- ~~File export Drivvo~~ — **đã khép lại 03/10/2026: Drivvo không có chức năng xuất file.**
  Ảnh chụp màn hình là nguồn duy nhất; dữ liệu đã chép tay xong và validate đạt (193 check).
  Format import chính thức là format gốc của app, không phải của Drivvo.
- Giới hạn dung lượng của appDataFolder → Drive v3 không công bố.
- Hiển thị thật của `.xlsx` trong Excel trên máy locale vi-VN → kiểm ở P6.

## 8. Hai lỗi đã tìm ra và sửa trong workbook

1. **Hai dòng ví dụ ở sheet `ChiPhiKhac` mang mã xe thật** → `SUMIFS` cộng nhầm 30.000 đ và 60.000 đ
   chi phí ảo vào "Tổng chi phí khác", kéo sai luôn tổng chi phí, đ/ngày và đ/km.
   Đã đổi mã xe thành `(VÍ DỤ)` để không khớp xe nào.
2. **Dự báo ngày ra số lẻ thập phân** (46291,23 thay vì 46291) → đã bọc `ROUND`.

Cả hai chỉ lộ ra nhờ chạy evaluate thật rồi so với giá trị tính độc lập. Đây chính là lý do
bước kiểm chứng này đáng làm **trước** khi viết code — engine ở P3 sẽ dùng chính những con số này làm chuẩn.

## 9. Quyết định đã chốt (02/10/2026)

| # | Quyết định | Hệ quả |
|---|---|---|
| 1 | **v1 bỏ tích hợp Google Calendar** | Nhắc nhở trong app + Web Push. Scope toàn non-sensitive → không thẩm định. P8 nhẹ đi |
| 2 | **Host tại `<user>.github.io/VehicleManagement/`** | Miễn phí. Màn hình đồng ý Google hiện domain thay vì tên app + logo — chấp nhận được |
| 3 | **Repo mới riêng** | Tách khỏi `click-mono-repo`. Chốt tên repo **trước** P0 — đổi tên sau sẽ để lại service worker "thây ma" |

### Còn lại cần bạn làm
- [x] ~~Chốt tên repo~~ — `p29hieu/VehicleManagement`, đã deploy.
- [x] ~~Xuất file từ Drivvo~~ — không làm được, đã chuyển sang chép tay từ ảnh. Xong.
- [ ] Điền `settings.fuel_prices.ron95` trong `data/vehicle-management-import.json`
      (hoặc ô vàng sheet `ThamSo`) để đổi từ **ước tính** sang số L/100km thật.
