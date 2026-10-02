# VehicleManagement — Mô hình dữ liệu & công thức

> Phần thuật toán dưới đây **không phải tự nghĩ ra**. Tôi đã cho đọc mã nguồn 7 dự án mã nguồn mở
> cùng lĩnh vực và đối chiếu cách từng dự án xử lý. Nguồn tham khảo ghi ở cuối file.

---

## 1. Thực thể

### 1.1 `vehicles`

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `id` | uuid | ✓ | |
| `name` | text | ✓ | Tên hiển thị, vd "Honda Moto" |
| `kind` | enum | ✓ | `car` \| `motorcycle` \| `ev_car` \| `ev_motorcycle` \| `truck` |
| `make`, `model`, `plate`, `year` | text/int | | |
| `fuel_type` | enum | ✓ | `ron95` \| `e5ron92` \| `diesel` \| `electric` \| `hybrid` |
| `tank_capacity_l` | decimal | | Dùng để chặn giá trị số lít vô lý |
| `battery_kwh` | decimal | | Xe điện |
| `initial_odometer_km` | int | ✓ | |
| `odometer_offset_km` | int | | Khi thay cụm đồng hồ. *(mượn ý `OdometerDifference` của LubeLog)* |
| `consumption_min`, `consumption_max` | decimal | | Dải hợp lý **theo loại xe** — xem §3.4 |
| `is_active` | bool | ✓ | |

### 1.2 `fuel_entries`

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `id`, `vehicle_id` | uuid | ✓ | |
| `date` | date | ✓ | |
| `odometer_km` | int | | **Cho phép rỗng.** `0` được coi là RỖNG, không phải "xe mới" |
| `quantity` | decimal | | lít hoặc kWh |
| `unit_price`, `total_amount` | decimal | | Nhập 2 trong 3 → suy ra trường thứ 3 |
| `is_full_tank` | bool | ✓ | **Mặc định `true`.** Trường quan trọng nhất của toàn bộ mô hình |
| `missed_fill` | bool | ✓ | Mặc định `false`. Người dùng thừa nhận có lần đổ không ghi lại |
| `station`, `payment_method`, `note` | text | | |

### 1.3 `services` · `expenses`

Hai bảng dùng chung một hình dạng (`id, vehicle_id, date, odometer_km, items[], total_amount, note`),
khác nhau ở chỗ `services` có thêm `workshop` và sinh ra `reminders`.
*(LubeLog dùng đúng một `GenericRecord` cho cả service/collision/upgrade/tax — mô hình tốt, ta theo.)*

### 1.4 Nhắc nhở — tách làm 2 bảng

Đây là điểm thiết kế đáng tiền nhất. Dự án `mygarage` tách **quy tắc** khỏi **trạng thái**:

**`maintenance_rules`** — CHỈ chứa chu kỳ, **không** chứa "lần cuối làm khi nào":
`id, vehicle_id, title, maintenance_type, interval_km, interval_months, is_active`

**`reminders`** — chứa mốc neo và hạn:
`id, vehicle_id, rule_id, due_date, due_odometer_km,`
`anchor_kind ('service'|'completion'|'baseline'), anchor_date, anchor_odometer_km,`
`completed_at, snoozed_until, gcal_event_id, status`

> Vì sao tách: nếu nhét `last_performed` vào quy tắc thì quy tắc và nhắc nhở nó sinh ra
> có thể mâu thuẫn nhau. Tách ra thì điều đó không xảy ra được về mặt cấu trúc.

**Ngữ nghĩa "5.000 km HOẶC 6 tháng":** hai trục **độc lập**, cái nào tới trước thì kích hoạt.
Ngày hạn **không bao giờ** được suy ra từ số km.
Cộng tháng phải kẹp cuối tháng: `31/08 + 6 tháng = 28/02`.
Nếu một trục cần số liệu mà mốc neo không có → **bỏ trục đó, không đoán**.

