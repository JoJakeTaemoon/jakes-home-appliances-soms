# Hướng dẫn tải lên hàng loạt danh mục sản phẩm

> **Đối tượng** — Nhân viên văn phòng Seoul Aqua phụ trách dữ liệu sản phẩm (quyền MANAGER trở lên)
> **Chức năng** — Ứng dụng văn phòng › Quản trị › Quản lý sản phẩm › **Tải lên CSV danh mục**
> **Tệp áp dụng** — Cùng định dạng với tệp nhận được từ nút **Xuất CSV danh mục** trên chính màn hình đó
> **Phiên bản tài liệu** — 24/09/2026 (v1)

---

## 0. Tóm tắt trong 3 dòng

1. Chỉ với một tệp này, hệ thống đăng ký cùng lúc **thương hiệu · nhóm sản phẩm · model · vật tư tiêu hao · phụ kiện · liên kết model↔phụ tùng**.
2. Việc tải lên **chỉ thêm mới.** Những gì đã có sẽ được giữ nguyên — không sửa, không xóa. Giá trị nhập sai **không** thể sửa bằng cách tải lên lại.
3. Mỗi dòng là **"1 model × 1 phụ tùng"**. Model có 20 phụ tùng thì viết 20 dòng, và thông tin model được lặp lại y hệt trên cả 20 dòng đó.

---

## 1. Tệp này tạo ra những gì trong hệ thống

Một lần tải lên sẽ tạo 5 loại dữ liệu gốc và 2 loại liên kết dưới đây.

| Mục trong hệ thống | Cột được đọc trên mỗi dòng | Dùng để làm gì |
|---|---|---|
| **Thương hiệu** | Brand | Lọc danh sách sản phẩm, sau này tổng hợp doanh thu theo thương hiệu |
| **Nhóm sản phẩm (danh mục)** | Category (EN/KO/VI) | Phân loại danh sách sản phẩm, hiển thị cho khách theo ngôn ngữ của khách |
| **Model** | Model Code, Product Name (EN/KO/VI), On Hand, Safety Stock, 4 loại giá | Mẫu máy chọn khi lập hợp đồng / đăng ký thiết bị. Mã thiết bị `MAY-000001` được cấp theo từng model |
| **Vật tư tiêu hao (lõi lọc)** | Dòng có Part Type=`Consumable`: Part SKU, Part Name, các cột chu kỳ | Tự động đề xuất thay/vệ sinh khi bảo trì định kỳ, nhắc hạn lõi lọc |
| **Phụ kiện** | Dòng có Part Type=`Accessory`: Part SKU, Part Name, Minor Part | Phụ tùng dùng khi sửa chữa, xác định tính phí hay miễn phí |
| **Liên kết model↔vật tư** | Model Code + Part SKU + Quantity trên cùng dòng | Model này lắp bao nhiêu lõi lọc |
| **Liên kết model↔phụ kiện** | Model Code + Part SKU + Quantity trên cùng dòng | Model này lắp bao nhiêu phụ kiện |

---

## 2. Quy cách tệp

| Hạng mục | Quy cách |
|---|---|
| Định dạng | **Chỉ chấp nhận CSV** (`.csv`). Nút tải lên không nhận tệp Excel (.xlsx/.xls) |
| Mã hóa ký tự | **UTF-8**. Khi lưu từ Excel phải chọn `CSV UTF-8 (dấu phẩy phân tách)` |
| Dòng đầu tiên | Bắt buộc là **dòng tiêu đề** (tên cột). Dữ liệu bắt đầu từ dòng 2 |
| Thứ tự cột | Có thể thay đổi. Hệ thống tìm cột **theo tên cột** |
| Tên cột | Không phân biệt chữ hoa/thường, nhưng ký tự, dấu cách và dấu ngoặc phải **trùng khớp chính xác** (`Model Code` ○ / `ModelCode` ✗) |
| **Cột** bắt buộc phải có | `Brand`, `Category (EN)`, `Category (KO)`, `Category (VI)`, `Model Code` — thiếu một trong năm cột này thì toàn bộ tệp bị từ chối (ô dữ liệu được phép để trống) |
| Khi giá trị có dấu phẩy | Bọc cả ô trong dấu nháy kép: `"HEPA filter (AP-3008FH, 12 months)"`. Excel tự làm việc này |
| Khi giá trị có dấu nháy kép | Viết dấu nháy kép hai lần: `"Sediment filter 11"""` (ký hiệu 11 inch). Excel tự làm việc này |
| Ô trống | Được hiểu là "không có giá trị". Ô chỉ chứa dấu cách cũng coi như trống |
| Giới hạn số dòng | Không có. Nhưng hệ thống xử lý từng dòng một, nên 700 dòng mất vài chục giây. **Không đóng tab trình duyệt cho tới khi hiện cửa sổ kết quả** |

