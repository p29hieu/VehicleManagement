# VehicleManagement

Ứng dụng web PWA tiếng Việt quản lý chi phí & bảo dưỡng phương tiện (ô tô / xe máy, xăng hoặc điện).
Chạy hoàn toàn phía trình duyệt, host trên GitHub Pages, dữ liệu thuộc về người dùng.

> **Trạng thái: P0 xong — đã deploy.** Khung ứng dụng và đường ống deploy đã chạy.
> Các tab hiện là empty state; phần nhập liệu bắt đầu từ P1.

| | |
|---|---|
| 🔗 Đang chạy tại | **https://p29hieu.github.io/VehicleManagement/** |
| Vite `base` | `/VehicleManagement/` |
| Scope OAuth (v1) | `openid email profile` + `drive.appdata` + `drive.file` — **toàn bộ non-sensitive** |
| Google Calendar | **Hoãn sang v2** — xem [`docs/01-PLAN.md`](docs/01-PLAN.md) §1 |

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/00-PROMPT.md`](docs/00-PROMPT.md) | Đặc tả sản phẩm (bản soạn lại từ yêu cầu ban đầu) |
| [`docs/01-PLAN.md`](docs/01-PLAN.md) | Kế hoạch triển khai chi tiết theo giai đoạn |
| [`docs/02-UIUX.md`](docs/02-UIUX.md) | Hướng thiết kế, màu, chữ, luồng nhập liệu nhanh |
| [`docs/03-DATA-MODEL.md`](docs/03-DATA-MODEL.md) | Lược đồ dữ liệu, thuật toán tính tiêu thụ, dự báo, nhập từ Drivvo |
| [`docs/04-RESEARCH.md`](docs/04-RESEARCH.md) | Phụ lục nghiên cứu: scope Google, PWA trên GitHub Pages, xuất Excel, khảo sát OSS |

## Dữ liệu mẫu

> ⚠️ **Không có trong repo.** Bộ dữ liệu seed là lịch sử phương tiện thật, nằm trong `.gitignore`
> vì repo này public. File ở máy local: `data/VehicleManagement-seed-drivvo.xlsx` (workbook 11 sheet)
> và `data/csv/` (6 file CSV cho trình nhập liệu).

Nguồn: 7 ảnh chụp màn hình app Drivvo (02/10/2026) — 2 phương tiện, 18 bản ghi nhiên liệu,
3 bản ghi bảo trì. Các con số tổng hợp dưới đây **không phải dữ liệu cá nhân** và được dùng làm
bộ test vàng cho engine tính toán ở giai đoạn P3.

### Số liệu rút ra được

| | Honda Moto | Hyundai Accent |
|---|---|---|
| Số lần đổ | 4 | 14 |
| Quãng đường theo dõi | 511 km | 3.626 km |
| Số ngày theo dõi | 45 | 101 |
| Quãng đường mỗi ngày | 11,4 km | 53,3 km |
| Tổng chi phí | 317.000 đ | 8.700.000 đ |
| Chi phí mỗi ngày | 7.044 đ | 86.139 đ |
| Chi phí nhiên liệu mỗi km | 483 đ | 1.793 đ |
| Mức tiêu thụ ước tính¹ | ~2,3 L/100km | ~8,5 L/100km |

¹ Chỉ tính được sau khi điền đơn giá xăng ở sheet `ThamSo`. Con số trên dùng giá giả định
21.000 đ/lít **chỉ để kiểm thử công thức** — không phải giá thật, và workbook giao đi để trống ô đó.

### Mức độ tin cậy

Mọi công thức trong workbook đã được **evaluate thật** (thư viện `formulas`) và đối chiếu với
giá trị tính độc lập bằng Python: **50/50 cặp khớp, 0 lỗi**. Quá trình này phát hiện và đã sửa
2 lỗi thật — xem phần "Đã kiểm chứng" trong [`docs/01-PLAN.md`](docs/01-PLAN.md).

Sheet `KiemTraDuLieu` liệt kê 5 vấn đề chất lượng dữ liệu phát hiện từ ảnh Drivvo,
trong đó 1 vấn đề mức **Cao** (ODO mâu thuẫn ở bản ghi bảo trì của Accent).

## Phát triển

```bash
npm install
npm run dev        # http://localhost:5173/VehicleManagement/
npm run build      # build + sinh dist/404.html
npm run typecheck
```

Push lên `main` là GitHub Actions tự build và deploy.

## Tiến độ

- [x] **P0** Dựng khung + deploy GitHub Pages
- [ ] **P1** Lõi dữ liệu local (Dexie)
- [ ] **P2** Design system + nhập liệu nhanh
- [ ] **P3** Engine tính toán
- [ ] **P4** Báo cáo · **P5** PWA offline · **P6** Nhập/Xuất Excel
- [ ] **P7** Đồng bộ Google Drive · **P8** Nhắc nhở · **P9** Dự báo · **P10** Hoàn thiện

Chi tiết từng giai đoạn: [`docs/01-PLAN.md`](docs/01-PLAN.md) §5.
