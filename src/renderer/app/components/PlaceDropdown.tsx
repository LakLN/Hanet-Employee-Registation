import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { HanetPlace } from '@shared/types';

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

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
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10 py-1">
          {places.map((place) => (
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
      )}
    </div>
  );
}
