# 05 — Đồng bộ (P7)

Dữ liệu vẫn nằm ở IndexedDB trên máy. Đồng bộ chỉ là **một bản sao thêm** trong Google
Drive của chính bạn, bật/tắt tuỳ ý.

Bối cảnh nghiên cứu (vì sao token model, vì sao `*.github.io` không verify được) ở
`04-RESEARCH.md`. File này là cái đã cài và cách bật nó.

---

## 1. Vì sao có interface

`SyncBackend` (`src/sync/types.ts`) là ranh giới giữa *đồng bộ cái gì* và *cất ở đâu*.
Mọi thứ phía trên nó — merge engine, UI — không biết Drive tồn tại.

```ts
interface SyncBackend {
  pull(): Promise<RemoteSnapshot | null>
  push(snapshot: SyncSnapshot, expected: RemoteToken | null): Promise<RemoteToken>
  // + connect / disconnect / currentAccount / isConfigured
}
```

Cố tình nhỏ: **không có API theo từng bản ghi, không query, không đọc một phần.** Một
backend chỉ cần cất và trả về một blob kèm token chống ghi đè. Đó là lý do Drive, một file
trên đĩa, và một hàng trong Postgres đều cắm vào được như nhau.

Có sẵn hai implementation: `backends/drive.ts` (thật) và `backends/memory.ts` (test
double, kiêm bằng chứng interface không bị Drive làm méo).

Đổi sang Firebase/Supabase sau này = viết một file mới trong `backends/`. Không đụng
domain, không đụng DB, không đụng UI.

---

## 2. Thuật toán merge

`src/sync/merge.ts` — thuần tuý, không I/O, không đọc đồng hồ.

**Last-write-wins theo từng bản ghi**, so bằng `updated_at`. Nguyên tắc sống còn: **mọi
quyết định phải đối xứng**. Hai máy merge cùng một cặp snapshot phải ra cùng kết quả, nếu
không chúng đạp nhau vô tận, mỗi lần sync lại huỷ kết quả của lần trước. Vì thế không chỗ
nào trong file đó ưu tiên "local".

Luật phá hoà (hoà là có thật — hai sửa trong cùng một mili-giây):

1. Timestamp mới hơn thắng.
2. Hoà → **xoá thắng** bản ghi sống. Một thao tác xoá chạy đua với một sửa đổi vô thưởng
   vô phạt thì không được phép làm bản ghi sống lại.
3. Hai bản ghi sống hoà → bản có JSON-sắp-khoá lớn hơn thắng. Tuỳ tiện, nhưng **giống
   nhau trên mọi máy**, và đó là tính chất duy nhất cần có.

Timestamp hỏng hoặc thiếu → `-Infinity`, tức **thua mọi so sánh**. Bản ghi không nói được
mình đổi lúc nào thì không có tư cách ghi đè bản nói được.

### Tombstone

Xoá được ghi vào **bảng riêng** `tombstones`, không phải cột `deleted_at` trên từng bảng.

Lý do: mọi đường đọc hiện có (`buildTimeline`, consumption engine, reports) **không phải
sửa một dòng nào**. Không có cột mới nào để quên lọc.

Không có tombstone thì xoá trên máy A không phân biệt được với "máy B chưa từng nghe nói
tới bản ghi này", nên lần merge sau **hồi sinh** nó. Đây không phải rủi ro — nó chắc chắn
xảy ra.

Tombstone thua một bản ghi sống mới hơn thì bị **bỏ đi**: bản ghi đó đã tự thắng mọi bản
cũ hơn ở mọi nơi rồi, giữ lại tombstone chỉ tạo nguy cơ xoá nhầm về sau.

### Cái merge cố tình KHÔNG đồng bộ

`settings.active_vehicle_id` — đang xem xe nào là **vị trí UI của máy đó**, không phải dữ
liệu. Đồng bộ nó sẽ giật màn hình máy kia sang xe khác. Giữ bản local; bản remote chỉ dùng
để điền cho máy chưa có.