> 💡 **Cách bắt đầu an toàn nhất** — Vào màn hình Quản lý sản phẩm, bấm **Xuất CSV danh mục** để tải dữ liệu hiện tại, rồi dùng luôn dòng tiêu đề của tệp đó. Định dạng xuất và định dạng tải lên là một.

---

## 3. Cấu trúc dòng — "1 model × 1 phụ tùng"

Mỗi dòng chứa **thông tin model (15 cột bên trái)** và **thông tin phụ tùng (9 cột bên phải)**.

```
No. │ Brand │ Category(EN/KO/VI) │ Model Code │ Product Name(EN/KO/VI) │ On Hand │ Safety │ 4 loại giá ┃ Part Type │ Part SKU │ Part Name(EN/KO/VI) │ Quantity │ Replace │ Clean │ Minor
└────────── Thông tin model: lặp lại y hệt trên mọi dòng của model đó ──────────┘ ┗━━━━━ Thông tin phụ tùng: khác nhau từng dòng ━━━━━┛
```

**Ví dụ — model `PTS-2100` có 5 lõi lọc + 2 phụ kiện** → viết 7 dòng. 15 cột thông tin model bên trái lặp lại giống hệt ở cả 7 dòng, chỉ phần phụ tùng bên phải thay đổi.

**Model không có phụ tùng nào** (ví dụ `GBD-1800` — nắp vệ sinh không dùng điện) → chỉ viết 1 dòng và để trống toàn bộ các cột từ `Part Type` trở đi.

**Khi một lõi lọc dùng chung cho nhiều model** (ví dụ `FLT-SED-11` dùng cho hơn 20 model) → viết lặp mỗi model một dòng. Lõi lọc chỉ được tạo một lần ở dòng đầu tiên, các dòng sau chỉ thêm liên kết "model này cũng dùng lõi đó".

---

## 4. Chi tiết từng cột

Cột **Bắt buộc** nếu để trống thì hạng mục tương ứng sẽ không được tạo. Cột **Tùy chọn** có thể để trống.

### 4-1. Các cột thông tin model

| # | Tên cột | Bắt buộc | Lưu vào đâu trong hệ thống | Khi để trống | Lưu ý |
|---|---|---|---|---|---|
| 1 | `No.` | – | **Không được đọc** | – | Số thứ tự để người đọc dễ nhìn. Điền gì cũng được, hoặc bỏ hẳn cột |
| 2 | `Brand` | Tùy chọn | Dữ liệu gốc thương hiệu (tên) | Model được tạo mà không có thương hiệu | **Chỉ cần lệch 1 ký tự là một thương hiệu mới được tạo.** `Seoul Aqua` / `SeoulAqua` / `seoul aqua` được coi là ba thương hiệu khác nhau (phân biệt hoa/thường) |
| 3 | `Category (EN)` | Bắt buộc* | Tên nhóm sản phẩm tiếng Anh | Model không có nhóm sản phẩm | *Phải điền **đủ cả ba** ngôn ngữ thì nhóm sản phẩm mới được gắn. Thiếu một ô là model được tạo mà không có nhóm |
| 4 | `Category (KO)` | Bắt buộc* | Tên nhóm sản phẩm tiếng Hàn | 〃 | Hiển thị cho nhân viên nói tiếng Hàn |
| 5 | `Category (VI)` | Bắt buộc* | Tên nhóm sản phẩm tiếng Việt | 〃 | Hiển thị trên màn hình khách hàng và kỹ thuật viên |
| 6 | `Model Code` | **Bắt buộc** | Mã model (duy nhất toàn hệ thống) | Cả model lẫn liên kết phụ tùng của dòng đó đều không được tạo | Đây là **khóa nhận dạng duy nhất** của model. Phải viết **hoàn toàn giống nhau** trên mọi dòng của cùng model. Dấu cách đầu/cuối được tự cắt bỏ, nhưng dấu cách ở giữa và chữ hoa/thường thì phân biệt |
| 7 | `Product Name (EN)` | Tùy chọn | Tên sản phẩm tiếng Anh | **Mã model được điền thay** | Nếu tên sản phẩm trùng mã model thì để trống cũng cho kết quả như nhau |
| 8 | `Product Name (KO)` | Tùy chọn | Tên sản phẩm tiếng Hàn | 〃 | |
| 9 | `Product Name (VI)` | Tùy chọn | Tên sản phẩm tiếng Việt | 〃 | Dùng trên hợp đồng, phiếu giao hàng và các chứng từ gửi khách |
| 10 | `On Hand` | Tùy chọn | Tồn kho hiện tại của model (ghi nhận bằng 1 bút toán tồn đầu kỳ) | `0` | Số nguyên. Cho phép số âm (ghi nhận thiếu hàng). Chỉ ghi **số**, không dấu phẩy, không số thập phân. Được lưu vào sổ kho như "tồn đầu kỳ" |
| 11 | `Safety Stock` | Tùy chọn | Tồn kho an toàn (ngưỡng cảnh báo thiếu hàng) | `0` | Số nguyên ≥ 0. Khi tồn kho xuống dưới ngưỡng này, màn hình kho sẽ cảnh báo |
| 12 | `Sale Price (VND)` | Tùy chọn | Giá bán của model | Bỏ trống | **Chỉ ghi số.** `8500000` ○ / `8,500,000` △ (được nhưng cần dấu nháy trong CSV) / `8.500.000₫` ✗ / `8500000 VND` ✗ |
| 13 | `Retail Price (VND)` | Tùy chọn | Giá bán lẻ của model | 〃 | Cơ sở cho đơn giá mặc định khi báo giá / lập hợp đồng |
| 14 | `Purchase Price (VND)` | Tùy chọn | Giá nhập (giá vốn) | 〃 | Dùng tính lợi nhuận. Không hiển thị trên chứng từ gửi khách |
| 15 | `Dealer Price (VND)` | Tùy chọn | Giá tại đại lý | 〃 | |

