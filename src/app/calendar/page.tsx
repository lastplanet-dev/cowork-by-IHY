import {
  addDays,
  format,
} from "date-fns";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { mmk, shortDate, shortTime } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";
import { dateInputYangon, parseYangonDateTimeToUtc, parseYangonDateToUtc, todayYangonDateInput } from "@/lib/yangon-time";

type CalendarView = "day" | "week" | "month";

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<{ view?: CalendarView; date?: string; roomId?: string }>;
}) {
  const params = await searchParams;
  const activeLocation = await getOperationalLocation();
  const view = params.view === "week" || params.view === "month" ? params.view : "day";
  const selectedDateInput = params.date ?? todayYangonDateInput();
  const selectedDate = parseYangonDateToUtc(selectedDateInput);
  const roomId = params.roomId || "";

  const range = calendarRange(view, selectedDateInput);

  const [rooms, bookings] = await Promise.all([
    prisma.room.findMany({ where: { isActive: true, locationId: activeLocation.id }, orderBy: [{ roomType: "asc" }, { name: "asc" }] }),
    prisma.booking.findMany({
      where: {
        room: { locationId: activeLocation.id },
        startsAt: { lte: range.end },
        endsAt: { gte: range.start },
        status: { not: "CANCELLED" },
        ...(roomId ? { roomId } : {})
      },
      include: { customer: true, room: true },
      orderBy: { startsAt: "asc" }
    })
  ]);

  const visibleRooms = roomId ? rooms.filter((room) => room.id === roomId) : rooms;
  const days = daysBetween(range.start, range.end);
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);
  const previousDate = addDays(selectedDate, view === "month" ? -31 : view === "week" ? -7 : -1);
  const nextDate = addDays(selectedDate, view === "month" ? 31 : view === "week" ? 7 : 1);

  const linkFor = (next: Partial<{ view: CalendarView; date: Date; roomId: string }>) => {
    const query = new URLSearchParams({
      view: next.view ?? view,
      date: dateInputYangon(next.date ?? selectedDate)
    });
    const selectedRoom = next.roomId ?? roomId;
    if (selectedRoom) query.set("roomId", selectedRoom);
    return `/calendar?${query.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Check room availability by day, week, or month before confirming an enquiry."
        action={<Link className="btn" href="/bookings">Create booking</Link>}
      />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>{calendarTitle(view, range.start, range.end)}</h2>
              <p className="muted">{bookings.length} active bookings in this view</p>
            </div>
            <div className="actions">
              <Link className="btn secondary" href={linkFor({ date: previousDate })}>Previous</Link>
              <Link className="btn secondary" href={linkFor({ date: parseYangonDateToUtc(todayYangonDateInput()) })}>Today</Link>
              <Link className="btn secondary" href={linkFor({ date: nextDate })}>Next</Link>
            </div>
          </div>

          <form className="calendar-controls">
            <div className="calendar-tabs" role="tablist" aria-label="Calendar view">
              <Link className={view === "day" ? "active" : ""} href={linkFor({ view: "day" })}>Day</Link>
              <Link className={view === "week" ? "active" : ""} href={linkFor({ view: "week" })}>Week</Link>
              <Link className={view === "month" ? "active" : ""} href={linkFor({ view: "month" })}>Month</Link>
            </div>
            <input type="hidden" name="view" value={view} />
            <div className="field">
              <label>Date</label>
              <input name="date" type="date" defaultValue={dateInputYangon(selectedDate)} />
            </div>
            <div className="field">
              <label>Room</label>
              <select name="roomId" defaultValue={roomId}>
                <option value="">All rooms</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} · {room.roomType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn secondary">Apply</button>
          </form>
        </section>

        {view === "month" ? (
          <MonthView days={days} bookings={bookings} />
        ) : (
          <AvailabilityGrid days={days} hours={hours} rooms={visibleRooms} bookings={bookings} />
        )}

        <section className="panel">
          <div className="section-head"><h2>Bookings In View</h2><span className="status">{bookings.length} records</span></div>
          <table>
            <thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Customer</th><th>Status</th><th>Price</th></tr></thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{shortDate(booking.startsAt)}</td>
                  <td>{shortTime(booking.startsAt)}-{shortTime(booking.endsAt)}</td>
                  <td>{booking.room.name}<br /><span className="muted">{booking.room.roomType.replaceAll("_", " ")}</span></td>
                  <td>{booking.customer.fullName}</td>
                  <td><span className={booking.status === "CONFIRMED" ? "status ok" : "status warn"}>{booking.status}</span></td>
                  <td>{mmk(booking.finalPrice)}</td>
                </tr>
              ))}
              {!bookings.length && <tr><td colSpan={6} className="muted">No bookings in this period. Rooms are free.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function AvailabilityGrid({ days, hours, rooms, bookings }: { days: Date[]; hours: number[]; rooms: any[]; bookings: any[] }) {
  const columns = days.flatMap((day) => rooms.map((room) => ({ day, room })));
  return (
    <section className="panel availability-wrap">
      <div className="section-head">
        <h2>Availability</h2>
        <div className="actions">
          <span className="status ok">Free</span>
          <span className="status bad">Booked</span>
        </div>
      </div>
      <div className="availability-grid room-column-grid" style={{ gridTemplateColumns: `96px repeat(${Math.max(columns.length, 1)}, minmax(180px, 1fr))` }}>
        <div className="calendar-cell header">Time</div>
        {columns.map(({ day, room }) => <div className="calendar-cell header" key={`${day.toISOString()}-${room.id}`}><strong>{room.name}</strong><br /><span className="muted">{format(day, "EEE, MMM d")} · {room.roomType}</span></div>)}
        {hours.map((hour) => (
          <div key={hour} style={{ display: "contents" }}>
            <div className="calendar-cell time">{format(new Date(2026, 0, 1, hour), "h a")}</div>
            {columns.map(({ day, room }) => {
              const booked = bookings.find((booking) => overlapsHour(booking, day, hour) && booking.roomId === room.id);
              return (
                <div className="calendar-cell" key={`${day.toISOString()}-${room.id}-${hour}`}>
                  <div className={booked ? "availability-item booked" : "availability-item free"}>
                    {booked ? (
                      <><strong>{booked.customer.fullName}</strong><span>{shortTime(booked.startsAt)}-{shortTime(booked.endsAt)}</span></>
                    ) : (
                      <><strong>Free</strong><span>Available</span></>
                    )}
                  </div>
              </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function MonthView({ days, bookings }: { days: Date[]; bookings: any[] }) {
  return (
    <section className="panel">
      <div className="section-head"><h2>Month Overview</h2><span className="status">{bookings.length} bookings</span></div>
      <div className="month-grid">
        {days.map((day) => {
          const dayBookings = bookings.filter((booking) => dateInputYangon(booking.startsAt) === dateInputYangon(day));
          return (
            <div className="month-day" key={day.toISOString()}>
              <strong>{format(day, "d")}</strong>
              <span className="muted">{format(day, "EEE")}</span>
              {dayBookings.length ? (
                dayBookings.slice(0, 4).map((booking) => (
                  <div className="month-booking" key={booking.id}>
                    {shortTime(booking.startsAt)} {booking.room.name}
                  </div>
                ))
              ) : (
                <div className="month-free">No bookings</div>
              )}
              {dayBookings.length > 4 && <div className="month-more">+{dayBookings.length - 4} more</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function overlapsHour(booking: any, day: Date, hour: number) {
  const date = dateInputYangon(day);
  const slotStart = parseYangonDateTimeToUtc(`${date}T${String(hour).padStart(2, "0")}:00`);
  const slotEnd = parseYangonDateTimeToUtc(`${date}T${String(hour + 1).padStart(2, "0")}:00`);
  return new Date(booking.startsAt) < slotEnd && new Date(booking.endsAt) > slotStart;
}

function calendarTitle(view: CalendarView, start: Date, end: Date) {
  if (view === "month") return format(start, "MMMM yyyy");
  if (view === "week") return `${shortDate(start)} - ${shortDate(end)}`;
  return shortDate(start);
}

function calendarRange(view: CalendarView, dateInput: string) {
  const [year, month, day] = dateInput.split("-").map(Number);
  if (view === "month") {
    const startInput = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const end = new Date(parseYangonDateToUtc(`${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}-01`).getTime() - 1);
    return { start: parseYangonDateToUtc(startInput), end };
  }
  if (view === "week") {
    const selected = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = selected.getUTCDay() || 7;
    const monday = new Date(selected);
    monday.setUTCDate(selected.getUTCDate() - dayOfWeek + 1);
    const startInput = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
    const start = parseYangonDateToUtc(startInput);
    return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1) };
  }
  const start = parseYangonDateToUtc(dateInput);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

function daysBetween(start: Date, end: Date) {
  const days: Date[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}
