import { DeleteButton } from "@/components/DeleteButton";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { PageHeader } from "@/components/PageHeader";
import { deleteCoffeeItem, upsertCoffeeItem } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function CoffeePage() {
  const activeLocation = await getOperationalLocation();
  const items = await prisma.coffeeItem.findMany({ where: { locationId: activeLocation.id }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Coffee Menu" subtitle="Configure free entitlements, paid menu items, and milk-based upgrades." />
      <div className="content">
        <details className="panel add-panel">
          <summary className="section-head"><h2>Coffee Menu</h2><span className="btn">Add menu item</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <CoffeeItemForm locationId={activeLocation.id} />
        </details>
        <section className="panel">
          <div className="section-head"><h2>Coffee Menu</h2></div>
          <table><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.kind.replaceAll("_", " ")}</td><td>{mmk(item.price)}</td><td><span className={item.isActive ? "status ok" : "status"}>{item.isActive ? "Active" : "Inactive"}</span></td><td><div className="actions"><details><summary className="btn secondary">Edit</summary><div className="edit-popover"><div className="floating-close"><CloseDetailsButton /></div><CoffeeItemForm item={item} locationId={activeLocation.id} /></div></details><DeleteButton label={item.name} action={deleteCoffeeItem.bind(null, item.id)} /></div></td></tr>)}</tbody></table>
        </section>
      </div>
    </>
  );
}

function CoffeeItemForm({ item, locationId }: { item?: any; locationId?: string }) {
  return (
    <form action={upsertCoffeeItem} className="form-grid">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      {locationId ? <input type="hidden" name="locationId" value={locationId} /> : null}
      <input type="hidden" name="redirectTo" value="/coffee" />
      <div className="field"><label>Name</label><input name="name" defaultValue={item?.name ?? ""} required /></div>
      <div className="field"><label>Price</label><input name="price" type="number" min="0" defaultValue={item?.price ?? 0} /></div>
      <div className="field"><label>Kind</label><select name="kind" defaultValue={item?.kind ?? "PAID_ITEM"}><option value="FREE_ENTITLEMENT">Free entitlement</option><option value="UPGRADE">Upgrade</option><option value="PAID_ITEM">Paid item</option></select></div>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={item?.isActive ?? true} /></label>
      <div className="actions"><button className="btn">Save item</button></div>
    </form>
  );
}
