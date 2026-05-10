import { addHours } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { BookingTimeGuard, CoworkingBookingGuard } from "@/components/BookingTimeGuard";
import { cancelBooking, cancelCoworkingBooking, createBooking, createCoworkingBooking, markCoworkingBookingCheckedIn, updateBooking } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { dateTimeLocal, mmk, shortDate, shortTime } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";
import { nearestYangonSlot, parseYangonDateToUtc, todayYangonDateInput } from "@/lib/yangon-time";

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; date?: string; tab?: string }> }) {
  const params = await searchParams;
  const activeLocation = await getOperationalLocation();
  const bookingDateText = params.date ?? todayYangonDateInput();
  const bookingDate = parseYangonDateToUtc(bookingDateText);
  const [customers, rooms, bookings, coworkingBookings] = await Promise.all([
    prisma.customer.findMany({ where: { locationId: activeLocation.id }, orderBy: { fullName: "asc" } }),
    prisma.room.findMany({ where: { isActive: true, locationId: activeLocation.id }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({
      where: {
        AND: [
          { room: { locationId: activeLocation.id } },
          params.status ? { status: params.status as any } : {},
          params.q ? { OR: [{ customer: { fullName: { contains: params.q } } }, { room: { name: { contains: params.q } } }] } : {}
        ]
      },
      include: { customer: true, room: true, payment: true },
      orderBy: { startsAt: "desc" },
      take: 80
    }),
    prisma.coworkingBooking.findMany({
      where: { locationId: activeLocation.id, bookingDate },
      include: { customer: true },
      orderBy: [{ status: "asc" }, { customer: { fullName: "asc" } }]
    })
  ]);
  const start = nearestYangonSlot();
  const activeCoworkingBookings = coworkingBookings.filter((booking) => booking.status !== "CANCELLED");
  const bookedSeats = activeCoworkingBookings.length;
  const seatsLeft = Math.max(0, activeLocation.coworkingSeatCapacity - bookedSeats);
  const redirectTo = `/bookings?tab=coworking&date=${bookingDateText}`;
  const roomSchedules = rooms.map((room) => ({ id: room.id, operatingHoursJson: room.operatingHoursJson }));

  return (
    <>
      <PageHeader title="Bookings" subtitle="Manage advance room bookings and daily coworking seat reservations by location." />
      <div className="content">
        <details className="panel add-panel">
          <summary className="section-head"><h2>Room Bookings</h2><span className="btn">Add room booking</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <BookingTimeGuard action={createBooking} className="form-grid" rooms={roomSchedules} locationOperatingHoursJson={activeLocation.operatingHoursJson}>
            <div className="field"><label>Customer/member</label><select name="customerId" required>{customers.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.remainingCoworkingDays} days · {c.remainingMeetingCreditHours} credit hr</option>)}</select></div>
            <div className="field"><label>Room</label><select name="roomId" required>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.roomType.replaceAll("_", " ")} · {r.bookingPricingMode === "HALF_DAY_FULL_DAY" ? "half/full day only" : `${mmk(r.hourlyRate)}/hr`}</option>)}</select></div>
            <div className="field"><label>Rental type</label><select name="rentalPackage" defaultValue="HOURLY"><option value="HOURLY">Hourly</option><option value="HALF_DAY">Half-day, 4 hours</option><option value="FULL_DAY">Full-day, 8 hours</option></select></div>
            <div className="field"><label>Start date/time</label><input name="startsAt" type="datetime-local" step="300" min={dateTimeLocal(start)} defaultValue={dateTimeLocal(start)} required /></div>
            <div className="field"><label>End date/time</label><input name="endsAt" type="datetime-local" step="300" min={dateTimeLocal(start)} defaultValue={dateTimeLocal(addHours(start, 1))} required /></div>
            <div className="field"><label>Discount type</label><select name="discountType" defaultValue=""><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
            <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue="0" /></div>
            <div className="field"><label>Discount reason</label><input name="discountReason" /></div>
            <div className="field"><label>Approved by</label><input name="discountApprovedBy" /></div>
            <div className="field"><label>Payment status</label><select name="paymentStatus" defaultValue="UNPAID"><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option></select></div>
            <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
            <div className="field"><label>Paid deposit amount</label><input name="amountPaid" type="number" min="0" placeholder="Required for partially paid" /></div>
            <div className="field full"><label>Notes</label><textarea name="notes" /></div>
            <div className="actions"><button className="btn">Create booking</button></div>
          </BookingTimeGuard>
        </details>

        <section className="panel">
          <div className="section-head">
            <h2>Room Bookings</h2>
            <form className="actions"><input name="q" placeholder="Search customer or room" defaultValue={params.q ?? ""} /><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select><button className="btn secondary">Filter</button></form>
          </div>
          <table>
            <thead><tr><th>Customer</th><th>Room</th><th>Time</th><th>Credit</th><th>Price</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.customer.fullName}</td>
                  <td>{b.room.name}<br /><span className="muted">{b.roomType.replaceAll("_", " ")}</span></td>
                  <td>{shortDate(b.startsAt)}<br />{shortTime(b.startsAt)}-{shortTime(b.endsAt)}</td>
                  <td>{b.creditHoursUsed} hr</td>
                  <td>{mmk(b.finalPrice)}</td>
                  <td><span className="status">{b.paymentStatus}</span></td>
                  <td><span className={b.status === "CANCELLED" ? "status bad" : "status ok"}>{b.status}</span></td>
                  <td>
                    <div className="actions">
                      <details>
                        <summary className="btn secondary">Edit</summary>
                        <BookingTimeGuard action={updateBooking.bind(null, b.id)} className="edit-popover form-grid" rooms={roomSchedules} locationOperatingHoursJson={activeLocation.operatingHoursJson}>
                          <div className="floating-close"><CloseDetailsButton /></div>
                          <div className="field"><label>Customer/member</label><select name="customerId" defaultValue={b.customerId} required>{customers.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.remainingCoworkingDays} days · {c.remainingMeetingCreditHours} credit hr</option>)}</select></div>
                          <div className="field"><label>Room</label><select name="roomId" defaultValue={b.roomId} required>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.roomType.replaceAll("_", " ")} · {r.bookingPricingMode === "HALF_DAY_FULL_DAY" ? "half/full day only" : `${mmk(r.hourlyRate)}/hr`}</option>)}</select></div>
                          <div className="field"><label>Rental type</label><select name="rentalPackage" defaultValue={Math.abs(b.durationHours - 4) < 0.01 ? "HALF_DAY" : Math.abs(b.durationHours - 8) < 0.01 ? "FULL_DAY" : "HOURLY"}><option value="HOURLY">Hourly</option><option value="HALF_DAY">Half-day, 4 hours</option><option value="FULL_DAY">Full-day, 8 hours</option></select></div>
                          <div className="field"><label>Start date/time</label><input name="startsAt" type="datetime-local" step="300" min={dateTimeLocal(start)} defaultValue={dateTimeLocal(b.startsAt)} required /></div>
                          <div className="field"><label>End date/time</label><input name="endsAt" type="datetime-local" step="300" min={dateTimeLocal(start)} defaultValue={dateTimeLocal(b.endsAt)} required /></div>
                          <div className="field"><label>Status</label><select name="status" defaultValue={b.status}><option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></div>
                          <div className="field"><label>Payment status</label><select name="paymentStatus" defaultValue={b.paymentStatus}><option value="UNPAID">Unpaid</option><option value="PAID">Paid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option></select></div>
                          <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue={b.payment?.method ?? "CASH"}><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
                          <div className="field"><label>Paid deposit amount</label><input name="amountPaid" type="number" min="0" defaultValue={b.paymentStatus === "PARTIALLY_PAID" ? b.payment?.amount ?? 0 : 0} /></div>
                          <div className="field"><label>Receipt/reference</label><input name="receiptNumber" defaultValue={b.payment?.receiptNumber ?? ""} /></div>
                          <div className="field"><label>Discount type</label><select name="discountType" defaultValue={b.discountType ?? ""}><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
                          <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue={b.discountValue ?? 0} /></div>
                          <div className="field"><label>Discount reason</label><input name="discountReason" defaultValue={b.discountReason ?? ""} /></div>
                          <div className="field"><label>Approved by</label><input name="discountApprovedBy" defaultValue={b.discountApprovedBy ?? ""} /></div>
                          <div className="field full"><label>Notes</label><textarea name="notes" defaultValue={b.notes ?? ""} /></div>
                          <div className="actions"><button className="btn">Save booking</button></div>
                        </BookingTimeGuard>
                      </details>
                      {b.status !== "CANCELLED" ? <form action={cancelBooking.bind(null, b.id)}><button className="btn secondary">Cancel</button></form> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Coworking Seat Bookings</h2>
              <p className="muted">Reserve daily coworking seats so the host can answer availability enquiries quickly.</p>
            </div>
            <form className="actions">
              <input type="hidden" name="tab" value="coworking" />
              <input name="date" type="date" defaultValue={bookingDateText} />
              <button className="btn secondary">View day</button>
            </form>
          </div>
          <div className="grid cols-3">
            <div className="card metric"><span>Total seats</span><strong>{activeLocation.coworkingSeatCapacity}</strong></div>
            <div className="card metric"><span>Booked seats</span><strong>{bookedSeats}</strong></div>
            <div className="card metric"><span>Seats left</span><strong>{seatsLeft}</strong></div>
          </div>
        </section>

        <details className="panel add-panel" open={params.tab === "coworking"}>
          <summary className="section-head"><h2>New Coworking Seat Booking</h2><span className="btn">Add seat booking</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <CoworkingBookingGuard action={createCoworkingBooking} className="form-grid" locationOperatingHoursJson={activeLocation.operatingHoursJson}>
            <div className="field"><label>Booking date</label><input name="bookingDate" type="date" min={todayYangonDateInput()} defaultValue={bookingDateText} required /></div>
            <div className="field"><label>Customer/member</label><select name="customerId" required>{customers.map((c) => <option key={c.id} value={c.id}>{c.customerCode ?? "No ID"} · {c.fullName} · {c.remainingCoworkingDays} days</option>)}</select></div>
            <div className="field full"><label>Notes</label><textarea name="notes" placeholder="Optional enquiry or arrival note" /></div>
            <div className="actions"><button className="btn">Reserve seat</button></div>
          </CoworkingBookingGuard>
        </details>

        <section className="panel">
          <div className="section-head">
            <h2>Coworking Bookings for {shortDate(bookingDate)}</h2>
            <span className={seatsLeft > 0 ? "status ok" : "status bad"}>{seatsLeft} seats left</span>
          </div>
          <table>
            <thead><tr><th>Customer ID</th><th>Customer</th><th>Pass</th><th>Days left</th><th>Status</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {coworkingBookings.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.customer.customerCode ?? "-"}</td>
                  <td>{booking.customer.fullName}</td>
                  <td>{booking.customer.activePassName ?? "No active pass"}</td>
                  <td>{booking.customer.remainingCoworkingDays}</td>
                  <td><span className={booking.status === "CANCELLED" ? "status bad" : booking.status === "CHECKED_IN" ? "status ok" : "status"}>{booking.status.replaceAll("_", " ")}</span></td>
                  <td>{booking.notes ?? "-"}</td>
                  <td>
                    {booking.status !== "CANCELLED" ? (
                      <div className="actions">
                        {booking.status !== "CHECKED_IN" ? (
                          <form action={markCoworkingBookingCheckedIn.bind(null, booking.id)}>
                            <input type="hidden" name="redirectTo" value={redirectTo} />
                            <button className="btn secondary">Mark arrived</button>
                          </form>
                        ) : null}
                        <form action={cancelCoworkingBooking.bind(null, booking.id)}>
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <button className="btn secondary">Cancel</button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!coworkingBookings.length && <tr><td colSpan={7} className="muted">No coworking seats booked for this day.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
