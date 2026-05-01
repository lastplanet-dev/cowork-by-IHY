import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { deleteCoffeeItem, recordCoffeeSale, upsertCoffeeItem } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk, shortDate } from "@/lib/format";

export default async function CoffeePage() {
  const [items, customers, sales] = await Promise.all([
    prisma.coffeeItem.findMany({ orderBy: { name: "asc" } }),
    prisma.customer.findMany({ orderBy: { fullName: "asc" } }),
    prisma.coffeeSale.findMany({ include: { customer: true, coffeeItem: true }, orderBy: { soldAt: "desc" }, take: 20 })
  ]);
  return (
    <>
      <PageHeader title="Coffee / POS" subtitle="Manage free entitlements, paid menu items, and milk-based upgrades." />
      <div className="content">
        <div className="grid cols-2">
          <section className="panel">
            <div className="section-head"><h2>Record Sale</h2></div>
            <form action={recordCoffeeSale} className="form-grid">
              <div className="field"><label>Item</label><select name="coffeeItemId">{items.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.name} · {mmk(i.price)}</option>)}</select></div>
              <div className="field"><label>Customer</label><select name="customerId"><option value="">Walk-in</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
              <div className="field"><label>Quantity</label><input name="quantity" type="number" min="1" defaultValue="1" /></div>
              <div className="field"><label>Discount type</label><select name="discountType" defaultValue=""><option value="">No discount</option><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option></select></div>
              <div className="field"><label>Discount value</label><input name="discountValue" type="number" min="0" defaultValue="0" /></div>
              <div className="field"><label>Payment method</label><select name="paymentMethod" defaultValue="CASH"><option value="CASH">Cash</option><option value="KBZPAY">KBZPay</option><option value="WAVEPAY">WavePay</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div>
              <div className="actions"><button className="btn">Record sale</button></div>
            </form>
          </section>
          <section className="panel">
            <div className="section-head"><h2>Add Menu Item</h2></div>
            <form action={upsertCoffeeItem} className="form-grid">
              <div className="field"><label>Name</label><input name="name" required /></div>
              <div className="field"><label>Price</label><input name="price" type="number" min="0" defaultValue="0" /></div>
              <div className="field"><label>Kind</label><select name="kind"><option value="FREE_ENTITLEMENT">Free entitlement</option><option value="UPGRADE">Upgrade</option><option value="PAID_ITEM">Paid item</option></select></div>
              <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked /></label>
              <div className="actions"><button className="btn">Save item</button></div>
            </form>
          </section>
        </div>
        <section className="panel">
          <div className="section-head"><h2>Coffee Menu</h2></div>
          <table><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.kind.replaceAll("_", " ")}</td><td>{mmk(item.price)}</td><td><span className={item.isActive ? "status ok" : "status"}>{item.isActive ? "Active" : "Inactive"}</span></td><td><DeleteButton label={item.name} action={deleteCoffeeItem.bind(null, item.id)} /></td></tr>)}</tbody></table>
        </section>
        <section className="panel">
          <div className="section-head"><h2>Recent Coffee Sales</h2></div>
          <table><thead><tr><th>Date</th><th>Customer</th><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td>{shortDate(sale.soldAt)}</td><td>{sale.customer?.fullName ?? "Walk-in"}</td><td>{sale.coffeeItem.name}</td><td>{sale.quantity}</td><td>{mmk(sale.finalAmount)}</td></tr>)}</tbody></table>
        </section>
      </div>
    </>
  );
}
