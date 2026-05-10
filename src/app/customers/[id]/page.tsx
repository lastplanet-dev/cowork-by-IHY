import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { sellPass, updateCustomer } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk, shortDate, shortTime } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activeLocation = await getOperationalLocation();
  const [customer, passTypes] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        memberships: { orderBy: { createdAt: "desc" }, include: { payment: true } },
        payments: { orderBy: { paymentDate: "desc" }, take: 10 },
        bookings: { orderBy: { startsAt: "desc" }, include: { room: true }, take: 10 },
        checkIns: { orderBy: { checkedInAt: "desc" }, include: { coffeeSales: { include: { coffeeItem: true } } }, take: 10 },
        coffeeSales: { orderBy: { soldAt: "desc" }, include: { coffeeItem: true }, take: 10 }
      }
    }),
    prisma.passType.findMany({ where: { isActive: true, locationId: activeLocation.id }, orderBy: { price: "asc" } })
  ]);

  if (!customer || customer.locationId !== activeLocation.id) notFound();
  const isExpired = !customer.membershipExpiresAt || customer.membershipExpiresAt < new Date() || customer.remainingCoworkingDays <= 0;

  return (
    <>
      <PageHeader title={customer.fullName} subtitle={`${customer.phone}${customer.organization ? ` · ${customer.organization}` : ""}`} />
      <div className="content">
        <div className="grid cols-4">
          <div className="card metric"><span>Membership status</span><strong>{isExpired ? "Expired" : "Active"}</strong></div>
          <div className="card metric"><span>Customer ID</span><strong>{customer.customerCode ?? "Pending"}</strong></div>
          <div className="card metric"><span>Current package</span><strong>{customer.activePassName ?? "None"}</strong></div>
          <div className="card metric"><span>Coworking days</span><strong>{customer.remainingCoworkingDays}</strong></div>
          <div className="card metric"><span>Meeting credits</span><strong>{customer.remainingMeetingCreditHours} hr</strong></div>
          <div className="card metric"><span>Expiry</span><strong>{shortDate(customer.membershipExpiresAt)}</strong></div>
        </div>

        <div className="grid cols-2">
          <details className="panel add-panel">
            <summary className="section-head"><h2>Profile Details</h2><span className="btn secondary">Edit profile</span></summary>
            <div className="floating-close"><CloseDetailsButton /></div>
            <form action={updateCustomer.bind(null, customer.id)} className="form-grid">
              <div className="field"><label>Full name</label><input name="fullName" defaultValue={customer.fullName} required /></div>
              <div className="field"><label>Phone</label><input name="phone" defaultValue={customer.phone} required /></div>
              <div className="field"><label>Email</label><input name="email" type="email" defaultValue={customer.email ?? ""} /></div>
              <div className="field"><label>Organization</label><input name="organization" defaultValue={customer.organization ?? ""} /></div>
              <div className="field"><label>Customer type</label><select name="customerType" defaultValue={customer.customerType}><option value="INDIVIDUAL">Individual</option><option value="PARTNER_ORGANIZATION">Partner organization</option><option value="CORPORATE">Corporate</option><option value="WALK_IN">Walk-in</option></select></div>
              <div className="field full"><label>Notes</label><textarea name="notes" defaultValue={customer.notes ?? ""} /></div>
              <div className="actions"><button className="btn">Save profile</button></div>
            </form>
          </details>

          <details className="panel add-panel">
            <summary className="section-head">
              <div>
                <h2>Renew Membership</h2>
                <p className="muted">Expired passes start fresh. Active passes extend and add to the current balance.</p>
              </div>
              <span className="btn">Renew membership</span>
            </summary>
            <div className="floating-close"><CloseDetailsButton /></div>
            <form action={sellPass.bind(null, customer.id)} className="form-grid">
              <div className="field full"><label>Package</label><select name="passTypeId" required>{passTypes.map((pass) => <option key={pass.id} value={pass.id}>{pass.name} · {mmk(pass.price)} · {pass.coworkingDays} days · {pass.meetingCreditHours} credit hr</option>)}</select></div>
              <div className="field"><label>Discount type</label><select name="discountType" defaultValue=""><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
              <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue="0" /></div>
              <div className="field"><label>Reason</label><input name="discountReason" placeholder="promotion, partner discount" /></div>
              <div className="field"><label>Approved by</label><input name="discountApprovedBy" /></div>
              <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
              <div className="field"><label>Payment status</label><select name="paymentStatus" defaultValue="PAID"><option value="PAID">Paid</option><option value="UNPAID">Unpaid</option><option value="PARTIALLY_PAID">Partially paid</option><option value="WAIVED">Waived</option></select></div>
              <div className="field"><label>Paid deposit amount</label><input name="amountPaid" type="number" min="0" placeholder="Required for partially paid" /></div>
              <div className="field full"><label>Receipt/reference</label><input name="receiptNumber" /></div>
              <div className="actions"><button className="btn">Confirm renewal</button></div>
            </form>
          </details>
        </div>

        <div className="grid cols-2">
          <History title="Renewal History" rows={customer.memberships.map((m) => [m.passName, `${m.coworkingDaysAdded} days / ${m.meetingCreditHoursAdded} hr`, mmk(m.finalPrice), shortDate(m.expiresAt)])} />
          <History title="Payment History" rows={customer.payments.map((p) => [p.paymentFor, p.status, mmk(p.amount), shortDate(p.paymentDate)])} />
          <History title="Booking History" rows={customer.bookings.map((b) => [b.room.name, `${shortDate(b.startsAt)} ${shortTime(b.startsAt)}`, b.status, mmk(b.finalPrice)])} />
          <History title="Check-in History" rows={customer.checkIns.map((c) => [shortDate(c.checkedInAt), shortTime(c.checkedInAt), c.freeCoffeeEntitled ? "Free coffee" : "No coffee", c.coffeeSales.map((s) => s.coffeeItem.name).join(", ")])} />
          <History title="Coffee / Upgrade History" rows={customer.coffeeSales.map((s) => [s.coffeeItem.name, String(s.quantity), mmk(s.finalAmount), shortDate(s.soldAt)])} />
        </div>
      </div>
    </>
  );
}

function History({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="panel">
      <div className="section-head"><h2>{title}</h2></div>
      <table>
        <tbody>
          {rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
          {!rows.length && <tr><td className="muted">No records yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
