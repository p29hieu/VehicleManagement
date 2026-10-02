# data/

Thư mục này **cố ý trống trong git**. Repo public, còn nội dung ở đây là lịch sử phương tiện
thật của người dùng (ODO, ngày, số tiền) — dữ liệu cá nhân, chỉ giữ ở máy local.
Xem `.gitignore`.

## File có ở máy local

| File | Vai trò |
|---|---|
| `vehicle-management-import.json` | **File import chính thức.** Format `vehicle-management/import` v1 |
| `VehicleManagement-seed-drivvo.xlsx` | Bản dành cho người đọc: 11 sheet, có phân tích + báo cáo chất lượng dữ liệu |
| `csv/*.csv` | Cùng dữ liệu, tách theo bảng, dễ sửa tay |

## Nguồn

**7 ảnh chụp màn hình app Drivvo** (02/10/2026). Drivvo **không có chức năng xuất file**,
nên ảnh là nguồn duy nhất và dữ liệu được chép tay. Phạm vi: 2 phương tiện,
18 bản ghi nhiên liệu, 3 bản ghi bảo trì — đúng bằng những gì hiển thị trên ảnh.
Bản ghi cũ hơn, nếu có, nằm ngoài vùng cuộn và không có ở đây.

## Đã kiểm chứng

File import được validate tự động: 193 check (schema, enum, toàn vẹn tham chiếu,
ODO không lùi, tiền khớp số lượng × đơn giá) **và** tính lại 24 chỉ số rồi đối chiếu với
bảng tính đã verify độc lập — tất cả khớp.

Các số này là **bộ test vàng cho engine tính toán ở giai đoạn P3**:

| | Honda Moto | Hyundai Accent |
|---|---|---|
| Quãng đường theo dõi | 511 km | 3.626 km |
| Chi phí nhiên liệu / km | 483,37 đ | 1.792,61 đ |
| Chi phí / ngày | 7.044,44 đ | 86.138,61 đ |
| Khoảng cách TB giữa 2 lần đổ | 170,33 km | 278,92 km |
