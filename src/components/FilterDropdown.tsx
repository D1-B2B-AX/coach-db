"use client";

import { useEffect, useRef, useState } from "react";

interface FilterOption {
  key: string;
  display: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onClear: () => void;
  onSelectAll: () => void;
  color: "amber" | "purple" | "gray" | "blue";
}

export default function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
  onSelectAll,
  color,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const styleMap = {
    amber: { active: "bg-amber-600 text-white", inactive: "bg-amber-50 text-amber-700 hover:bg-amber-100", check: "accent-amber-600" },
    purple: { active: "bg-purple-600 text-white", inactive: "bg-purple-50 text-purple-700 hover:bg-purple-100", check: "accent-purple-600" },
    gray: { active: "bg-gray-900 text-white", inactive: "bg-gray-100 text-gray-600 hover:bg-gray-200", check: "accent-gray-600" },
    blue: { active: "bg-blue-600 text-white", inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100", check: "accent-blue-600" },
  };
  const styles = styleMap[color];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          selected.size > 0 ? styles.active : styles.inactive
        }`}
      >
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ""}
        <span className="ml-1">&#9662;</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="flex border-b border-gray-100">
            <button
              onClick={onSelectAll}
              className="flex-1 px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50"
            >
              전체 선택
            </button>
            <button
              onClick={onClear}
              className="flex-1 px-3 py-1.5 text-right text-xs text-gray-400 hover:bg-gray-50"
            >
              선택 해제
            </button>
          </div>
          {options.map((opt) => (
            <label
              key={opt.key}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.key)}
                onChange={() => onToggle(opt.key)}
                className={`h-3.5 w-3.5 rounded ${styles.check}`}
              />
              {opt.display}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
