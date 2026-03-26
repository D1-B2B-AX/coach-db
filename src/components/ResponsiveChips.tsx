"use client";

import { useEffect, useRef, useState } from "react";

interface ResponsiveChipsProps {
  items: string[];
  bgClass: string;
  textClass: string;
  overflowBgClass: string;
  overflowTextClass: string;
  maxLines?: number;
}

export default function ResponsiveChips({
  items,
  bgClass,
  textClass,
  overflowBgClass,
  overflowTextClass,
  maxLines = 2,
}: ResponsiveChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measuringRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    const measuring = measuringRef.current;
    const container = containerRef.current;
    if (!measuring || !container || items.length === 0) return;

    const measure = () => {
      const chips = measuring.querySelectorAll<HTMLElement>("[data-chip]");
      if (chips.length === 0) return;

      const firstRect = chips[0].getBoundingClientRect();
      const lineHeight = firstRect.height;
      const containerTop = measuring.getBoundingClientRect().top;
      const maxBottom = containerTop + lineHeight * maxLines + (maxLines - 1) * 4 + 2;
      const containerRight = container.getBoundingClientRect().right;

      let count = 0;
      for (const chip of chips) {
        if (chip.getBoundingClientRect().top < maxBottom) count++;
        else break;
      }

      if (count < items.length && count > 0) {
        const lastVisible = chips[count - 1];
        if (lastVisible.getBoundingClientRect().right > containerRight - 36) {
          count = Math.max(count - 1, 1);
        }
      }

      setVisibleCount(count);
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [items, maxLines]);

  if (items.length === 0) return <span className="text-gray-400">-</span>;

  const hidden = items.length - visibleCount;

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden measuring container - renders all chips to measure positions */}
      <div
        ref={measuringRef}
        className="pointer-events-none invisible absolute inset-0 flex flex-wrap gap-1"
        aria-hidden
      >
        {items.map((item) => (
          <span
            key={item}
            data-chip
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${bgClass} ${textClass}`}
          >
            {item}
          </span>
        ))}
      </div>

      {/* Visible chips */}
      <div className="flex flex-wrap gap-1 overflow-hidden" style={{ maxHeight: `calc(${maxLines} * 1.5rem + ${maxLines - 1} * 0.25rem)` }}>
        {items.slice(0, visibleCount).map((item) => (
          <span
            key={item}
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${bgClass} ${textClass}`}
          >
            {item}
          </span>
        ))}
        {hidden > 0 && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${overflowBgClass} ${overflowTextClass}`}>
            +{hidden}
          </span>
        )}
      </div>
    </div>
  );
}