**`anchor_kind`** quyết định có bị trôi lịch hay không:
- `completion` — neo vào ngày thực tế làm xong → lịch trôi dần.
- `service` — neo vào ngày đáng lẽ phải làm → không trôi.

---

## 2. Suy ra trường còn thiếu

```
quantity × unit_price = total_amount
```
Nhập đủ 2 → tính trường thứ 3 và đánh dấu `derived: true`.
Nhập đủ 3 mà lệch quá 1% → cảnh báo, **không tự sửa**.

---

## 3. Mức tiêu thụ nhiên liệu

### 3.1 Phương pháp chuẩn: đổ-đầy-tới-đổ-đầy

Đây là bất biến mà **mọi** cài đặt đúng đều có (đã kiểm chứng trên LubeLog, revline, mygarage,
moto-reco, FillUp):

> Duyệt bản ghi theo **thứ tự ODO tăng dần**. Giữ biến tích luỹ `litersSinceLastFull`.
> **Cộng số lít của bản ghi hiện tại vào biến tích luỹ TRƯỚC khi kiểm tra `is_full_tank`.**
> Khi gặp lần đổ đầy: `tiêu_thụ = litersSinceLastFull / (odo_hiện_tại − odo_lần_đổ_đầy_trước) × 100`,
> rồi **reset biến tích luỹ về 0**.

Hệ quả về off-by-one — đây là chỗ hầu hết các bản tự viết làm sai:

| Thành phần | Có tính vào tử số? |
|---|---|
| Lần đổ đầy **mở đầu** khoảng | ❌ KHÔNG (số lít đó đã cháy ở khoảng TRƯỚC) |
| Các lần đổ **không đầy** ở giữa | ✅ CÓ |
| Lần đổ đầy **kết thúc** khoảng | ✅ CÓ |

```ts
// packages/core/src/fuel/consumption.ts
export interface Segment { fromOdo: number; toOdo: number; liters: number; }

export function segments(entries: FuelEntry[]): Segment[] {
  const sorted = [...entries]
    .filter(e => e.quantity != null)
    .sort((a, b) => (a.odometer_km ?? 0) - (b.odometer_km ?? 0) || +a.date - +b.date);

  const out: Segment[] = [];
  let anchorOdo: number | null = null;
  let liters = 0;

  for (const e of sorted) {
    liters += e.quantity!;                        // CỘNG TRƯỚC khi test
    if (e.missed_fill) {                          // bỏ cả đoạn, nhưng neo lại
      anchorOdo = odoOf(e); liters = 0; continue;
    }
    if (!e.is_full_tank) continue;                // partial: giữ lít, chờ lần đổ đầy
    const odo = odoOf(e);
    if (odo == null) continue;                    // giữ lít, chờ bản ghi có ODO
    if (anchorOdo != null) {
      const dist = odo - anchorOdo;
      if (dist > 0) out.push({ fromOdo: anchorOdo, toOdo: odo, liters });
    }
    anchorOdo = odo; liters = 0;                  // RESET
  }
  return out;
}
```

### 3.2 Trung bình phải tính theo trọng số quãng đường

```ts
const avg = sum(seg.liters) / sum(seg.toOdo - seg.fromOdo) * 100;
```

**KHÔNG** lấy trung bình cộng của các con số L/100km từng bình.
Làm thế thì một bình chạy 100 km có trọng số ngang một bình chạy 400 km.

### 3.3 Các trường hợp biên bắt buộc xử lý

| Tình huống | Xử lý | Vì sao |
|---|---|---|
| Bản ghi đầu tiên | Không ra số | Không có mốc neo trước đó |
| `missed_fill = true` | Bỏ cả đoạn, **nhưng vẫn neo lại** | Đoạn đó không đáng tin; đoạn sau thì đáng tin |
| `odometer_km` rỗng **hoặc bằng 0** | Coi như RỖNG — giữ số lít, chờ bản ghi sau có ODO | `0` hầu như luôn là bỏ trống, không phải xe mới. Neo vào `0` sẽ làm bình kế tiếp trải dài toàn bộ đồng hồ |
| `dist <= 0` | Bỏ khoảng, **giữ lại số lít** cho khoảng sau | Đừng vứt nhiên liệu đi — `revline` và `moto-reco` vứt, đó là lỗi |
| Bản ghi đầu là **đổ không đầy** | Số lít của nó **phải bị loại** | Đây chính là lỗi của LubeLog: nó giữ lại → báo tiêu thụ thấp hơn thực tế |
| Ngoài dải hợp lý | Loại khỏi trung bình, vẫn hiện riêng kèm cảnh báo | Chặn lỗi gõ ODO lan vào thống kê |

