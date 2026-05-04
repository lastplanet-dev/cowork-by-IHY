import { Coffee, DoorOpen } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { checkInCustomer, checkOutCustomer, recordCoffeeSale } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk, shortDate, shortTime } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function CheckInPage() {
  const activeLocation = await getOperationalLocation();
  const [customers, coffeeItems, today, coffeeSales] = await Promise.all([
    prisma.customer.findMany({ where: { locationId: activeLocation.id }, orderBy: { fullName: "asc" } }),
    prisma.coffeeItem.findMany({ where: { locationId: activeLocation.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.checkIn.findMany({ where: { customer: { locationId: activeLocation.id } }, orderBy: { checkedInAt: "desc" }, take: 20, include: { customer: true, coffeeSales: { include: { coffeeItem: true } } } }),
    prisma.coffeeSale.findMany({ where: { coffeeItem: { locationId: activeLocation.id } }, include: { customer: true, coffeeItem: true }, orderBy: { soldAt: "desc" }, take: 10 })
  ]);
  const activeCustomers = customers.filter((c) => c.membershipExpiresAt && c.membershipExpiresAt >= new Date() && c.remainingCoworkingDays > 0);

  return (
    <>
      <PageHeader title="Check-in" subtitle="Deduct one coworking day, show WiFi, and handle free coffee or upgrades." />
      <div className="content">
        <details className="panel add-panel">
          <summary className="section-head"><h2>Check-ins</h2><span className="btn"><DoorOpen size={17} /> Check in customer</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <form action={checkInCustomer} className="form-grid">
            <div className="field full"><label>Customer with active pass</label><select name="customerId" required>{activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.fullName} · {c.activePassName} · {c.remainingCoworkingDays} days · {c.remainingMeetingCreditHours} credit hr</option>)}</select></div>
            <label className="field"><span>Milk-based upgrade</span><input name="upgradeCoffee" type="checkbox" /></label>
            <div className="field coffee-upgrade-method"><label>Payment method for upgrade</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
            <label className="field"><span>Admin duplicate override</span><input name="overrideDuplicate" type="checkbox" /></label>
            <div className="actions"><button className="btn"><DoorOpen size={17} /> Check in</button></div>
          </form>
        </details>

        <details className="panel add-panel">
          <summary className="section-head"><h2>Coffee Sale</h2><span className="btn">Record coffee sale</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <form action={recordCoffeeSale} className="form-grid">
            <div className="field"><label>Item</label><select name="coffeeItemId">{coffeeItems.map((i) => <option key={i.id} value={i.id}>{i.name} · {mmk(i.price)}</option>)}</select></div>
            <div className="field"><label>Customer</label><select name="customerId"><option value="">Walk-in</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
            <div className="field"><label>Quantity</label><input name="quantity" type="number" min="1" defaultValue="1" /></div>
            <div className="field"><label>Discount type</label><select name="discountType" defaultValue=""><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
            <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue="0" /></div>
            <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
            <div className="actions"><button className="btn">Record sale</button></div>
          </form>
        </details>

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
        <section className="panel">
          <div className="section-head"><h2>Recent Coffee Sales</h2></div>
          <table><thead><tr><th>Date</th><th>Customer</th><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{coffeeSales.map((sale) => <tr key={sale.id}><td>{shortDate(sale.soldAt)}</td><td>{sale.customer?.fullName ?? "Walk-in"}</td><td>{sale.coffeeItem.name}</td><td>{sale.quantity}</td><td>{mmk(sale.finalAmount)}</td></tr>)}</tbody></table>
        </section>
      </div>
    </>
  );
}
