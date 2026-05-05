"use client";

import { ReactNode, useState } from "react";
import { isWithinOperatingHours, operatingWindowForYangonDate, parseOperatingHours, parseYangonDateTimeToUtc } from "@/lib/yangon-time";

type RoomSchedule = { id: string; operatingHoursJson?: string | null };

export function BookingTimeGuard({
  action,
  className,
  rooms,
  locationOperatingHoursJson,
  children
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  rooms: RoomSchedule[];
  locationOperatingHoursJson?: string | null;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");

  function validate(formData: FormData) {
    const startsAtText = String(formData.get("startsAt") || "");
    const endsAtText = String(formData.get("endsAt") || "");
    const roomId = String(formData.get("roomId") || "");
    if (!startsAtText || !endsAtText || !roomId) return "";
    const startsAt = parseYangonDateTimeToUtc(startsAtText);
    const endsAt = parseYangonDateTimeToUtc(endsAtText);
    if (startsAt < new Date()) return "Selected time is in the past. Please choose a future time.";
    const room = rooms.find((item) => item.id === roomId);
    const hours = parseOperatingHours(room?.operatingHoursJson ?? locationOperatingHoursJson);
    if (!isWithinOperatingHours(startsAt, endsAt, hours)) return "Selected time is outside the operating hours.";
    return "";
  }

  return (
    <form
      action={action}
      className={className}
      onChange={(event) => setMessage(validate(new FormData(event.currentTarget)))}
      onSubmit={(event) => {
        const nextMessage = validate(new FormData(event.currentTarget));
        setMessage(nextMessage);
        if (nextMessage) event.preventDefault();
      }}
    >
      {message ? (
        <div className="validation-dialog" role="dialog" aria-modal="true" aria-label="Booking time warning">
          <div className="notice danger form-alert">
            <span>{message}</span>
            <button className="btn secondary" type="button" onClick={() => setMessage("")}>Close</button>
          </div>
        </div>
      ) : null}
      {children}
    </form>
  );
}

export function CoworkingBookingGuard({
  action,
  className,
  locationOperatingHoursJson,
  children
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  locationOperatingHoursJson?: string | null;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");

  function validate(formData: FormData) {
    const date = String(formData.get("bookingDate") || "");
    if (!date) return "";
    const window = operatingWindowForYangonDate(date, parseOperatingHours(locationOperatingHoursJson));
    if (!window) return "Selected time is outside the operating hours.";
    if (window.end < new Date()) return "Selected time is in the past. Please choose a future time.";
    return "";
  }

  return (
    <form
      action={action}
      className={className}
      onChange={(event) => setMessage(validate(new FormData(event.currentTarget)))}
      onSubmit={(event) => {
        const nextMessage = validate(new FormData(event.currentTarget));
        setMessage(nextMessage);
        if (nextMessage) event.preventDefault();
      }}
    >
      {message ? (
        <div className="validation-dialog" role="dialog" aria-modal="true" aria-label="Booking time warning">
          <div className="notice danger form-alert">
            <span>{message}</span>
            <button className="btn secondary" type="button" onClick={() => setMessage("")}>Close</button>
          </div>
        </div>
      ) : null}
      {children}
    </form>
  );
}