### 3.4 Dải hợp lý phải theo loại xe

`mygarage` dùng cố định 2,35–47 L/100km. **Dải này sai với xe máy.**
Dữ liệu Drivvo của bạn cho Honda Moto ra **2,30 L/100km** — hoàn toàn bình thường với xe máy,
nhưng sẽ bị dải của mygarage loại oan.

| Loại xe | L/100km hợp lý |
|---|---|
| Xe máy | 1,2 – 6 |
| Ô tô xăng | 4 – 25 |
| Ô tô dầu | 3 – 20 |
| Xe điện (kWh/100km) | 8 – 35 |

### 3.5 Khi KHÔNG có cờ đổ đầy (chính là dữ liệu Drivvo của bạn)

Cả 2 xe đều đổ theo số tiền chẵn (50k/70k/97k/100k và 14 lần × 500k) → gần như chắc chắn
**không phải đổ đầy**, nên §3.1 không áp dụng được.

Dùng **ước tính gộp**, và trong UI phải ghi rõ chữ "ước tính":

```
L/100km ≈ (Σ số lít của các lần đổ TỪ lần thứ 2 trở đi) / (odo_cuối − odo_đầu) × 100
```

Loại lần đổ đầu vì số nhiên liệu đó đã cháy **trước** khi bắt đầu theo dõi.

**Sai số:** đúng bằng phần chênh mức xăng còn trong bình giữa lần đổ đầu và lần đổ cuối,
chia cho quãng đường. Cận trên = `dung_tích_bình / quãng_đường × 100`.
Với Accent (bình ~43 L, 3.626 km) → sai số tối đa ≈ **1,19 L/100km**, và trên thực tế nhỏ hơn nhiều.
Quãng đường càng dài thì ước tính càng chuẩn — nên phải hiện cả số km làm cơ sở.

---

## 4. Chi phí

```
chi_phí_nhiên_liệu  = Σ total_amount của các lần đổ TỪ lần thứ 2  (cùng lý do loại trừ như trên)
tổng_chi_phí        = Σ nhiên liệu + Σ bảo trì + Σ chi phí khác
đ/km                = tổng_chi_phí / (odo_cuối − odo_đầu)
đ/ngày              = tổng_chi_phí / (ngày_cuối − ngày_đầu)
```

`ngày_đầu`/`ngày_cuối` lấy qua **mọi loại bản ghi**, không chỉ nhiên liệu.

> ⚠️ Chuỗi ODO để tính quãng đường chỉ lấy từ `fuel_entries`.
> Bản ghi bảo trì hay nhập ODO sai (dữ liệu Accent của bạn có đúng một ca như vậy).

---

## 5. Dự báo

| Dự báo | Công thức | Điều kiện tối thiểu |
|---|---|---|
| ODO lần đổ kế tiếp | `odo_cuối + TB(khoảng cách N lần gần nhất)` | ≥ 3 lần đổ |
| Ngày đổ kế tiếp | `ngày_cuối + round(khoảng_cách_TB / km_mỗi_ngày)` | ≥ 3 lần đổ |
| Ngày chạm mốc bảo dưỡng | `hôm_nay + (due_km − odo_hiện_tại) / km_mỗi_ngày` | ≥ 2 mốc ODO |
| Chi phí tháng tới | `km_mỗi_ngày × 30 × đ/km + bảo dưỡng theo lịch phân bổ` | ≥ 30 ngày dữ liệu |

