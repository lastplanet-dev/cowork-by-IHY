"use client";

import { X } from "lucide-react";

export function CloseDetailsButton({ label = "Close" }: { label?: string }) {
  return (
    <button
      className="btn secondary icon-btn"
      title={label}
      type="button"
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      <X size={17} aria-hidden />
    </button>
  );
}
