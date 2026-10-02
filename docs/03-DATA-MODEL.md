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

## 7. Nhập dữ liệu từ Drivvo

Drivvo có **ba lược đồ khác nhau, không tương thích với nhau**: export từ app mobile,
export từ `web.drivvo.com`, và file mẫu để import. **Đừng** lấy file export đem import ngược lại.

### 7.1 Tên cột tiếng Việt

Drivvo **có** bản địa hoá tiếng Việt. Tên cột lấy từ `https://web.drivvo.com/locales/vi.json`
(839 khoá, đã tải về và đối chiếu với `en.json`):

```
Dấu phân mục:
  #Xe cộ · #Nạp nhiên liệu · #Chi phí · #Dịch vụ · #Thu nhập · #Đọc số · #Hành trình · #Nhắc nhở

Nạp nhiên liệu:
  Tên xe · Công tơ mét (km) · Ngày · Nhiên liệu · Giá / L · Tổng chi phí · Thể tích ·
  Tiếp đầy thùng nhiên liệu · Nhiên liệu thứ hai · Nhiên liệu thứ ba · Tiết kiệm nhiên liệu ·
  Loại sạc · Pin đầu (%) · Pin cuối (%) · Thời lượng (phút) · Trạm xăng · Tài xế ·
  Phương thức thanh toán · Lý do · Ghi chú

Chi phí / Dịch vụ:
  Tên xe · Công tơ mét · Ngày · Tổng chi phí · Loại chi phí|Loại dịch vụ · … · Ghi chú
```

**Mức độ tin cậy:** tên cột lấy trực tiếp từ file locale của Drivvo (chắc chắn).
**Thứ tự cột** suy ra từ các file export thật bằng tiếng Nga và tiếng Ý (đã đọc từng byte).
Chưa ai quan sát được một file export tiếng Việt thật. → Vẫn cần bạn xuất thử 1 file để chốt.

### 7.2 Những cái bẫy khi parse (đã xác minh trên file export thật)

| Bẫy | Chi tiết |
|---|---|
| **Số cột thay đổi theo phiên bản** | Đã thấy 19 / 24 / 29 / 30 cột. → **Khớp theo tên cột (đã trim, không phân biệt hoa thường), TUYỆT ĐỐI không khớp theo vị trí.** |
| **Cờ đổ đầy là chữ** | `Vâng` / `Không`, không phải `1`/`0` |
| **Dấu thập phân lẫn lộn trong cùng một dòng** | Giá và thể tích dùng dấu chấm (`37.52`), nhưng ô "Tiết kiệm nhiên liệu" dùng dấu phẩy **và** kèm đơn vị (`"6,414 л/100км"`) → **bỏ hẳn ô này, đừng parse.** Ta tự tính lại |
| **Ô nhiên liệu thứ 2/thứ 3 không dùng** | Ghi literal `"0"` kèm chữ "Không" đã bản địa hoá → dễ nhận nhầm thành giá trị thật |
| **ODO `0.0`** | Nghĩa là "không ghi", không phải "xe mới" — khớp đúng quy tắc ở §3.3 |
| **Không có cột tiền tệ** | Ở bất kỳ lược đồ nào |
| **Export web không escape dấu nháy kép** | Sinh ô bằng `` `"${e}"` `` thẳng tuột → một ghi chú có chứa `"` sẽ làm hỏng cả dòng |
| **Định dạng ngày** | `yyyy-MM-dd HH:mm:ss` |
| **Đảo cực cờ đổ đầy giữa các app** | Drivvo/LubeLog lưu `is_full_tank` (mặc định đúng); aCar/Fuelio lưu ngược lại (`partial`). Hiểu nhầm chiều là **đảo ngược toàn bộ dữ liệu một cách âm thầm** |

### 7.3 Thiết kế trình nhập liệu

Vì lược đồ trôi theo phiên bản, trình nhập liệu **cho người dùng tự ánh xạ cột**
(chọn cột nguồn ↔ trường đích, có xem trước và báo lỗi từng dòng), với bộ ánh xạ sẵn cho
tiếng Việt / tiếng Anh. Nhờ vậy nhập được cả từ Fuelio, Fuelly hay file tự gõ.

> **Chuẩn hoá Unicode — bắt buộc với tiếng Việt.** macOS chuẩn hoá chuỗi về **NFD**,
> nên `Nguyễn Văn Đức` từ một file tạo trên máy Mac sẽ về dưới dạng 19 code unit thay vì 14.
> Hiển thị giống hệt nhau nhưng `===`, sắp xếp và khử trùng lặp đều sai.
> → Gọi `String(v).normalize('NFC')` ở **mọi** biên nhập liệu.

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
