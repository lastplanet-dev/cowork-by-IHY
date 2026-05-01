import { Coffee, DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { checkInCustomer, checkOutCustomer } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { shortDate, shortTime } from "@/lib/format";

export default async function CheckInPage() {
  const [customers, today] = await Promise.all([
    prisma.customer.findMany({ orderBy: { fullName: "asc" } }),
    prisma.checkIn.findMany({ orderBy: { checkedInAt: "desc" }, take: 20, include: { customer: true, coffeeSales: { include: { coffeeItem: true } } } })
  ]);
  const activeCustomers = customers.filter((c) => c.membershipExpiresAt && c.membershipExpiresAt >= new Date() && c.remainingCoworkingDays > 0);

  return (
    <>
      <PageHeader title="Check-in" subtitle="Deduct one coworking day, show WiFi, and handle free coffee or upgrades." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Check in Customer</h2></div>
          <form action={checkInCustomer} className="form-grid">
            <div className="field full"><label>Customer with active pass</label><select name="customerId" required>{activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.activePassName} · {c.remainingCoworkingDays} days · {c.remainingMeetingCreditHours} credit hr</option>)}</select></div>
            <div className="field"><label>Payment method for coffee upgrade</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
            <label className="field"><span>Milk-based upgrade</span><input name="upgradeCoffee" type="checkbox" /></label>
            <label className="field"><span>Admin duplicate override</span><input name="overrideDuplicate" type="checkbox" /></label>
            <div className="actions"><button className="btn"><DoorOpen size={17} /> Check in and show coffee</button></div>
          </form>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Recent Check-ins</h2></div>
          <table>
            <thead><tr><th>Customer</th><th>Time</th><th>WiFi</th><th>Coffee</th><th></th></tr></thead>
            <tbody>
              {today.map((item) => (
                <tr key={item.id}>
                  <td>{item.customer.fullName}<br /><span className="muted">{shortDate(item.checkedInAt)}</span></td>
                  <td>{shortTime(item.checkedInAt)}</td>
                  <td>{item.wifiPasswordShown}</td>
                  <td>{item.coffeeSales.map((s) => s.coffeeItem.name).join(", ") || "Free coffee shown"} <Coffee size={14} /></td>
                  <td>{item.customer.isInside ? <form action={checkOutCustomer.bind(null, item.customerId)}><button className="btn secondary">Check out</button></form> : <span className="status">Out</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
