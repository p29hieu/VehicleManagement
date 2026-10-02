# VehicleManagement — Thiết kế UI/UX

## 0. Bối cảnh quyết định mọi thứ

Người dùng đang **đứng ở cây xăng**: một tay cầm điện thoại, nắng chói, vừa trả tiền xong,
muốn ghi lại rồi đi ngay. Đó là 90% số lần mở app.

Ba hệ quả thiết kế, không thương lượng:

1. **Nền sáng là mặc định.** Giao diện tối đẹp trong phòng nhưng không đọc được ngoài nắng.
   Vẫn có chế độ tối, nhưng theo hệ thống chứ không ép.
2. **Chữ số to, tương phản cao.** Số tiền và số ODO là nội dung chính, không phải nhãn.
3. **Ghi được khi offline.** Cây xăng hay nằm ở chỗ sóng kém.

## 1. Hướng thẩm mỹ

**"Utilitarian công nghiệp"** — lấy cảm hứng từ mặt hiển thị của trụ bơm xăng và hoá đơn
tính tiền Việt Nam: chữ số rất to, nhãn nhỏ, khối màu đặc, đường kẻ dứt khoát.

Cố ý **không** làm: thẻ bo tròn đều tăm tắp, đổ bóng mờ, pastel, "clean minimal" chung chung.
Cũng cố ý **không** sao chép màu teal của Drivvo.

### Màu

```css
:root {
  /* Nền & chữ — tương phản cao cho ngoài trời */
  --c-bg:            oklch(98.5%  0.004  95);   /* trắng ngà, bớt chói hơn #fff */
  --c-surface:       oklch(100%   0      0);
  --c-ink:           oklch(19%    0.015  260);  /* gần đen, hơi ngả xanh */
  --c-ink-soft:      oklch(48%    0.012  260);

  /* Màu thương hiệu — xanh dầu máy đậm */
  --c-brand:         oklch(38%    0.078  195);
  --c-brand-ink:     oklch(96%    0.01   195);

  /* Màu ngữ nghĩa — gắn với LOẠI CHI PHÍ, không phải trang trí */
  --c-fuel:          oklch(72%    0.17   62);   /* hổ phách — nhiên liệu */
  --c-service:       oklch(55%    0.11   35);   /* nâu đất — bảo trì */
  --c-expense:       oklch(58%    0.09   285);  /* tím xám — chi phí khác */
  --c-danger:        oklch(53%    0.20   27);   /* quá hạn */
  --c-ok:            oklch(58%    0.14   152);

  /* Chữ */
  --f-sans: "Be Vietnam Pro", system-ui, sans-serif;
  --f-num:  "IBM Plex Mono", ui-monospace, monospace;

  --t-amount: clamp(2rem, 1.2rem + 4vw, 3.25rem);
  --t-body:   clamp(0.95rem, 0.9rem + 0.2vw, 1.05rem);
  --t-label:  0.75rem;
}
```

Màu gắn với **ý nghĩa**: hổ phách luôn là nhiên liệu, nâu đất luôn là bảo trì.
Nhìn lịch sử là biết loại chi phí mà không cần đọc chữ.

### Chữ

**Be Vietnam Pro** cho toàn bộ giao diện. Đây là lựa chọn có chủ đích, không phải mặc định:
font này được thiết kế riêng cho tiếng Việt, xử lý đúng các tổ hợp dấu chồng
(`ế`, `ự`, `ỡ`, `ẩ`) mà phần lớn font Latin dựng dấu bị đè hoặc lệch.
Thử ngay với chuỗi: **"Nạp nhiên liệu · Bảo dưỡng · Quãng đường"**.

**IBM Plex Mono** cho mọi con số, bật `font-variant-numeric: tabular-nums`
để cột số tiền thẳng hàng khi cuộn.

Chỉ 2 họ font. Preload duy nhất weight 600 của Be Vietnam Pro.

---

## 2. Cấu trúc điều hướng