`N` mặc định 5 (sửa ở sheet `ThamSo`). Dưới mức tối thiểu thì hiện
**"chưa đủ dữ liệu"**, không hiện con số.

**Quan sát từ Drivvo:** khi thêm lần đổ 02/10 của Honda (50.000 đ, nhỏ hơn mức thường ~100.000 đ),
Drivvo rút dự báo từ 167 km xuống 99 km → Drivvo có tính tới **lượng đổ**, không chỉ khoảng cách
trung bình. Thuật toán của họ không công bố. Ta **không sao chép**; ta dùng công thức tường minh ở trên.
Sheet `DuBaoDrivvo` giữ lại số của Drivvo để đối chiếu.

---

## 6. Quy tắc kiểm tra khi nhập liệu

| Luật | Mức | Hành vi |
|---|---|---|
| ODO nhỏ hơn bản ghi trước của cùng xe | Chặn | Cho phép ghi đè nếu đánh dấu "thay đồng hồ" |
| ODO nhảy > 1.000 km/ngày | Cảnh báo | Vẫn cho lưu |
| Ngày ở tương lai | Chặn | |
| `quantity > tank_capacity_l × 1,2` | Cảnh báo | |
| Thiếu 2 trong 3 trường tiền | Chặn | |
| L/100km ngoài dải theo loại xe | Cảnh báo | Loại khỏi trung bình |

---

## 7. Nhập dữ liệu

### 7.1 Drivvo không xuất được file — ảnh chụp màn hình là nguồn duy nhất

Đã xác nhận với người dùng (03/10/2026): **Drivvo không cho xuất file**.
Vì vậy mọi phương án "ánh xạ cột từ bản export Drivvo" đều **không áp dụng được**, và
bộ ánh xạ cột tiếng Việt từng tra ra ở `04-RESEARCH.md` §7 chỉ còn giá trị tham khảo
nếu sau này Drivvo mở tính năng export, hoặc cần nhập từ Fuelio/Fuelly.

**Hệ quả:** dữ liệu lịch sử được **chép tay từ ảnh chụp màn hình**, và
**format gốc của app** mới là format import chính thức — không phải format của ai khác.

### 7.2 Format import chính thức

`format: "vehicle-management/import"`, `version: 1`. Một file JSON duy nhất:

```jsonc
{
  "format": "vehicle-management/import",
  "version": 1,
  "generated_at": "2026-10-03",
  "source": { "app": "Drivvo", "method": "...", "completeness": "..." },
  "settings": {
    "currency": "VND", "distance_unit": "km", "volume_unit": "L",
    "locale": "vi-VN", "timezone": "Asia/Ho_Chi_Minh",
    "fuel_prices": { "ron95": null, "e5ron92": null, "diesel": null, "electric": null }
  },
  "vehicles":    [ /* §1.1 */ ],
  "fuel_entries":[ /* §1.2 */ ],
  "services":    [ /* §1.3 */ ],
  "expenses":    [ /* §1.3 */ ],

  // Tách riêng: KHÔNG phải dữ liệu gốc mà là đề xuất, trình nhập cho người dùng chọn nhận hay không.
  "suggested_maintenance_rules": [ /* §1.4 */ ],
  "suggested_reminders":         [ /* §1.4 */ ],

  // Vấn đề phát hiện lúc trích xuất, hiện lên UI sau khi nhập xong.
  "data_quality": [ { "severity": "high|medium|low", "refs": [], "issue": "",
                      "detail": "", "impact": "", "action": "" } ]
}
```

Vì sao tách `suggested_*` khỏi dữ liệu thật: nhắc nhở do ta đề xuất dựa trên thông lệ bảo dưỡng,
**không** có trong Drivvo. Trộn chung vào `reminders` thì người dùng không phân biệt được
đâu là dữ liệu của mình, đâu là thứ app tự bịa ra.

Cùng cấu trúc này dùng luôn cho **xuất dữ liệu** và cho `state.json` đồng bộ lên Drive
appDataFolder (§4 của `01-PLAN.md`) — một lược đồ, ba đường dùng.

