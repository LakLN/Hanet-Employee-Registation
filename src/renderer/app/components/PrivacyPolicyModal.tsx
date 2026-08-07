import { ShieldCheck, X } from 'lucide-react';

/**
 * Nội dung dưới đây phản ánh ĐÚNG hành vi thực tế của app (đã rà lại code khi viết) — không phải
 * mẫu chính sách chung chung. Nếu sau này thay đổi cách lưu trữ (thêm log, thêm cache ảnh...), phải
 * cập nhật lại nội dung này cho khớp, tránh cam kết sai với người dùng.
 */
export function PrivacyPolicyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-full max-w-[45rem] max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600">
              <ShieldCheck size={18} />
            </div>
            <h2 className="font-semibold text-slate-800 leading-none">Chính sách bảo mật dữ liệu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3.5 text-sm text-slate-600 leading-relaxed text-justify">
          <p>
            Ứng dụng chỉ là công cụ hỗ trợ thao tác đăng ký nhân viên nhanh lên hệ thống camera AI Hanet. Toàn bộ dữ
            liệu người dùng cung cấp không được thu thập hay gửi về cho nhà phát triển dưới bất kỳ hình thức nào.
          </p>

          <div>
            <h3 className="font-medium text-slate-800">1. Ảnh khuôn mặt</h3>
            <p>Đọc trực tiếp từ thư mục người dùng lựa chọn, chuyển thẳng lên hệ thống HANET và không tạo bản sao.</p>
          </div>

          <div>
            <h3 className="font-medium text-slate-800">2. Thông tin nhân viên</h3>
            <p>
              Chỉ nằm trong bộ nhớ tạm và mất khi đóng ứng dụng. Chỉ ghi ra file khi người dùng chủ động xuất kết quả.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-800">3. Thông tin kết nối tài khoản</h3>
            <p>
              Token và cấu hình kết nối được mã hóa bằng cơ chế bảo mật của hệ điều hành, chỉ sử dụng để xác thực trực
              tiếp với HANET.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-800">4. Bên thứ ba</h3>
            <p>
              Ứng dụng không tích hợp công cụ theo dõi hay quảng cáo. Thông tin bản quyền được gửi về đối tác xác thực
              đám mây chỉ nhằm mục đích kiểm tra hiệu lực kích hoạt của ứng dụng.
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-blue-600 text-white font-medium px-4 py-2 text-sm hover:bg-blue-700 transition-colors"
          >
            Đã hiểu và đồng ý
          </button>
        </div>
      </div>
    </div>
  );
}
