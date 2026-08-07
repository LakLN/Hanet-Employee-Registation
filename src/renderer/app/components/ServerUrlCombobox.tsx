import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Combobox kiểu "Servers" của Swagger UI: gõ tự do một URL mới, hoặc bấm mở dropdown để chọn lại
 * một URL đã từng kết nối thành công trước đó (savedUrls). Khác PlaceDropdown ở chỗ đây vẫn là input
 * thật (giá trị không bắt buộc phải khớp một item trong danh sách).
 */
export function ServerUrlCombobox({
  value,
  onChange,
  savedUrls,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  savedUrls: string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
        />
        {savedUrls.length > 0 && (
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="px-2 text-slate-400 hover:text-slate-600"
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {isOpen && savedUrls.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10 py-1">
          {savedUrls.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => {
                onChange(url);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm text-left hover:bg-blue-50 truncate ${
                url === value ? 'text-blue-600 font-medium bg-blue-50' : 'text-slate-700'
              }`}
            >
              {url}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
