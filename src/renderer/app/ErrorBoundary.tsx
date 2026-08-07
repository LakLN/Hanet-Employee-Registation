import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Không có error boundary, một lỗi render duy nhất (dữ liệu Excel bất thường, trạng thái ngoài dự
 * kiến...) sẽ làm React unmount toàn bộ cây và người dùng chỉ thấy MÀN HÌNH TRẮNG, không thông báo,
 * không cách nào tự khắc phục. Với app desktop nội bộ, đó là kiểu lỗi tốn nhiều thời gian hỗ trợ
 * nhất vì không ai biết mô tả lại chuyện gì đã xảy ra.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // console là kênh duy nhất renderer có sẵn; electron-log ghi lại console của renderer vào cùng
    // file log với main process nên vẫn lấy được stack khi người dùng gửi log về.
    console.error('[Renderer] Lỗi không xử lý được:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Ứng dụng gặp lỗi không mong muốn</h1>
          <p className="mt-2 text-sm text-slate-600">
            Dữ liệu đang xử lý có thể chưa được lưu. Vui lòng tải lại ứng dụng và thử lại. Nếu lỗi lặp lại, gửi nội dung
            bên dưới cho bộ phận kỹ thuật.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
          >
            Tải lại ứng dụng
          </button>
        </div>
      </div>
    );
  }
}
