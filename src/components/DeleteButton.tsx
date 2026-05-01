"use client";

import { Trash2 } from "lucide-react";

export function DeleteButton({ label, action }: { label: string; action: () => Promise<void> }) {
  return (
    <button
      className="btn danger icon-btn"
      title={label}
      type="button"
      onClick={async () => {
        if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
          await action();
        }
      }}
    >
      <Trash2 size={17} aria-hidden />
    </button>
  );
}