```
┌────────────────────────────────────┐
│  [logo] Honda Moto ▾      [⚙] [↓]  │  ← đổi xe bằng 1 chạm
├────────────────────────────────────┤
│                                    │
│            NỘI DUNG                │
│                                    │
├────────────────────────────────────┤
│ Lịch sử  Báo cáo  (+)  Nhắc  Thêm  │
└────────────────────────────────────┘
```

4 tab + nút `+` nổi ở giữa. Đây là bố cục Drivvo cũng dùng — giữ vì nó **đúng** cho
loại ứng dụng này và người dùng đã quen, chứ không phải vì sao chép.
Khác biệt nằm ở thị giác và ở tốc độ nhập liệu.

---

## 3. Luồng quan trọng nhất: thêm lần đổ xăng dưới 10 giây

Bấm `+` → bottom sheet mở thẳng vào form nhiên liệu (**không** có bước chọn loại trung gian).

```
┌────────────────────────────────────┐
│  Đổ xăng — Honda Moto         [✕]  │
├────────────────────────────────────┤
│  SỐ TIỀN                           │
│                                    │
│       100.000 đ                    │  ← --t-amount, nhập liệu chính
│                                    │
│  [ 50k ][ 100k ][ 200k ][ 500k ]   │  ← chip học theo thói quen người dùng
├────────────────────────────────────┤
│  SỐ KM (ODO)                       │
│  20.919  ▸ gợi ý 21.006            │  ← dự đoán từ km/ngày, chạm để nhận
├────────────────────────────────────┤
│  ⬤ Đổ đầy bình      ○ Đổ một phần  │
├────────────────────────────────────┤
│  Hôm nay, 02/10          ▾ thêm... │  ← số lít, đơn giá, trạm… gấp lại
├────────────────────────────────────┤
│        [     LƯU     ]             │
└────────────────────────────────────┘
```

Vì sao từng chi tiết:

| Chi tiết | Lý do |
|---|---|
| **Số tiền đứng trước, không phải số lít** | Dữ liệu Drivvo của bạn cho thấy bạn đổ theo **số tiền chẵn**: 50k / 70k / 97k / 100k và **14 lần liên tiếp đúng 500k**. Người Việt đổ xăng theo tiền, không theo lít. Mọi app nước ngoài hỏi số lít trước — đó là sai bối cảnh. |
| **Chip số tiền nhanh** | Khởi tạo bằng 50k/100k/200k/500k, sau đó xếp lại theo 4 mức bạn hay dùng nhất. Với dữ liệu của bạn, Accent sẽ hiện `500k` ở vị trí đầu ngay lần thứ hai. |
| **ODO có gợi ý** | `odo_cuối + km_mỗi_ngày × số_ngày_trôi_qua`. Accent đi 53,3 km/ngày → sau 5 ngày gợi ý +267 km. Chạm là nhận, sai thì sửa. Tiết kiệm thao tác gõ 5 chữ số. |
| **"Đổ đầy bình" là nút to, không phải checkbox nhỏ** | Đây là trường quyết định việc tính được hay không tính được lít/100km (xem `03-DATA-MODEL.md` §3). Giấu nó đi là tự huỷ chất lượng dữ liệu. |
| **Phần còn lại gấp lại** | Số lít, đơn giá, trạm, ghi chú — hữu ích nhưng không bắt buộc. Không chặn đường đi chính. |
| **Lưu luôn khi offline** | Ghi vào IndexedDB ngay, hàng đợi đồng bộ chạy nền. Không có spinner chặn màn hình. |

### Bàn phím số kiểu Việt
Bàn phím riêng trong app (không dùng bàn phím hệ thống) có phím **`000`**.
Người Việt nghĩ "năm trăm nghìn" → gõ `500` rồi `000`. Nhanh hơn gõ 6 chữ số.
Ô nhập tự chèn dấu chấm phân cách khi gõ: `500.000`.

---

## 4. Lịch sử

Dòng thời gian theo tháng, đúng tinh thần "nhìn là hiểu":

```
THÁNG 10 2026                      ──────
 ⬤  Đổ xăng                        02 thg 10
 │   20.919 km · đổ một phần        50.000 đ
 │
THÁNG 9 2026                       ──────
 ⬤  Đổ xăng                        27 thg 9
 │   20.754 km · 165 km trước đó   100.000 đ
```