### Vì sao `applySnapshot` không xoá-rồi-ghi-lại

Một lần sync kéo dài qua một vòng mạng, và người dùng hoàn toàn có thể lưu một lần đổ xăng
ngay tại cây xăng trong lúc đó. `clear()` rồi `bulkPut()` sẽ **ném mất bản ghi đó**, vì
merge chưa bao giờ nhìn thấy nó. Nên chỉ những id mà merge thực sự quyết định mới bị động
vào; thứ gì mới hơn snapshot được để yên, lần sync sau nhặt.

---

## 3. Vì sao Drive, không phải Firebase

Chi phí dev là **$0 ở mọi quy mô**, vì byte nằm trong quota 15 GB của *từng người dùng* và
Drive API không tính tiền theo thao tác. Firebase ở mốc 10.000 user tốn ~$5–10/tháng nếu
sync viết tử tế, ~$180–360/tháng nếu viết ngây thơ (đọc lại toàn bộ bản ghi mỗi lần mở).

Và `drive.appdata` là scope **non-sensitive** → **không cần OAuth verification** → không
giới hạn 100 user. Quan trọng vì `*.github.io` **về mặt cấu trúc không thể** pass domain
verification: Search Console đòi bản ghi DNS TXT tại registrar, mà GitHub mới là chủ zone
`github.io`.

### Cái Drive không làm được

- **Không sync nền.** Token sống 1 giờ, **không có refresh token** cho app thuần frontend.
  Nên đồng bộ là một cái nút, không phải một job chạy ngầm.
- **Không có conditional write.** Drive v3 không có `If-Match`. `push()` đọc lại `version`
  ngay trước khi upload và từ chối nếu nó đã đổi — còn lại một khe hở vài trăm mili-giây
  không đóng được từ phía client.
  **Nhưng nó sống sót được:** blob chỉ là phương tiện vận chuyển. Mỗi máy giữ bản đầy đủ
  riêng trong IndexedDB, nên bản ghi bị ghi đè trong file sẽ được máy còn giữ nó đẩy ngược
  lên ở lần sync sau.
- **Bạn không nhìn được dữ liệu của user.** `appDataFolder` ẩn với cả bạn lẫn họ. Tốt cho
  riêng tư, tệ cho hỗ trợ.

---

## 3b. Tự đồng bộ

`src/sync/autoSync.ts` — chạy `syncOnce` mỗi **5 phút** sau khi đã kết nối.

Nó là một object cấp module, không phải hook, vì **lịch phải sống lâu hơn mọi màn hình**:
panel đồng bộ nằm trong Cài đặt, mà màn đó lazy-load và unmount ngay khi bạn rời đi. Một
timer thuộc về component chỉ tick khi bạn đang nhìn nó — tức là vô dụng.

| Chuyện gì xảy ra | Lịch |
|---|---|
| Thành công | tiếp tục |
| Conflict (máy khác ghi cùng lúc) | **tiếp tục** — tạm thời, lượt sau sẽ qua |
| Lỗi mạng / Drive 5xx | **tiếp tục**, ghi lại lý do, thử lại lượt sau |
| Đang offline | **bỏ lượt**, không tính là thất bại |
| Chưa kết nối | dừng, `pausedBy: 'disconnected'` |
| **Gia hạn token ngầm thất bại** | **dừng hẳn**, `pausedBy: 'auth'` |

Về điều kiện dừng: token sống 1 giờ và **không có refresh token**, nhưng hết hạn thường
*vô hình* vì app xin token mới ngầm được (`prompt: ''`). Nên thứ thực sự làm dừng lịch là
**gia hạn ngầm thất bại** — đúng lúc cần một cú bấm của bạn. Gia hạn cần popup, mà timer
thì không mở popup được, nên thử lại mỗi 5 phút chỉ là thất bại đều đặn mãi mãi.

