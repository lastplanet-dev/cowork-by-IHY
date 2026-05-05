"use client";

import { X } from "lucide-react";
import { useState } from "react";

export function FlashMessage({ message, type = "ok" }: { message?: string; type?: "ok" | "danger" }) {
  const [visible, setVisible] = useState(Boolean(message));
  if (!message || !visible) return null;

  return (
    <div className={`flash-message notice ${type}`}>
      <span>{message}</span>
      <button className="btn secondary icon-btn" type="button" title="Close message" onClick={() => setVisible(false)}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
