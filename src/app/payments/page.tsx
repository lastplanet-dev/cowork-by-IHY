import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { completePayment, createPaymentForBooking, updatePayment, voidPayment } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { dateTimeLocal, mmk, shortDate } from "@/lib/format";
import { getCurrentStaff, getOperationalLocation } from "@/lib/session";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const locationPaymentWhere = paymentLocationWhere(activeLocation.id);
  const where = {
    AND: [
      locationPaymentWhere,
      params.status ? { status: params.status as any } : {},
      params.q ? { OR: [{ receiptNumber: { contains: params.q } }, { customer: { fullName: { contains: params.q } } }] } : {}
    ]
  };
  const [payments, summary, unpaidBookingsWithoutPayment] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        customer: true,
        booking: { include: { room: true } },
        membership: true,
        coffeeSale: { include: { coffeeItem: true } },
        receivedBy: true,
        adjustments: { include: { adjustedBy: true }, orderBy: { adjustedAt: "desc" } }
      },
      orderBy: [{ status: "asc" }, { paymentDate: "desc" }],
      take: 100
    }),
    prisma.payment.groupBy({ by: ["status"], where: locationPaymentWhere, _sum: { amount: true }, _count: true }),
    prisma.booking.findMany({
      where: {
        room: { locationId: activeLocation.id },
        payment: null,
        paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] }
      },
      include: { customer: true, room: true },
      orderBy: { startsAt: "desc" },
      take: 50
    })
  ]);
  const canAdjust = staff.role === "SUPER_ADMIN";
  const pendingPayments = payments.filter((payment) => payment.status === "UNPAID" || payment.status === "PARTIALLY_PAID");
  const completedPayments = payments.filter((payment) => payment.status === "PAID" || payment.status === "WAIVED" || payment.status === "VOID");
  const totalFor = (status: string) => summary.find((row) => row.status === status)?._sum.amount ?? 0;
  const countFor = (status: string) => summary.find((row) => row.status === status)?._count ?? 0;

  return (
    <>
      <PageHeader title="Payments" subtitle={`${activeLocation.name}: see who has paid, who still owes, and complete collections after payment is received.`} />
      <div className="content">
        <div className="grid cols-4">
          <div className="card metric"><span>To collect</span><strong>{mmk(totalFor("UNPAID") + totalFor("PARTIALLY_PAID"))}</strong></div>
          <div className="card metric"><span>Pending records</span><strong>{countFor("UNPAID") + countFor("PARTIALLY_PAID")}</strong></div>
          <div className="card metric"><span>Paid collected</span><strong>{mmk(totalFor("PAID"))}</strong></div>
          <div className="card metric"><span>Waived / void</span><strong>{countFor("WAIVED") + countFor("VOID")}</strong></div>
        </div>

        <section className="panel">
          <div className="section-head">
            <h2>Payments To Collect</h2>
            <form className="actions"><input name="q" placeholder="Search customer or receipt" defaultValue={params.q ?? ""} /><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option><option value="VOID">Void</option></select><button className="btn secondary">Filter</button></form>
          </div>
          <table>
            <thead><tr><th>Customer</th><th>For</th><th>Details</th><th>Amount</th><th>Status</th><th>Complete payment</th></tr></thead>
            <tbody>
              {pendingPayments.map((p) => (
                <tr key={p.id}>
                  <td>{p.customer?.fullName ?? "Walk-in"}<br /><span className="muted">{p.customer?.phone ?? "No phone"}</span></td>
                  <td>{labelPaymentFor(p)}</td>
                  <td>{paymentDetail(p)}<br /><span className="muted">Created {shortDate(p.paymentDate)}</span></td>
                  <td><strong>{mmk(p.amount)}</strong></td>
                  <td><span className="status warn">{p.status === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"}</span></td>
                  <td><CompletePaymentForm payment={p} /></td>
                </tr>
              ))}
              {unpaidBookingsWithoutPayment.map((booking) => (
                <tr key={booking.id}>
                  <td>{booking.customer.fullName}<br /><span className="muted">{booking.customer.phone}</span></td>
                  <td>Room booking</td>
                  <td>{booking.room.name}<br /><span className="muted">{shortDate(booking.startsAt)} · payment record missing</span></td>
                  <td><strong>{mmk(booking.finalPrice)}</strong></td>
                  <td><span className="status warn">{booking.paymentStatus === "PARTIALLY_PAID" ? "Partially paid" : "Unpaid"}</span></td>
                  <td><CompleteBookingPaymentForm booking={booking} /></td>
                </tr>
              ))}
              {!pendingPayments.length && !unpaidBookingsWithoutPayment.length && <tr><td colSpan={6} className="muted">No pending payments to collect.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Completed / Closed Payments</h2></div>
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>For</th><th>Amount</th><th>Status</th><th>Method</th><th>Received by</th><th>Adjust</th></tr></thead>
            <tbody>{completedPayments.map((p) => <tr key={p.id}><td>{shortDate(p.paymentDate)}</td><td>{p.customer?.fullName ?? "Walk-in"}<br /><span className="muted">{p.receiptNumber ?? "No reference"}</span></td><td>{labelPaymentFor(p)}<br /><span className="muted">{paymentDetail(p)}</span></td><td>{mmk(p.amount)}</td><td><span className={statusClass(p.status)}>{p.status}</span></td><td>{p.method}</td><td>{p.receivedBy?.name ?? "System"}</td><td>{canAdjust ? <AdjustmentForms payment={p} /> : <span className="muted">Super Admin only</span>}</td></tr>)}</tbody>
          </table>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Payment Adjustment History</h2></div>
          <table><thead><tr><th>Payment</th><th>Reason</th><th>Adjusted by</th><th>When</th></tr></thead><tbody>{payments.flatMap((p) => p.adjustments.map((a) => <tr key={a.id}><td>{p.paymentFor} · {mmk(p.amount)}</td><td>{a.reason}</td><td>{a.adjustedBy.name}</td><td>{format(a.adjustedAt, "MMM d, yyyy h:mm a")}</td></tr>))}</tbody></table>
        </section>
      </div>
    </>
  );
}

function CompletePaymentForm({ payment }: { payment: any }) {
  return (
    <form action={completePayment.bind(null, payment.id)} className="payment-complete-form">
      <select name="status" defaultValue="PAID">
        <option value="PAID">Fully paid</option>
        <option value="PARTIALLY_PAID">Partially paid</option>
      </select>
      <input name="amountPaid" type="number" min="0" placeholder="Deposit amount" defaultValue={payment.status === "PARTIALLY_PAID" ? payment.amount : ""} />
      <select name="method" defaultValue={payment.method}>
        <option value="CASH">Cash</option>
        <option value="KBZPAY">KBZPay</option>
        <option value="WAVEPAY">WavePay</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="CARD">Card</option>
        <option value="OTHER">Other</option>
      </select>
      <input name="receiptNumber" placeholder="Receipt/reference" defaultValue={payment.receiptNumber ?? ""} />
      <button className="btn">Update payment</button>
    </form>
  );
}

function CompleteBookingPaymentForm({ booking }: { booking: any }) {
  return (
    <form action={createPaymentForBooking.bind(null, booking.id)} className="payment-complete-form">
      <select name="status" defaultValue="PAID">
        <option value="PAID">Fully paid</option>
        <option value="PARTIALLY_PAID">Partially paid</option>
      </select>
      <input name="amountPaid" type="number" min="0" placeholder="Deposit amount" />
      <select name="method" defaultValue="CASH">
        <option value="CASH">Cash</option>
        <option value="KBZPAY">KBZPay</option>
        <option value="WAVEPAY">WavePay</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
        <option value="CARD">Card</option>
        <option value="OTHER">Other</option>
      </select>
      <input name="receiptNumber" placeholder="Receipt/reference" />
      <button className="btn">Record payment</button>
    </form>
  );
}

function AdjustmentForms({ payment }: { payment: any }) {
  return (
    <details>
      <summary className="btn secondary">Edit</summary>
      <form action={updatePayment.bind(null, payment.id)} className="form-grid" style={{ marginTop: 12, minWidth: 360 }}>
        <div className="field"><label>Amount</label><input name="amount" type="number" defaultValue={payment.amount} /></div>
        <div className="field"><label>Status</label><select name="status" defaultValue={payment.status}><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option><option value="VOID">Void</option></select></div>
        <div className="field"><label>Method</label><select name="method" defaultValue={payment.method}><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
        <div className="field"><label>Payment date</label><input name="paymentDate" type="datetime-local" defaultValue={dateTimeLocal(payment.paymentDate)} /></div>
        <div className="field"><label>Reference</label><input name="receiptNumber" defaultValue={payment.receiptNumber ?? ""} /></div>
        <div className="field full"><label>Adjustment reason</label><input name="reason" required /></div>
        <div className="actions"><button className="btn">Save adjustment</button><button className="btn danger" formAction={voidPayment.bind(null, payment.id)}>Void</button></div>
      </form>
    </details>
  );
}

function labelPaymentFor(payment: any) {
  if (payment.paymentFor === "PASS") return "Coworking pass";
  if (payment.paymentFor === "BOOKING") return "Room booking";
  if (payment.paymentFor === "COFFEE") return "Coffee / POS";
  if (payment.paymentFor === "UPGRADE") return "Coffee upgrade";
  return "Manual";
}

function paymentDetail(payment: any) {
  if (payment.membership) return payment.membership.passName;
  if (payment.booking) return `${payment.booking.room.name} · ${shortDate(payment.booking.startsAt)}`;
  if (payment.coffeeSale) return payment.coffeeSale.coffeeItem.name;
  return payment.receiptNumber ?? "No details";
}

function statusClass(status: string) {
  if (status === "PAID") return "status ok";
  if (status === "VOID") return "status bad";
  if (status === "UNPAID" || status === "PARTIALLY_PAID") return "status warn";
  return "status";
}

function paymentLocationWhere(locationId: string) {
  return {
    OR: [
      { customer: { locationId } },
      { membership: { customer: { locationId } } },
      { booking: { room: { locationId } } },
      { coffeeSale: { coffeeItem: { locationId } } },
      { receivedBy: { locationId } }
    ]
  };
}