### 4-2. Các cột thông tin phụ tùng

| # | Tên cột | Bắt buộc | Lưu vào đâu trong hệ thống | Khi để trống | Lưu ý |
|---|---|---|---|---|---|
| 16 | `Part Type` | **Bắt buộc nếu đăng ký phụ tùng** | Phân loại phụ tùng | Phụ tùng của dòng bị bỏ qua (model vẫn được tạo bình thường) | Chỉ nhận **`Consumable`** (vật tư tiêu hao / lõi lọc) hoặc **`Accessory`** (phụ kiện). Không phân biệt hoa/thường, nhưng các từ khác (`Filter`, `Part`, tiếng Việt…) đều bị bỏ qua |
| 17 | `Part SKU` | **Bắt buộc nếu đăng ký phụ tùng** | Mã phụ tùng (duy nhất toàn hệ thống) | Phụ tùng của dòng bị bỏ qua | Vật tư tiêu hao và phụ kiện **không được dùng chung một SKU**. Phải lặp lại giống hệt cả dấu cách và chữ hoa/thường |
| 18 | `Part Name (EN)` | Tùy chọn | Tên phụ tùng tiếng Anh | **SKU được điền thay** | |
| 19 | `Part Name (KO)` | Tùy chọn | Tên phụ tùng tiếng Hàn | 〃 | Hiển thị trên ứng dụng kỹ thuật viên và phiếu xác nhận công việc |
| 20 | `Part Name (VI)` | Tùy chọn | Tên phụ tùng tiếng Việt | 〃 | Hiển thị cho kỹ thuật viên và trên chứng từ khách — **nhất định phải điền tên tiếng Việt** |
| 21 | `Quantity` | Tùy chọn | Số lượng phụ tùng lắp trên model này | `1` | Số nguyên ≥ 1. Số 0, số âm hoặc chữ đều được xử lý thành `1`. Máy làm đá cỡ lớn lắp 2–4 lõi thì ghi đúng con số đó |
| 22 | `Replace Every (days)` | Tùy chọn | Chu kỳ thay vật tư (**đơn vị NGÀY**) | Không có chu kỳ | **Là số ngày, không phải số tháng.** 3 tháng=`90`, 6 tháng=`180`, 12 tháng=`360`, 18 tháng=`540`. Bị bỏ qua ở dòng phụ kiện |
| 23 | `Clean Every (days)` | Tùy chọn | Chu kỳ vệ sinh vật tư (**đơn vị NGÀY**) | Không có chu kỳ | Ghi số ngày, hoặc **`every visit`** (vệ sinh mỗi lần đến — áp dụng cho lõi lọc thô). Phải ghi đúng chữ tiếng Anh `every visit` mới được nhận |
| 24 | `Minor Part` | Tùy chọn | Phụ kiện có phải phụ tùng giá trị nhỏ không | `N` (tính phí) | Chỉ `Y` mới được coi là phụ tùng giá trị nhỏ. **Phụ tùng nhỏ thay miễn phí cho khách có hợp đồng bảo trì** (vòi, van, ống, co nối) ghi `Y`; phụ tùng giá trị lớn (block làm lạnh, bình nóng, mạch điện) ghi `N`. Bị bỏ qua ở dòng vật tư tiêu hao |