Hai bất biến có test riêng:
- **Không bao giờ chạy chồng.** Một lượt chậm vắt qua tick kế tiếp, hoặc một cú bấm "Đồng
  bộ ngay" rơi trúng lúc timer đang chạy, đều bị mutex chặn. Hai lượt song song sẽ merge
  lên trạng thái dở dang của nhau và sinh conflict vô cớ.
- **Pause sống sót qua restart.** `App.tsx` gọi `start()` mỗi lần mount, và React remount
  thoải mái; nếu không có luật này thì một lần remount sẽ âm thầm bật lại một lịch chỉ có
  thể thất bại. Chỉ `resume()` — do bạn bấm kết nối lại — mới gỡ pause.

Lịch chỉ chạy **khi app đang mở**. Không có background sync sau khi đóng tab: muốn vậy
phải có Periodic Background Sync, mà nó không khả dụng trên iOS và vẫn cần token.

---

## 4. Tạo OAuth client ID

Không có nó, app vẫn build và chạy — panel đồng bộ chỉ báo "chưa bật".

1. [console.cloud.google.com](https://console.cloud.google.com) → tạo project (vd
   `VehicleManagement`).
2. **APIs & Services → Library** → bật **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Điền tên app, email hỗ trợ, email liên hệ
   - **Scopes: thêm đúng một cái** — `.../auth/drive.appdata`
   - Vì chỉ dùng scope non-sensitive nên **không cần submit để verify**
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**:
     - `https://<tên-github>.github.io`
     - `http://localhost:4180` (để test bản preview)
   - **Authorized redirect URIs: để trống.** Mô hình token không dùng redirect.
5. Copy client ID.

```bash
cp .env.example .env.local
# sửa VITE_GOOGLE_CLIENT_ID trong .env.local
npm run build
```

Để bản deploy có nó: **Repo → Settings → Secrets and variables → Actions → New repository
secret**, tên `VITE_GOOGLE_CLIENT_ID`. Workflow đã nối sẵn.

> Client ID **không phải bí mật**. Nó nằm công khai trong bundle JS. Cái bảo vệ nó là danh
> sách Authorized JavaScript origins — cùng client ID gọi từ origin khác sẽ bị từ chối.
> Không có client *secret* ở đây; mô hình GIS token không dùng.

Access token thì **chỉ giữ trong RAM**, không bao giờ ghi xuống localStorage: bất kỳ script
nào lọt vào trang đều đọc được localStorage, và một bearer token nằm đó là lời mời sẵn.

---

## 5. Còn chưa chắc

- **Popup GIS bên trong PWA standalone trên iOS.** Không có nguồn chính thức nào nói nó
  hoạt động ra sao; có báo cáo cộng đồng rằng luồng này thoát ra tab Safari.
  **Phải test trên iPhone thật đã cài PWA** — không suy đoán được từ máy bàn, và tôi chưa
  test được.
- **Lệch đồng hồ.** LWW tin vào đồng hồ máy. Một máy đặt sai sang năm 2030 sẽ thắng mọi
  xung đột cho tới khi chỉnh lại. Chấp nhận được với một người dùng vài thiết bị; không
  chấp nhận được nếu app thành sản phẩm nhiều người — lúc đó cần hybrid logical clock.
- **Tombstone không bao giờ bị dọn.** Mỗi lần xoá để lại một hàng vĩnh viễn. Vài trăm hàng
  là không đáng kể; nếu có ngày cần dọn thì ngưỡng phải **dài hơn khoảng thời gian một máy
  có thể offline**, nếu không bản ghi sẽ hồi sinh.
- **"Xoá toàn bộ dữ liệu" lan sang Drive.** `clearAllData()` ghi tombstone cho mọi bản ghi
  nó xoá, nên lần sync sau xoá chúng trên mọi thiết bị. Đây là lựa chọn có chủ ý: nếu
  không, xoá xong sync lại thấy dữ liệu quay về, và nút đó trở nên vô dụng khi bật đồng bộ.
  Đổi được nếu bạn muốn hướng ngược lại.