### 7.3 Trình nhập liệu vẫn cần tự ánh xạ cột

Giữ nguyên thiết kế cho phép người dùng **tự ánh xạ cột** khi nhập CSV/XLSX, vì:
- Người dùng khác có thể đến từ Fuelio, Fuelly, hoặc bảng tính tự gõ.
- Lược đồ của mọi app đều trôi theo phiên bản (bản export Drivvo đã từng có 19 / 24 / 29 / 30 cột).

Nhưng đây **không còn là đường đi chính**, và không chặn P6.

> **Bẫy đảo cực cờ đổ đầy:** Drivvo/LubeLog lưu `is_full_tank` (mặc định đúng);
> aCar/Fuelio lưu ngược lại (`partial`). Hiểu nhầm chiều sẽ **đảo ngược toàn bộ dữ liệu
> một cách âm thầm**. Luôn hỏi lại người dùng ý nghĩa cột này khi nhập từ nguồn lạ.

> **Chuẩn hoá Unicode — bắt buộc với tiếng Việt.** macOS chuẩn hoá chuỗi về **NFD**,
> nên `Nguyễn Văn Đức` từ file tạo trên Mac sẽ về dạng 19 code unit thay vì 14.
> Hiển thị giống hệt nhau nhưng `===`, sắp xếp và khử trùng lặp đều sai.
> → Gọi `String(v).normalize('NFC')` ở **mọi** biên nhập liệu.

### 7.4 Luật validate khi nhập (đã chạy thật trên file hiện có: 193 check, pass hết)

| Nhóm | Kiểm tra |
|---|---|
| Schema | Trường bắt buộc có mặt; `kind` và `fuel_type` thuộc enum; `is_full_tank`/`missed_fill` là bool |
| Tham chiếu | `vehicle_id` tồn tại; `rule_id` của reminder tồn tại; `id` không trùng |
| Thời gian | Ngày không ở tương lai; `due_date` của reminder sau `anchor_date` |
| ODO | Không lùi trong chuỗi `fuel_entries` của cùng một xe; `due_odometer_km` > `anchor_odometer_km` |
| Tiền | Có `total_amount`; nếu đủ cả 3 trường thì `quantity × unit_price ≈ total_amount` (sai lệch ≤ 1%) |
| Hợp lý | L/100km ước tính nằm trong `consumption_min…max` **theo loại xe** (§3.4) |

## 8. Nguồn tham khảo

| Dự án | File | Lấy gì |
|---|---|---|
| `homelabforge/mygarage` | `backend/app/services/fuel_service.py`, `app/models/maintenance_rule.py`, `app/services/maintenance_recurrence.py` | Ngữ nghĩa đầy đủ nhất về trường hợp biên; mô hình tách rule/anchor/reminder |
| `sakho13/moto-reco` | `packages/shared-domain/src/services/FuelEfficiencyCalculationService.ts` | Bản TypeScript gọn nhất; tách `calculateDetails` trả `{distance, amount}` để tính trung bình có trọng số |
| `wdkapps/FillUp` | `src/com/github/wdkapps/fillup/GasRecordList.java` | Bản gốc kinh điển của thuật toán |
| `hargata/lubelog` | `Helper/GasHelper.cs`, `Models/Reminder/ReminderRecord.cs` | Mô hình nhắc nhở, hiệu chỉnh ODO — **và 2 lỗi biên với lần đổ không đầy ở đầu danh sách, cần tránh** |
| `Dan6erbond/revline` | `server/graph/car.resolvers.go` | Thực thể `OdometerReading` dùng chung cho cả fuel và service |
| `linuxserver/Clarkson` | `src/app/services/fuel.service.ts` | ❌ **Ví dụ làm SAI** — vứt bỏ cả đoạn có lần đổ không đầy |
| `The-ReNaGe/RideLog` | `backend/routes/fuels.py` | ❌ **Ví dụ làm SAI** — không có cột `is_full_tank` |