> ⚠️ **Chu kỳ thay / vệ sinh bắt buộc tính bằng NGÀY.** Nếu dùng tiêu đề kiểu mẫu cũ `Replace Every (months)` / `Clean Every (months)`, hệ thống sẽ hiểu là tháng và nhân với 30 khi lưu. Đừng trộn lẫn hai kiểu tiêu đề.

---

## 5. Quy tắc nhận biết trùng lặp — thế nào là "giống nhau"

Hệ thống dùng các khóa dưới đây để tìm dữ liệu đã có. **Nếu tìm thấy thì giữ nguyên và chỉ thêm liên kết**, nếu không thì tạo mới.

| Hạng mục | Căn cứ xác định là trùng | Lưu ý |
|---|---|---|
| Thương hiệu | Tên thương hiệu trùng khớp tuyệt đối | Phân biệt cả hoa/thường và dấu cách |
| Nhóm sản phẩm | Trùng **cả ba** tên (Anh, Hàn, Việt) | Lệch một ngôn ngữ là tạo nhóm mới. Ví dụ đổi dấu gạch dài (—) trong `냉온정수기 — RO 방식` thành gạch ngắn (-) sẽ thành nhóm khác |
| Model | Mã model trùng khớp tuyệt đối | |
| Vật tư tiêu hao | SKU trùng khớp tuyệt đối | |
| Phụ kiện | SKU trùng khớp tuyệt đối | |
| Liên kết model↔phụ tùng | Cặp (model, phụ tùng) | Nếu đã liên kết sẵn thì `Quantity` khác đi cũng **không được cập nhật** |

Mã nhóm sản phẩm (mã chữ in hoa) được **sinh tự động** từ tên tiếng Anh. Ví dụ: `Hot and cold water purifier (RO)` → `HOT_AND_COLD_WATER_PURIFIER_RO`. Không thể tự chỉ định.

---

## 6. Nguyên tắc tuyệt đối — "chỉ thêm, không sửa"

**Đây là tính chất quan trọng nhất của chức năng này.**

- ✅ Thương hiệu, nhóm sản phẩm, model, phụ tùng, liên kết **chưa có thì được tạo mới**.
- ✅ Đã có thì **bỏ qua** (chỉ báo cáo số lượng trùng).
- ❌ **Không ghi đè** tên, giá, chu kỳ, tồn kho hiện có.
- ❌ **Không xóa** những hạng mục không xuất hiện trong tệp.

Vì vậy:

| Tình huống | Kết quả |
|---|---|
| Tải lên cùng một tệp hai lần | Lần thứ hai được tính toàn bộ là "trùng", dữ liệu không đổi (an toàn) |
| Nhập sai giá, sửa lại rồi tải lên lần nữa | **Không có tác dụng.** Phải sửa trực tiếp trên màn hình Quản lý sản phẩm |
| Muốn thêm lõi lọc cho một model đã có | Tạo tệp nhỏ chỉ gồm mã model đó + dòng lõi lọc mới rồi tải lên — chỉ liên kết được thêm |
| Muốn sửa lỗi chính tả tên lõi lọc | Tải lên lại không sửa được. Phải sửa ở màn hình dữ liệu lõi lọc |
| Khi nào giá và chu kỳ được ghi nhận | **Chỉ khi hạng mục đó được tạo mới bởi chính lần tải lên này** |

> ⚠️ Dòng gặp lỗi trong quá trình xử lý sẽ **bị bỏ qua và hệ thống chạy tiếp**. Không có cơ chế hủy toàn bộ (rollback). Nghĩa là tệp có thể chỉ được ghi nhận một phần.

---

## 7. Danh sách kiểm tra trước khi tải lên

