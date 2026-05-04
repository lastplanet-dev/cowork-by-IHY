"use client";

import { ArrowLeft } from "lucide-react";

export function BackButton() {
  return (
    <button className="btn secondary" type="button" onClick={() => window.history.back()}>
      <ArrowLeft size={17} aria-hidden />
      Back
    </button>
  );
}
