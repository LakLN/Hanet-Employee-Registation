import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { HanetPlace } from '@shared/types';

// Bỏ dấu tiếng Việt để gõ "hafele" hay "chi tam" vẫn khớp "Chí Tâm" — người dùng không phải nhớ dấu.
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/**
 * Dropdown tự vẽ để chọn Place — thay cho <select> gốc (browser render rất to/xấu với danh sách
 * dài như ở đây). Dùng chung cho form cấu hình và dropdown đổi place nhanh ở header.
 */
export function PlaceDropdown({
  places,
  value,
  onChange,
  placeholder = 'Chọn địa điểm',
  className = '',
}: {
  places: HanetPlace[];
  value: string;
  onChange: (placeId: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
    else setQuery('');
  }, [isOpen]);

  const keyword = normalize(query.trim());
  const filteredPlaces = keyword
    ? places.filter((p) => normalize(p.name).includes(keyword) || p.placeID.includes(keyword))
    : places;

  const selected = places.find((p) => p.placeID === value);

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={`min-w-0 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? `${selected.name} (${selected.placeID})` : placeholder}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc Place ID"
              className="w-full text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filteredPlaces.length === 0 && (
              <div className="px-3 py-3 text-sm text-slate-400">Không tìm thấy địa điểm nào.</div>
            )}
            {filteredPlaces.map((place) => (
              <button
                key={place.placeID}
                type="button"
                onClick={() => {
                  onChange(place.placeID);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 ${
                  place.placeID === value ? 'text-blue-600 font-medium' : 'text-slate-700'
                }`}
              >
                <span className="break-words">
                  {place.name} ({place.placeID})
                </span>
                {place.placeID === value && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