- [ ] Các dòng cùng một mã model đã có **15 cột thông tin model giống hệt nhau** chưa? (nếu lệch, hệ thống lấy theo dòng xuất hiện trước và bỏ qua dòng sau)
- [ ] Nhóm sản phẩm đã điền **đủ cả ba** ngôn ngữ chưa?
- [ ] Cùng một nhóm sản phẩm có được viết **giống hệt** trong toàn bộ tệp không? (kể cả dấu gạch, dấu ngoặc, dấu cách)
- [ ] Khi một SKU dùng cho nhiều model, tên và chu kỳ có **giống nhau ở mọi dòng** không? (nếu khác, chỉ dòng xuất hiện đầu tiên được dùng)
- [ ] Có dùng nhầm một SKU cho cả vật tư tiêu hao lẫn phụ kiện không?
- [ ] Chu kỳ đã ghi bằng **ngày** chưa? (cẩn thận với các giá trị kiểu `6`, `12` vốn là số tháng)
- [ ] Chu kỳ vệ sinh `every visit` đã ghi đúng chữ tiếng Anh chưa?
- [ ] Ô giá có lẫn ký hiệu tiền tệ, đơn vị hay dấu chấm phân cách không?
- [ ] Đã xác định `Minor Part` là `Y`/`N` cho từng phụ kiện chưa? (ảnh hưởng trực tiếp tới số tiền tính cho khách bảo trì)
- [ ] Tệp đã được lưu ở định dạng **CSV UTF-8** chưa?

---

## 8. Các bước tải lên và cách đọc kết quả

1. Vào Ứng dụng văn phòng › **Quản trị › Quản lý sản phẩm**. (Chỉ MANAGER trở lên mới thấy nút)
2. Bấm **Tải lên CSV danh mục** → chọn tệp.
3. Trong lúc xử lý, giữ nguyên màn hình. Khoảng 700 dòng mất vài chục giây.
4. Xong sẽ hiện bảng tóm tắt kết quả.

| Mục kết quả | Ý nghĩa |
|---|---|
| Số dòng đã xử lý | Số dòng dữ liệu, không tính dòng tiêu đề |
| Tạo mới — thương hiệu / nhóm / model / vật tư / phụ kiện / liên kết | Số lượng vừa được tạo, kèm danh sách tên và mã |
| Trùng | Số lượng bị bỏ qua vì đã tồn tại |
| Cảnh báo | Các dòng có vấn đề. **Số dòng là số dòng thật trong tệp CSV** (dòng tiêu đề là dòng 1). Mở Excel và nhảy đúng tới dòng đó để kiểm tra |

Các cảnh báo thường gặp:

- `Row 45: FLT-XXX has no replace/clean cycle — it will never be scheduled`
  → Vật tư này không có chu kỳ thay lẫn chu kỳ vệ sinh. Vẫn được đăng ký nhưng **sẽ không bao giờ xuất hiện trong đề xuất bảo trì định kỳ hay nhắc hạn.** Hãy bổ sung chu kỳ ở màn hình dữ liệu lõi lọc.
- `Row 120: Unique constraint failed ...` → SKU hoặc mã model bị trùng với hạng mục khác.

---

## 9. Việc bắt buộc phải làm sau khi tải lên

Có những giá trị **không nằm trong tệp này**. Hãy bổ sung trên màn hình sau khi tải lên.

| Giá trị cần bổ sung | Ở đâu | Vì sao cần |
|---|---|---|
| **Giá vật tư tiêu hao và phụ kiện** (giá bán lẻ / giá nhập / giá đại lý) | Quản trị › Quản lý sản phẩm › dữ liệu lõi lọc · phụ kiện | Phụ tùng tạo từ tệp này có **giá bán lẻ bằng 0**. Tiền thu khi thay có tính phí sẽ thành 0 đồng |
| Nhóm sản phẩm, thương hiệu, quy cách, công dụng chính của vật tư | Dữ liệu lõi lọc | Phục vụ tìm kiếm và phân loại |
| Tồn kho vật tư tiêu hao và phụ kiện | Quản lý kho | Cột `On Hand`/`Safety Stock` của tệp này **chỉ áp dụng cho tồn kho model** |
| Chu kỳ bảo trì định kỳ của model | Quản lý sản phẩm › sửa model | Căn cứ tạo lịch bảo trì định kỳ tự động |
| Số tháng bảo hành của model | Quản lý sản phẩm › sửa model | Căn cứ xác định miễn phí / tính phí cho khách mua đứt |
| Phí thuê tháng / phí bảo trì tháng | Quản lý sản phẩm › sửa model | Số tiền của hợp đồng thuê và hợp đồng bảo trì |
| Thứ tự hiển thị lõi lọc | Cấu hình lõi lọc theo model | Lõi lọc tải lên đều có thứ tự 0, không tự sắp theo thứ tự ghi trong tệp |

