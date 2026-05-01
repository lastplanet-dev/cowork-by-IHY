import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { updatePayment, voidPayment } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { dateTimeLocal, mmk, shortDate } from "@/lib/format";
import { getCurrentStaff } from "@/lib/session";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const params = await searchParams;
  const staff = await getCurrentStaff();
  const payments = await prisma.payment.findMany({
    where: {
      AND: [
        params.status ? { status: params.status as any } : {},
        params.q ? { OR: [{ receiptNumber: { contains: params.q } }, { customer: { fullName: { contains: params.q } } }] } : {}
      ]
    },
    include: { customer: true, receivedBy: true, adjustments: { include: { adjustedBy: true }, orderBy: { adjustedAt: "desc" } } },
    orderBy: { paymentDate: "desc" },
    take: 100
  });
  const canAdjust = staff.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader title="Payments" subtitle="Track pass, booking, coffee, and upgrade payments with adjustment history." />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <h2>Payment Records</h2>
            <form className="actions"><input name="q" placeholder="Search customer or receipt" defaultValue={params.q ?? ""} /><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option><option value="VOID">Void</option></select><button className="btn secondary">Filter</button></form>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>For</th><th>Amount</th><th>Status</th><th>Method</th><th>Received by</th><th>Adjust</th></tr></thead>
            <tbody>{payments.map((p) => <tr key={p.id}><td>{shortDate(p.paymentDate)}</td><td>{p.customer?.fullName ?? "Walk-in"}<br /><span className="muted">{p.receiptNumber ?? "No reference"}</span></td><td>{p.paymentFor}</td><td>{mmk(p.amount)}</td><td><span className={p.status === "VOID" ? "status bad" : "status ok"}>{p.status}</span></td><td>{p.method}</td><td>{p.receivedBy?.name ?? "System"}</td><td>{canAdjust ? <AdjustmentForms payment={p} /> : <span className="muted">Super Admin only</span>}</td></tr>)}</tbody>
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