Khác Drivvo ở hai điểm có giá trị thật:
- Hiện **quãng đường kể từ bản ghi trước** ngay trên dòng — số mà người dùng thực sự quan tâm.
- Chấm màu theo loại chi phí, đọc được khi liếc nhanh.

Thao tác: vuốt trái = xoá (có hoàn tác), vuốt phải = nhân bản (lần đổ sau thường giống lần trước).

---

## 5. Báo cáo

Thứ tự ưu tiên trên màn hình:

1. **Ba ô số lớn:** `đ/ngày` · `đ/km` · `L/100km`
   Dưới mỗi ô có dòng nhỏ ghi cơ sở tính: *"từ 14 lần đổ · 3.626 km"*.
   Khi là ước tính thì ghi hẳn chữ **"ước tính"** — không giả vờ chắc chắn.
2. **Chi phí theo tháng** — cột chồng, tách 3 màu nhiên liệu/bảo trì/khác.
3. **Mức tiêu thụ theo thời gian** — đường, có dải tin cậy.
4. **Dự báo** — "Lần đổ kế tiếp: khoảng 10/10, ở 21.089 km".

Dưới 3 bản ghi thì hiện **"Chưa đủ dữ liệu — cần thêm N lần đổ"**, không hiện con số bịa.

---

## 6. Thêm nhanh từ ngoài app

- **Shortcut khi giữ icon** (`shortcuts` trong manifest): "Đổ xăng", "Thêm chi phí".
- **Share target**: chia sẻ ảnh hoá đơn vào app → tạo bản ghi nháp kèm ảnh.
- **Widget Nhắc nhở** qua Web Push.

---

## 7. Khả dụng

- Vùng chạm tối thiểu **44×44px**; chip số tiền 56px (ngón cái, có thể đeo găng).
- Tương phản ≥ 4,5:1 cho chữ thường, ≥ 3:1 cho chữ lớn — kiểm bằng automation, không bằng mắt.
- Đi được toàn bộ luồng bằng bàn phím; bẫy focus đúng trong bottom sheet.
- `prefers-reduced-motion`: tắt chuyển cảnh, giữ lại phản hồi tức thời.
- Mọi biểu đồ có bảng số tương đương cho trình đọc màn hình.
- Chỉ animate `transform` / `opacity`.

---

## 8. Ngôn ngữ

| Nguyên tắc | Ví dụ |
|---|---|
| Dùng từ người Việt thật sự nói | "Đổ xăng" cho xe máy/ô tô xăng, "Sạc điện" cho xe điện — đổi theo loại xe. Không dùng "Nạp nhiên liệu" cứng nhắc cho mọi trường hợp |
| Không dịch máy móc | "Chưa đủ dữ liệu" chứ không phải "Dữ liệu không khả dụng" |
| Số theo chuẩn Việt | `500.000 đ` · `3.626 km` · `8,54 L/100km` (dấu phẩy thập phân) |
| Ngày theo chuẩn Việt | `02/10/2026`, tuần bắt đầu Thứ Hai |
| Lỗi phải nói cách sửa | "Số km nhỏ hơn lần trước (20.919). Bạn vừa thay đồng hồ?" — kèm nút xử lý |

---

## 9. Checklist chất lượng trước khi gọi là xong

- [ ] Thêm lần đổ xăng xong **dưới 10 giây**, bấm đồng hồ trên máy thật, không phải ước lượng.
- [ ] Đọc được ngoài nắng — kiểm tra thật ngoài trời, không chỉ xem contrast ratio.
- [ ] Tắt mạng hoàn toàn: mở app, thêm bản ghi, xem lịch sử — tất cả phải chạy.
- [ ] Tiếng Việt có dấu hiển thị đúng ở mọi cỡ chữ (test `ễ ự ỡ ẩ ộ`).
- [ ] Không có màn hình nào nhìn giống template Tailwind/shadcn mặc định.
- [ ] Trạng thái hover/focus/active được thiết kế, không phải outline mặc định của trình duyệt.
