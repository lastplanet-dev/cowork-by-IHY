import { endOfDay, startOfDay } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { mmk, shortTime } from "@/lib/format";

export default async function CalendarPage() {
  const today = new Date();
  const bookings = await prisma.booking.findMany({
    where: { startsAt: { gte: startOfDay(today), lte: endOfDay(today) }, status: { not: "CANCELLED" } },
    include: { customer: true, room: true },
    orderBy: { startsAt: "asc" }
  });
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);

  return (
    <>
      <PageHeader title="Calendar" subtitle="Day view for real-time room availability and booking conflicts." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Today</h2><span className="status ok">{bookings.length} bookings</span></div>
          <div className="calendar">
            {hours.map((hour) => {
              const items = bookings.filter((b) => new Date(b.startsAt).getHours() === hour);
              return (
                <div key={hour} style={{ display: "contents" }}>
                  <strong>{hour}:00</strong>
                  <div className="slot">
                    {items.map((b) => (
                      <div className="card" key={b.id} style={{ marginBottom: 8 }}>
                        <strong>{b.room.name}</strong> · {b.customer.fullName} · {shortTime(b.startsAt)}-{shortTime(b.endsAt)} · {mmk(b.finalPrice)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
