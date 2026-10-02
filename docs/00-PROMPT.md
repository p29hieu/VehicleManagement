# VehicleManagement — Đặc tả sản phẩm (prompt đã soạn lại)

> **Về tên dự án:** bạn viết `VerhicleManagement`. Đúng chính tả tiếng Anh là **Vehicle** (không có `r`
> sau `Ve`). Vì dự án sẽ public lên GitHub Pages và tên nằm trong URL, tôi dùng `VehicleManagement`.
> Nếu bạn muốn giữ nguyên cách viết cũ, nói một tiếng là tôi đổi lại toàn bộ.

---

## 1. Một câu tóm tắt

> Ứng dụng web PWA tiếng Việt, chạy hoàn toàn phía trình duyệt, host miễn phí trên GitHub Pages,
> giúp cá nhân Việt Nam theo dõi chi phí nhiên liệu — bảo dưỡng — vận hành của ô tô/xe máy
> (xăng hoặc điện), tự tính mức tiêu thụ và chi phí trung bình, dự báo lần đổ/lần bảo dưỡng kế tiếp,
> đồng bộ dữ liệu vào Google Drive của chính người dùng và xuất Excel.

## 2. Người dùng mục tiêu

| | |
|---|---|
| **Chính** | Chủ xe cá nhân ở Việt Nam, 1–3 phương tiện, nhập liệu ngay tại cây xăng bằng điện thoại. |
| **Phụ** | Hộ kinh doanh nhỏ có vài xe (shipper, xe dịch vụ) cần số liệu chi phí để tính giá. |
| **Không nhắm tới (v1)** | Doanh nghiệp quản lý đội xe >20 chiếc, phân quyền nhiều người, GPS telematics. |

**Bối cảnh sử dụng quyết định thiết kế:** người dùng đứng ở cây xăng, một tay cầm điện thoại, trời nắng,
mạng 3G chập chờn, vừa trả tiền xong. Luồng "thêm lần đổ xăng" phải xong trong **dưới 10 giây** và
**phải chạy được khi offline**.

## 3. Yêu cầu chức năng

### F1 — Quản lý phương tiện
- CRUD phương tiện: tên, loại (ô tô / xe máy / xe điện), hãng, dòng, biển số, năm SX,
  loại nhiên liệu (RON 95 / E5 RON 92 / Diesel / Điện / Hybrid), dung tích bình hoặc dung lượng pin, ODO ban đầu.
- Chuyển nhanh giữa các xe bằng 1 chạm ở thanh trên cùng.
- Đánh dấu xe ngừng sử dụng (giữ lịch sử, ẩn khỏi danh sách chính).

### F2 — Ghi nhận dữ liệu
- **Nhiên liệu:** ngày, ODO, số lượng (lít/kWh), đơn giá, thành tiền, cờ **đổ đầy bình**,
  cờ **bỏ sót lần đổ**, trạm, hình thức thanh toán, ghi chú.
  Quy tắc: nhập **2 trong 3** trường (số lượng / đơn giá / thành tiền) → app tự suy ra trường còn lại.
- **Bảo trì:** ngày, ODO, nhiều hạng mục trong một bản ghi, chi phí, gara, mốc kế tiếp (theo km và/hoặc theo ngày).
- **Chi phí khác:** gửi xe, cầu đường, rửa xe, bảo hiểm, đăng kiểm, phạt nguội, phụ kiện.
- Mọi bản ghi đều ghi được khi **offline**, tự đồng bộ khi có mạng.

### F3 — Tính toán (xem công thức chính xác ở `03-DATA-MODEL.md`)
- Mức tiêu thụ trung bình: **lít/100km** cho xe xăng, **kWh/100km** cho xe điện.
  Ưu tiên phương pháp **đổ-đầy-tới-đổ-đầy**; khi thiếu cờ đổ đầy thì dùng ước tính gộp **và nói rõ đó là ước tính**.
- Chi phí trung bình mỗi ngày, mỗi km, mỗi tháng.
- Tổng chi phí đã bỏ ra, tách theo nhóm (nhiên liệu / bảo trì / khác).
- Xu hướng theo thời gian: biểu đồ chi phí theo tháng, mức tiêu thụ theo lần đổ.

### F4 — Nhắc nhở bảo trì
- Nhắc theo **km**, theo **thời gian**, hoặc **cả hai** (điều kiện nào tới trước thì kích hoạt).
- Nhắc lặp lại (ví dụ: thay dầu mỗi 5.000 km hoặc 6 tháng).
- Báo trước theo ngưỡng (vd: còn 300 km hoặc còn 7 ngày).
- Thông báo trong app + **Web Push** (khi người dùng cho phép).
- ~~Đẩy sang Google Calendar~~ — **đã bỏ khỏi v1** (quyết định ngày 02/10/2026). Lý do ở `01-PLAN.md` §1.
  Lược đồ `reminders` vẫn giữ sẵn cột `gcal_event_id` để v2 cắm vào mà không phải migrate.

### F5 — Tài khoản Google
- Đăng nhập bằng Google (tuỳ chọn — app **phải dùng được mà không cần đăng nhập**).
- Đồng bộ/sao lưu dữ liệu vào Google Drive **của chính người dùng**.
- Xuất **Excel (.xlsx)** nhiều sheet, đúng định dạng số/tiền/ngày kiểu Việt Nam.
- Rời mạng vẫn dùng bình thường; đồng bộ là tính năng cộng thêm, không phải điều kiện bắt buộc.

