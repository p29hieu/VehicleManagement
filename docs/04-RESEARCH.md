# VehicleManagement — Phụ lục nghiên cứu

Tài liệu này ghi lại các phát hiện kỹ thuật đứng sau những quyết định trong
[`01-PLAN.md`](01-PLAN.md), kèm nguồn. Mục đích: 6 tháng nữa đọc lại vẫn biết **vì sao** chọn như vậy,
và biết chỗ nào là **sự thật đã kiểm chứng**, chỗ nào là **suy luận**.

---

## 1. Phân loại scope OAuth của Google

| Scope | Phân loại | Nguồn |
|---|---|---|
| `drive.appdata` / `drive.appfolder` | **Non-sensitive** | [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — nằm dưới tiêu đề `### Non-sensitive scopes`; [appData guide](https://developers.google.com/workspace/drive/api/guides/appdata) nói nguyên văn *"the `drive.appdata` **non-sensitive** scope"* |
| `drive.file` | **Non-sensitive** | Cùng trang, nhóm *"recommended for most use cases"* |
| `spreadsheets` | Sensitive | [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes) |
| `drive`, `drive.readonly`, `drive.metadata*`, `drive.activity*`, `drive.scripts`, `drive.meet.readonly` | **Restricted** | [Restricted Scopes](https://support.google.com/cloud/answer/13464325) — danh sách đầy đủ, chỉ gồm Gmail, Drive, Fit, Chat, Data Portability, Photos Ambient, Health |
| Mọi scope Calendar | **Google không công bố** | [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth) chỉ có 2 cột Scope\|Meaning, **không có cột phân loại** — khác hẳn Drive và Sheets |

**Hai kết luận quan trọng:**

1. Niềm tin phổ biến rằng `drive.appdata` là restricted là **sai**. Đã đối chiếu bản lưu Wayback
   2019 / 2021 / 2023: scope này được dán nhãn "Recommended" ngay cả ở đỉnh điểm Project Strobe,
   và phân loại **chưa từng thay đổi**. Năm 2019 Google còn nêu nó làm **ví dụ về thứ KHÔNG cần
   thẩm định bảo mật**: *"Google fully manages storing user data in Google Drive via drive.appdata,
   so this type of data storage does not require a security assessment."* (câu này sau đó bị gỡ khỏi
   tài liệu khi tổ chức lại, không phải do đổi phân loại).
2. Không scope Calendar nào nằm trong danh sách restricted → Calendar **nhiều nhất là sensitive**,
   không bao giờ phải làm CASA. Nhưng sensitive đã đủ để chặn ta (xem §2).

> `drive.file` được `spreadsheets.create` và `spreadsheets.values.update` chấp nhận
> → **tạo và ghi Google Sheet được mà không cần scope `spreadsheets`** (vốn là sensitive).
> Hướng dẫn ["Create events"](https://developers.google.com/workspace/calendar/api/guides/create-events)
> vẫn bảo dùng scope `calendar` rộng — hướng dẫn đó đã cũ so với trang tham chiếu `events.insert`.

## 2. Vì sao `github.io` không vượt được thẩm định

Thẩm định OAuth yêu cầu xác minh sở hữu domain. Theo
[support.google.com/cloud/answer/13804266](https://support.google.com/cloud/answer/13804266), nguyên văn:

> **Verification Steps (Domain Property Method)**
> You must verify the **Domain Property (DNS-level)**, rather than a "URL prefix" or "Site," property.
> … Copy the provided **TXT record** and add it to your domain's DNS configuration **via your domain registrar**.

Và [Search Console](https://support.google.com/webmasters/answer/9008080) xác nhận Domain property
**chỉ** hỗ trợ xác minh bằng bản ghi DNS. Tải file HTML hay chèn thẻ meta chỉ dùng được cho
URL-prefix property.

**Bạn không kiểm soát DNS của `github.io`.** → Chặn đường về mặt cấu trúc, không phải chuyện
reviewer dễ hay khó tính.

Có một bằng chứng bổ trợ (**nguồn cộng đồng, không chính thức**): một thread trên discuss.google.dev
trích lời reviewer Trust & Safety của Google — *"Hosting your homepage and privacy policy on a
third-party platform where you cannot verify ownership of your subdomain, such as github.io,
should be avoided."* `web.app` của Firebase cũng vướng y hệt.

**Nhưng:** app chỉ dùng non-sensitive scope thì **không bắt buộc thẩm định**
([verification FAQ](https://support.google.com/cloud/answer/9110914)) — chỉ cần brand verification
nếu muốn hiện tên + logo riêng. Không thẩm định → không giới hạn 100 người, không màn hình
"app chưa xác minh". Đổi lại màn hình đồng ý hiện domain thay vì tên app.

## 3. Mô hình token

| | Implicit (token model) | Authorization code model |
|---|---|---|
| Có refresh token | **Không** | Có |
| Cần backend | **Không** | **Có** — *"for endpoint hosting and storage"* |
| Đồng ý của người dùng | Mỗi lần xin token | Chỉ lần đầu |

Nguồn: [choose-authorization-model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model).

- `gapi.auth2` **đã deprecated từ 31/03/2023**; client ID tạo sau 29/07/2022 không dùng được.
  Chưa công bố ngày tắt hẳn.
- Nguyên văn trang migration: *"When an access token expires, the gapi.auth2 module automatically
  obtains a new, valid access token… this automatic token refresh process is **not supported** by
  the Google Identity Services library."*
- `TokenClientConfig.prompt`: `''` = chỉ hỏi lần đầu · `'none'` = không hiện UI nào ·
  `'consent'` · `'select_account'` (mặc định).
- `prompt: 'none'` **thất bại cứng** nếu người dùng chưa đăng nhập hoặc chưa cấp **đủ** mọi scope.
- Đây là **popup**, không phải iframe ẩn: bundle `gsi/client` có chuỗi `popup_failed_to_open` và
  `popup_closed`. → cần user gesture.
- **Nhưng popup là điều hướng top-level** tới `accounts.google.com` → cookie first-party →
  **không** bị Safari ITP hay chuyện cookie bên thứ ba làm hỏng. Đây là điểm khác biệt then chốt
  so với kiểu gia hạn bằng iframe ẩn của `gapi.auth2`.

### Vì sao bỏ One Tap / nút "Sign in with Google"
Chúng chạy trong **iframe** từ `accounts.google.com` → phụ thuộc cookie bên thứ ba, thay thế bằng FedCM.
Mà FedCM (`IdentityCredential`) theo MDN browser-compat-data: **Chrome 108+, Edge theo Chrome,
Firefox `false`, Safari `false`**. Google cũng ghi *"Due to ITP redirect mode is required for iOS"* —
mà redirect mode POST token JWT về một endpoint server, thứ mà host tĩnh không có.

→ Lấy danh tính bằng `GET https://openidconnect.googleapis.com/v1/userinfo` với chính bearer token.
Một lần đồng ý, một popup, một đường code.

### CORS — đã thử thật
Preflight `OPTIONS` với `Origin: https://example.github.io` trả về 200 kèm `access-control-allow-origin`
cho: `openidconnect.googleapis.com/v1/userinfo`, `www.googleapis.com/drive/v3/files`,
`www.googleapis.com/upload/drive/v3/files`, `sheets.googleapis.com/v4/spreadsheets`,
`www.googleapis.com/calendar/v3/.../events`, `oauth2.googleapis.com/revoke`.

→ Dùng `fetch` thuần. **Không cần `gapi`, không cần API key.**
(Riêng kết quả `revoke` **mâu thuẫn** với tài liệu implicit-flow vốn vẫn nói revoke không hỗ trợ CORS.
Preflight pass nhưng chưa thử POST thật → chuẩn bị đường lui bằng form post.)

## 4. Drive v3 không có ghi có điều kiện

Grep trang [Files resource reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files):
`etag` **0 lần**, `If-Match` **0 lần**, `If-None-Match` **0 lần**.
Bảng [v2→v3 migration](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference)
ánh xạ `etag` → `n/a` ở mọi resource.

**Không có compare-and-swap. Mọi lần ghi là last-writer-wins.**

Công cụ thay thế:
- **`version`** — *"a monotonically increasing version number… reflects **every** change made to the
  file on the server."* ← dùng cái này làm token phát hiện xung đột.
- `md5Checksum` / `sha256Checksum` — khử trùng lặp rẻ tiền.
- `modifiedTime` — yếu, vì **ghi được**, đừng dùng làm token chính.
- `changes.list` hỗ trợ `spaces=appDataFolder`. ⚠️ `changes.getStartPageToken` **không có** tham số
  `spaces` (token là của cả tài khoản) — lọc lúc list. Tốn 100 quota unit/lần, đừng poll dày.

Quota Drive chuyển sang mô hình quota-unit từ 01/05/2026: 1.000.000 unit/phút/project,
325.000/phút/user. `files.get` = 5 · `files.list` = 100 · download = 200 · `files.update` = 50.

### appDataFolder
`parents: ['appDataFolder']` là **alias chữ**, không phải folder ID. `uploadType=multipart` cho file
≤ 5 MB. Thư mục này *"hidden from the user and from other Google Drive apps"*, nhưng người dùng
**xoá được** từ Drive → Cài đặt → Quản lý ứng dụng. ⚠️ File trong đây **không vào thùng rác được** —
`files.delete` là xoá cứng. Nó **có** tính vào dung lượng Drive của người dùng (điều này chỉ được
nói trong trang trợ giúp của Drive, không có trong tài liệu API).

## 5. Google Calendar — những giới hạn ảnh hưởng thiết kế

| Giới hạn | Chi tiết |
|---|---|
| **Nhắc nhở tối đa 28 ngày** | `reminders.overrides[].minutes` — *"Valid values are between **0 and 40320**"*. **Không có "nhắc trước 2 tháng".** Muốn sớm hơn phải tạo event riêng |
| Tối đa 5 override | *"The maximum number of override reminders is 5"* |
| Chỉ `email` và `popup` | Không có `sms` |
| `useDefault:false` mà thiếu `overrides` | = **không có nhắc nhở nào** |
| **`end.date` của sự kiện cả ngày là mốc loại trừ** | Sự kiện 1 ngày phải để `end.date` = ngày bắt đầu + 1. Đây là lỗi kinh điển của API này |
| RRULE | `"recurrence": ["RRULE:FREQ=MONTHLY;INTERVAL=6"]`. **Không được** có dòng `DTSTART`/`DTEND` trong field này. `timeZone` **bắt buộc** cho sự kiện lặp |
| "Mỗi 5.000 km" | RRULE thuần theo thời gian → **không biểu diễn được**. Mốc theo km phải tự quản ở state, chạm mốc thì phát một event đơn lẻ |
| Idempotency | Tự cấp `id` cho event — *"prevents duplicate event creation if the operation fails…"*. Base32hex, 5–1024 ký tự. UUID viết thường bỏ gạch là hợp lệ. **Dùng cái này** để chống tạo trùng khi mạng chập chờn |

### Deep link (không cần OAuth)
`https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=…&ctz=Asia/Ho_Chi_Minh&recur=RRULE:…`

**Không có tài liệu chính thức của Google.** Tham chiếu tốt nhất là bản cộng đồng
[InteractionDesignFoundation/add-event-to-calendar-docs](https://github.com/InteractionDesignFoundation/add-event-to-calendar-docs/blob/master/services/google.md),
được dựng lại bằng cách **đọc bộ parse deep-link trong bundle JS của Google Calendar** rồi thử lại
từng tham số trên bản live (kiểm lại lần cuối 19/08/2026).

Bẫy:
- `dates` **phải có cả mốc đầu và mốc cuối**, thiếu là hỏng im lặng.
- Có `Z` ở **cả hai** đầu → hiểu là UTC. Không có `Z` ở đầu nào → hiểu theo múi giờ người dùng. **Đừng trộn.**
- Sự kiện cả ngày: `dates=20201231/20210101` — ngày kết thúc là **hôm sau** ngày cuối cùng.
- **`erem` (nhắc nhở) hỏng** — *"the rows are added but the values themselves are not applied"*.
  → **Không đặt được nhắc nhở qua deep link.**
- `trp` đã bị bỏ, dùng `crm`. `sf` và `output` là rác cũ, bỏ đi.
- Trên **Android**, dùng `/render` chứ đừng dùng `/r/eventedit` (cái sau mở app mà không vào form tạo).

### `.ics` (RFC 5545)
Đây là **cách duy nhất không cần OAuth mà vẫn đặt được nhắc nhở**.

- MIME `text/calendar`, charset **UTF-8**.
- **Xuống dòng bắt buộc là CRLF.** Template literal trong JS cho `\n` — phải join bằng `'\r\n'` tường minh.
- Gấp dòng ở 75 **octet**, không phải 75 ký tự. RFC tự cảnh báo:
  *"It is possible for very simple implementations to generate improperly folded lines in the middle
  of a UTF-8 multi-octet sequence."* ← **cực kỳ quan trọng với tiếng Việt**.
- VCALENDAR bắt buộc `PRODID` + `VERSION`. VEVENT bắt buộc `UID` + `DTSTAMP` (+ `DTSTART`).
  `DTEND` và `DURATION` **không được** cùng xuất hiện.
- `VALARM` để nhắc: `ACTION:DISPLAY` + `DESCRIPTION` + `TRIGGER:-PT15M`.

## 6. PWA trên GitHub Pages

### Đã kiểm bằng `curl`
- HTTPS tự động (HTTP 301 sang HTTPS) → secure context đủ cho service worker.
- **Không gửi header tuỳ chỉnh nào**: không COOP, COEP, CSP, HSTS, `Service-Worker-Allowed`.
  GitHub xác nhận chính thức trong [community discussion #54257](https://github.com/orgs/community/discussions/54257).
  → **Tình cờ có lợi**: không COOP nghĩa là popup OAuth chắc chắn chạy. Đánh đổi: vĩnh viễn không
  có cross-origin isolation (không `SharedArrayBuffer`).
- `cache-control: max-age=600` cho **mọi** file, kể cả file có hash. **Không có** immutable caching.
  → Giữ lại một thế hệ asset cũ, nếu không `index.html` cũ 10 phút sẽ trỏ vào chunk đã bị xoá.
- Deep link không khớp → trả **HTTP 404 thật**, không có rewrite.

### Vì sao `BrowserRouter` + `404.html` thắng hash routing
Hai cơ chế bù nhau chính xác:
- `404.html` lo **lần tải đầu tiên** và trường hợp chưa có service worker. URL giữ nguyên.
- `navigateFallback` của service worker lo mọi lần sau, **kể cả offline hoàn toàn** — thứ mà
  `404.html` không bao giờ làm được, vì trình duyệt offline không tới được 404 handler của GitHub.

Hash routing làm `navigateFallback` **vô hiệu hoàn toàn**: fragment không bao giờ được gửi lên,
điều hướng chỉ-đổi-hash không phát sinh request nào.

> ⚠️ Khi service worker đã nắm quyền, request không còn tới GitHub nữa nên `404.html` ngừng kích hoạt
> và status nhảy 404 → 200. Nghĩa là **cấu hình `404.html` hỏng sẽ vô hình sau lần truy cập đầu.**
> → Luôn test deep link trong **cửa sổ ẩn danh mới**.

### Cấu hình bắt buộc
- `base: '/VehicleManagement/'` — **cả dấu `/` đầu lẫn cuối**. Vite tự thêm dấu đầu nếu thiếu nhưng
  **không bao giờ** thêm dấu cuối, mà vite-plugin-pwa nối chuỗi thô → `/VehicleManagementsw.js`.
  **Đừng dùng `base: './'`** — service worker sẽ đăng ký tương đối với URL trang hiện tại.
- Manifest: `id`, `start_url`, `scope` đều `/VehicleManagement/`.
  **Đặt `id` tường minh ngay ngày đầu** — bỏ trống thì mặc định bằng `start_url`; sau này đổi
  `start_url` là trình duyệt coi như **app khác**, mọi bản đã cài thành mồ côi.
  vite-plugin-pwa **không** tự sinh `id`.
- Icon `src` để **đường dẫn tương đối** (`"pwa-192x192.png"`) — plugin không thêm tiền tố base;
  trình duyệt tự giải theo URL của manifest.
- `scope` so khớp bằng **tiền tố chuỗi thô** → `/VehicleManagement` (thiếu dấu `/`) sẽ khớp nhầm
  cả `/VehicleManagementOld/`.
- `public/.nojekyll` — Jekyll bỏ qua file bắt đầu bằng `_`. Rollup có thể sinh `_commonjsHelpers-*.js`
  → bị bỏ im lặng → precache manifest 404 → **cài service worker hỏng toàn bộ**.

### Service worker vs popup OAuth — **không phải vấn đề**
`TokenClientConfig` **không có** `ux_mode` và **không có** `redirect_uri`. Không có bước điều hướng
callback nào trên origin của ta → `navigateFallback` không có gì để nuốt. Popup là cross-origin nên
service worker (vốn same-origin) không chạm tới được.

Lỗi "service worker nuốt mất OAuth callback" nổi tiếng là vấn đề của **redirect flow**, không phải
của token model. Rủi ro thật sự duy nhất: **đừng đặt `runtimeCaching` khớp `accounts.google.com`
hay `*.googleapis.com`.**

### ⚠️ Origin dùng chung
`<user>.github.io/appA/` và `/appB/` là **cùng một origin** → chung localStorage, IndexedDB,
Cache Storage, cookie, quyền. **Đặt tiền tố cho mọi key và mọi tên cache.**
Và nếu tài khoản đó từng publish một user site có `sw.js` ở gốc, scope mặc định `/` của nó
phủ luôn subpath của ta mà ta không chống được.

> ⚠️ **Cập nhật 03/10/2026:** phần tra cứu về bản export của Drivvo ở trên **không dùng tới**.
> Người dùng xác nhận Drivvo **không có chức năng xuất file**. Dữ liệu lịch sử được chép tay từ
> ảnh chụp màn hình, và format import chính thức là format gốc của app
> (`03-DATA-MODEL.md` §7.2). Giữ lại phần này phòng khi Drivvo mở export, hoặc cần nhập
> từ Fuelio/Fuelly.

## 7. Xuất Excel

### `xlsx` của SheetJS trên npm — bỏ hẳn

| | npm `xlsx` | CDN SheetJS |
|---|---|---|
| Mới nhất | **0.18.5** | 0.20.3 |
| Phát hành | **24/03/2022** | 2024 |

| CVE | Mức | Ảnh hưởng | Vá ở | Có trên npm? |
|---|---|---|---|---|
| CVE-2023-30533 (prototype pollution) | **High 7.8** | `< 0.19.3` | 0.19.3 | ❌ `first_patched_version: null` |
| CVE-2024-22363 (ReDoS) | **High 7.5** | `< 0.20.2` | 0.20.2 | ❌ `first_patched_version: null` |

SheetJS đã ngừng publish lên npm → **không tồn tại bản vá nào trên npm**, `npm audit` sẽ báo
`fixAvailable: false` vĩnh viễn. `xlsx-js-style` fork từ 0.18.5 nên **thừa kế cả 2 CVE** trong khi
`npm audit` vẫn **báo sạch** — an toàn giả.
Ngoài ra **styling là tính năng trả phí**: gán `cell.s = {...}` bị bỏ qua im lặng.

### Chọn `write-excel-file@^4.1.1`
MIT · phát hành 08/06/2026 · **~19,5 kB gzip** · 0 advisory · `sideEffects: false` ESM thật
→ import động là nó hoàn toàn nằm ngoài chunk đầu. Làm được nhiều sheet, định dạng số/ngày,
độ rộng cột, freeze pane, merge, **và styling thật**.

⚠️ v4 **phá vỡ API** so với v3 (`color` → `textColor`; trả về `{toFile, toBlob}` thay vì nhận tên file).
Hầu hết blog và trí nhớ của LLM còn ở API v3 và sẽ không chạy.

### Định dạng số kiểu Việt Nam
File `.xlsx` lưu **giá trị thô + con trỏ tới mã định dạng**, không bao giờ lưu chuỗi đã render.

- **Ngày `dd/MM/yyyy` được đảm bảo — nếu ghi mã tường minh.** Mã tự định nghĩa (`numFmtId >= 164`)
  được áp dụng y nguyên ở mọi máy. Bẫy nằm ở mã **dựng sẵn** (id 14–22, 45–47): Excel **bản địa hoá**
  chúng — cùng một file, máy Mỹ thấy `1/15/26`, máy Việt thấy `15/01/2026`.
  → **Luôn truyền chuỗi định dạng tường minh, đừng để thư viện tự chọn cho ô Date.**
- **Dấu phân cách tiền KHÔNG do ta quyết.** Mã định dạng ghi theo quy ước chuẩn (`,` nhóm nghìn,
  `.` thập phân) nhưng render theo cài đặt vùng của **người xem**. `#,##0" ₫"` với giá trị `1234567`
  ra `1.234.567 ₫` trên máy vi-VN và `1,234,567 ₫` trên máy en-US.
  Với người dùng Việt trên máy Việt thì đây **đúng là cái ta muốn** — đừng hard-code `1.234.567`,
  làm thế là biến ô thành text và `SUM` sẽ hỏng.
- Muốn ép dấu kiểu Việt bất kể máy người xem: tiền tố `[$-42A]` (vi-VN = 0x042A, dạng hex LCID).
  Dạng BCP-47 `[$-vi-VN]` Excel đời mới chấp nhận nhưng **chưa kiểm chứng được**.
- Nếu có xuất CSV: thêm `'﻿'` ở đầu. **Đừng** dùng mẹo `sep=,` — nó làm hỏng Google Sheets và LibreOffice.

## 8. Dự án mã nguồn mở đã khảo sát

| Repo | ★ | License | Dùng được gì |
|---|---|---|---|
| `rdamazio/efis-editor` | 60 | Apache-2.0 | ⭐ **PWA tĩnh trên GitHub Pages đồng bộ Drive appDataFolder, không backend, đang chạy thật.** `src/model/storage/gdrive.ts` = máy trạng thái đồng bộ 604 dòng. **Port file này.** |
| `homelabforge/mygarage` | — | — | Xử lý trường hợp biên đầy đủ nhất; mô hình tách rule/anchor/reminder |
| `sakho13/moto-reco` | — | — | Bản TypeScript gọn nhất của thuật toán tiêu thụ |
| `hargata/lubelog` | 2.876 | MIT | Mô hình nhắc nhở, hiệu chỉnh ODO. ⚠️ Có 2 lỗi biên với lần đổ không đầy |
| `javedh-dev/tracktor` | 1.025 | MIT | Thuật toán tiêu thụ TS ~90 dòng. ⚠️ Phần gộp trung bình **sai** |
| `wdkapps/FillUp` | — | — | Bản gốc kinh điển của thuật toán |
| `linuxserver/Clarkson` | 128 | MIT | ❌ Ví dụ **làm sai** — vứt cả đoạn có lần đổ không đầy. Đã chết từ 2021 |
| `The-ReNaGe/RideLog` | — | — | ❌ Ví dụ **làm sai** — không có cột `is_full_tank` |

> ⚠️ **Bẫy giấy phép:** `aashir-athar/fuelio`, `whattheheckman/lubelogger`, `belyaevsa/TankBook`,
> `waspxx/CoTrack`, `leandrowcs/car-vault`, `MK3Core/autotrack` — **không có LICENSE**
> (mặc định giữ toàn bộ quyền). Đọc để hiểu thì được, **copy code thì không**.
> Riêng `hawkinslabdev/motomate` là **AGPL-3.0** (lây lan) — tránh đọc code nếu muốn giữ giấy phép dễ chịu.

**Không có dự án nào fork được** sang PWA tĩnh — mọi dự án vehicle tracker đáng tin đều cần server
theo thiết kế. Cũng **không có starter nào** sẵn Vite + PWA + Dexie + Drive appDataFolder
(`gh search code "dexie appDataFolder"` trả về **0 kết quả**).
Và **không có dự án quản lý xe mã nguồn mở nào bằng tiếng Việt** — đây là đất trống.

## 9. Những điều KHÔNG kiểm chứng được

- Phân loại sensitive của **bất kỳ scope Calendar nào** — Google không công bố ở đâu cả.
  Chỉ Cloud Console trả lời được: thêm scope vào trình chọn "Add or remove scopes" và đọc xem
  nó rơi vào nhóm nào. **Mất 2 phút.**
- Hành vi popup `initTokenClient` bên trong **PWA standalone trên iOS**. Không có nguồn chính thức.
  Có báo cáo cộng đồng rằng luồng này thoát ra tab Safari ngoài container.
- Cloud Console có chấp nhận chuỗi `<user>.github.io` ở mục Authorized domains hay không.
- Giới hạn dung lượng appDataFolder — Drive v3 không công bố (v2 có, v3 bỏ).
- Revisions API trên file appdata — suy ra từ danh sách scope, tài liệu không nói rõ.
- Quy tắc hậu tố `Z` của `UNTIL` trong RRULE là của RFC 5545, Google chỉ nói "as specified in RFC5545";
  mức độ thực thi của Google chưa kiểm chứng.
- `oauth2.googleapis.com/revoke` có trả ACAO trên POST thật hay không (preflight thì pass).
- Hiển thị thật của `[$-vi-VN]` trong Excel/LibreOffice.
- Có file export Drivvo **tiếng Việt** thật nào ngoài đời hay không — tên cột lấy từ file locale
  của Drivvo, thứ tự cột suy ra từ export tiếng Nga và tiếng Ý.