---

## 10. Sự cố thường gặp và cách xử lý

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Tệp bị từ chối ngay — "thiếu cột bắt buộc" | Sai hoặc thiếu tên cột trong `Brand`, `Category (EN/KO/VI)`, `Model Code` | Sao chép nguyên dòng tiêu đề từ tệp xuất ra |
| Tệp bị từ chối — "cần tiêu đề + ít nhất 1 dòng" | Tệp rỗng hoặc không có dòng dữ liệu | |
| Tiếng Hàn / tiếng Việt bị lỗi phông khi lưu vào hệ thống | Tệp CSV không được lưu ở UTF-8 | Lưu lại bằng `CSV UTF-8 (dấu phẩy phân tách)` rồi tải lên lại. **Các dòng đã vào hệ thống với ký tự lỗi phải sửa tay trên màn hình** |
| Một nhóm sản phẩm bị tách thành hai | Một trong ba tên ngôn ngữ viết khác đi | Chuyển model sang nhóm đúng và vô hiệu hóa nhóm rỗng |
| Model được tạo nhưng lõi lọc không gắn vào | `Part Type` không phải `Consumable`/`Accessory`, hoặc `Part SKU` để trống | Sửa riêng dòng đó rồi tải lên lại — liên kết sẽ được thêm |
| Không nhận được nhắc hạn lõi lọc | Chu kỳ thay / vệ sinh đang trống | Nhập chu kỳ ở màn hình dữ liệu lõi lọc |
| Tồn kho hiển thị 0 | Cột `On Hand` để trống, hoặc đang mong đợi tồn kho của phụ tùng | Tồn kho phụ tùng phải nhập kho ở màn hình Quản lý kho |
| Giá không được ghi nhận | Model đó **đã tồn tại từ trước** | Nhập trực tiếp ở màn hình sửa model |

---

## Phụ lục A. Ví dụ điền tệp

**A-1. Model mới có 2 lõi lọc + 1 phụ kiện**

| Brand | Category (EN) | Category (KO) | Category (VI) | Model Code | Product Name (VI) | On Hand | Safety Stock | Sale Price (VND) | Part Type | Part SKU | Part Name (VI) | Quantity | Replace Every (days) | Clean Every (days) | Minor Part |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Seoul Aqua | Air purifier | 공기청정기 | Máy lọc không khí | CA-5000W | CA-5000W | 2 | 5 | 7200000 | Consumable | FLT-AIR-PREFILTER | Lõi lọc thô máy lọc khí | 1 | | every visit | |
| Seoul Aqua | Air purifier | 공기청정기 | Máy lọc không khí | CA-5000W | CA-5000W | 2 | 5 | 7200000 | Consumable | FLT-AIR-HEPA-6 | Lõi HEPA | 1 | 180 | | |
| Seoul Aqua | Air purifier | 공기청정기 | Máy lọc không khí | CA-5000W | CA-5000W | 2 | 5 | 7200000 | Accessory | ACC-ADAPTER-001 | Bộ chuyển nguồn | 1 | | | Y |

- Thông tin model (từ Brand đến giá) giống hệt ở cả 3 dòng — chỉ 1 model được tạo.
- Lõi lọc thô không có chu kỳ thay, chỉ `every visit` → được đề xuất vệ sinh mỗi lần đến.
- Bộ chuyển nguồn có `Minor Part = Y` → thay miễn phí cho khách có hợp đồng bảo trì.

**A-2. Model không có phụ tùng**

| Brand | Category (EN) | Category (KO) | Category (VI) | Model Code | Part Type | Part SKU |
|---|---|---|---|---|---|---|
| Seoul Aqua | Non-powered manual bidet | 무전원 수동 비데 | Nắp vệ sinh thông minh không dùng điện | GBD-1800 | | |

**A-3. Trường hợp lắp 4 lõi giống nhau như máy làm đá**

| Model Code | Part Type | Part SKU | Quantity | Replace Every (days) |
|---|---|---|---|---|
| FSM300 | Consumable | FLT-SED-11 | 4 | 90 |

Dù `FLT-SED-11` đã được đăng ký ở model khác, ở đây chỉ **liên kết** được thêm, và riêng model này ghi nhận số lượng 4.