### F6 — Dự báo
- Dự báo **ngày và ODO của lần đổ nhiên liệu kế tiếp**.
- Dự báo **ngày chạm mốc bảo dưỡng** dựa trên tốc độ đi km hiện tại.
- Dự báo **chi phí tháng tới** = (km/ngày × 30 × đ/km) + chi phí bảo dưỡng theo lịch được phân bổ.
- Mọi dự báo đều hiển thị **khoảng tin cậy** và **số bản ghi làm cơ sở**; dưới 3 bản ghi thì
  nói thẳng "chưa đủ dữ liệu" thay vì đưa ra con số.

### F7 — Nhập dữ liệu từ nơi khác
- Nhập từ file CSV/Excel theo mẫu của app (`data/VehicleManagement-seed-drivvo.xlsx`).
- Nhập từ bản export của **Drivvo** (ánh xạ cột, xem `03-DATA-MODEL.md`).
- Màn hình xem trước + báo lỗi từng dòng trước khi ghi.

## 4. Yêu cầu phi chức năng

| Mã | Yêu cầu | Tiêu chí nghiệm thu |
|---|---|---|
| NF1 | Web, deploy GitHub Pages | Static build, không server. CI tự deploy khi push `main`. |
| NF2 | PWA | Cài được về màn hình chính; mở và ghi dữ liệu được khi **hoàn toàn offline**. |
| NF3 | Giao diện tiếng Việt | 100% chuỗi tiếng Việt, định dạng `1.234.567 đ`, ngày `dd/MM/yyyy`, tuần bắt đầu Thứ Hai. |
| NF4 | Hiệu năng | LCP < 2,5s / INP < 200ms / CLS < 0,1 trên 4G mô phỏng. JS ≤ 300 kB gzip, CSS ≤ 50 kB. |
| NF5 | Dữ liệu thuộc về người dùng | Mặc định lưu local (IndexedDB). Không có server của chúng ta. Xuất/xoá toàn bộ dữ liệu bất cứ lúc nào. |
| NF6 | Khả dụng | WCAG 2.2 AA: tương phản, vùng chạm ≥ 44px, điều hướng bàn phím, hỗ trợ `prefers-reduced-motion`. |
| NF7 | Phạm vi v1 | **Chỉ phương tiện di chuyển.** Thiết bị/máy móc khác thiết kế sẵn chỗ mở rộng nhưng không làm trong v1. |

## 5. Ràng buộc kỹ thuật đã biết

1. **GitHub Pages = hosting tĩnh.** Không có backend, không có biến môi trường bí mật.
   Mọi khoá OAuth nằm trong bundle → chỉ được dùng loại khoá public (OAuth Client ID kiểu Web,
   giới hạn theo JavaScript origin). **Tuyệt đối không có client secret trong repo.**
2. **Không có refresh token.** Không backend nghĩa là access token hết hạn (~1 giờ) phải xin lại.
   Thiết kế phải chịu được việc token hết hạn giữa chừng mà không mất dữ liệu.
3. **Dữ liệu gốc nằm ở máy người dùng.** Google Drive là bản sao đồng bộ, không phải nguồn sự thật.
   Cần chiến lược xử lý xung đột khi dùng nhiều thiết bị.
4. **Xác minh OAuth của Google.** Một số scope bị xếp loại nhạy cảm/hạn chế, cần Google duyệt
   trước khi vượt 100 người dùng. Chọn bộ scope tối thiểu để tránh quy trình này càng lâu càng tốt.
5. **Tên repo nằm trong đường dẫn** (`/VehicleManagement/`) → `base` của Vite, `scope` và
   `start_url` của manifest, và phạm vi service worker đều phải khớp subpath này.

## 6. Ngoài phạm vi v1

**Tích hợp Google Calendar** (hoãn sang v2) · chia sẻ nhiều người dùng · đồng bộ realtime ·
OCR hoá đơn · tự lấy giá xăng từ internet · tích hợp OBD-II/GPS · app native iOS/Android ·
đa ngôn ngữ (chỉ tiếng Việt ở v1) · quản lý thiết bị/máy móc ngoài phương tiện.

## 7. Định nghĩa "xong" cho v1

- [ ] Thêm một lần đổ xăng xong trong < 10 giây, đo bằng thao tác thật trên điện thoại.
- [ ] Mở app ở chế độ máy bay, thêm bản ghi, bật mạng lại → dữ liệu tự lên Drive.
- [ ] Số liệu lít/100km và đ/km khớp với bảng tính kiểm chứng trong `data/`.
- [ ] Xuất Excel mở được bằng Excel và Google Sheets, số tiền/ngày đúng định dạng Việt Nam.
- [ ] Nhắc nhở "5.000 km hoặc 6 tháng" kích hoạt đúng trục nào tới trước.
- [ ] Lighthouse: PWA installable, Performance ≥ 90, Accessibility ≥ 95.
- [ ] Nhập trọn bộ dữ liệu Drivvo trong `data/` không lỗi.
