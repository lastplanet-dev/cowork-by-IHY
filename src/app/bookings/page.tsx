import { addHours, setHours, setMinutes } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { cancelBooking, createBooking } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { dateTimeLocal, mmk, shortDate, shortTime } from "@/lib/format";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const [customers, rooms, bookings] = await Promise.all([
    prisma.customer.findMany({ orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({
      where: {
        AND: [
          params.status ? { status: params.status as any } : {},
          params.q ? { OR: [{ customer: { fullName: { contains: params.q } } }, { room: { name: { contains: params.q } } }] } : {}
        ]
      },
      include: { customer: true, room: true },
      orderBy: { startsAt: "desc" },
      take: 80
    })
  ]);
  const start = setMinutes(setHours(new Date(), 10), 0);

  return (
    <>
      <PageHeader title="Bookings" subtitle="Create, filter, cancel, and track paid or credit-backed room bookings." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Create Booking</h2></div>
          <form action={createBooking} className="form-grid">
            <div className="field"><label>Customer/member</label><select name="customerId" required>{customers.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.remainingCoworkingDays} days · {c.remainingMeetingCreditHours} credit hr</option>)}</select></div>
            <div className="field"><label>Room</label><select name="roomId" required>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.roomType.replaceAll("_", " ")} · {mmk(r.hourlyRate)}/hr</option>)}</select></div>
            <div className="field"><label>Start date/time</label><input name="startsAt" type="datetime-local" defaultValue={dateTimeLocal(start)} required /></div>
            <div className="field"><label>End date/time</label><input name="endsAt" type="datetime-local" defaultValue={dateTimeLocal(addHours(start, 1))} required /></div>
            <div className="field"><label>Discount type</label><select name="discountType" defaultValue=""><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
            <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue="0" /></div>
            <div className="field"><label>Discount reason</label><input name="discountReason" /></div>
            <div className="field"><label>Approved by</label><input name="discountApprovedBy" /></div>
            <div className="field"><label>Payment status</label><select name="paymentStatus" defaultValue="UNPAID"><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option></select></div>
            <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
            <div className="field full"><label>Notes</label><textarea name="notes" /></div>
            <div className="actions"><button className="btn">Create booking</button></div>
          </form>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Bookings</h2>
            <form className="actions"><input name="q" placeholder="Search customer or room" defaultValue={params.q ?? ""} /><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select><button className="btn secondary">Filter</button></form>
          </div>
          <table>
            <thead><tr><th>Customer</th><th>Room</th><th>Time</th><th>Credit</th><th>Price</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>{bookings.map((b) => <tr key={b.id}><td>{b.customer.fullName}</td><td>{b.room.name}<br /><span className="muted">{b.roomType.replaceAll("_", " ")}</span></td><td>{shortDate(b.startsAt)}<br />{shortTime(b.startsAt)}-{shortTime(b.endsAt)}</td><td>{b.creditHoursUsed} hr</td><td>{mmk(b.finalPrice)}</td><td><span className="status">{b.paymentStatus}</span></td><td><span className={b.status === "CANCELLED" ? "status bad" : "status ok"}>{b.status}</span></td><td>{b.status !== "CANCELLED" ? <form action={cancelBooking.bind(null, b.id)}><button className="btn secondary">Cancel</button></form> : null}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
