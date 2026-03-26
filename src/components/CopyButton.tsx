"use client";

interface CopyButtonProps {
  text: string;
  label: string;
  onCopy: () => void;
}

export default function CopyButton({ text, label, onCopy }: CopyButtonProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    onCopy();
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
      title="클릭하여 복사"
    >
      <span>{label}</span>
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  );
}
