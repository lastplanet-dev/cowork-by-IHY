import { DeleteButton } from "@/components/DeleteButton";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { PageHeader } from "@/components/PageHeader";
import { deletePassType, upsertPassType } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function PassesPage() {
  const activeLocation = await getOperationalLocation();
  const passes = await prisma.passType.findMany({ where: { locationId: activeLocation.id }, orderBy: { price: "asc" } });
  return (
    <>
      <PageHeader title="Passes" subtitle="Customize coworking days, validity, meeting credits, and coffee entitlement." />
      <div className="content">
        <details className="panel add-panel">
          <summary className="section-head"><h2>Pass Types</h2><span className="btn">Add pass type</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <PassForm locationId={activeLocation.id} />
        </details>
        <section className="panel">
          <div className="section-head"><h2>Pass Types</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Days</th><th>Validity</th><th>Credits</th><th>Coffee</th><th>Status</th><th></th></tr></thead>
            <tbody>{passes.map((pass) => <tr key={pass.id}><td>{pass.name}</td><td>{mmk(pass.price)}</td><td>{pass.coworkingDays}</td><td>{pass.validityDays} days</td><td>{pass.meetingCreditHours} hr</td><td>{pass.freeCoffeePerCheckIn}/check-in</td><td><span className={pass.isActive ? "status ok" : "status"}>{pass.isActive ? "Active" : "Inactive"}</span></td><td><div className="actions"><details><summary className="btn secondary">Edit</summary><div className="edit-popover"><div className="floating-close"><CloseDetailsButton /></div><PassForm pass={pass} locationId={activeLocation.id} /></div></details><DeleteButton label={pass.name} action={deletePassType.bind(null, pass.id)} /></div></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function PassForm({ pass, locationId }: { pass?: any; locationId?: string }) {
  return (
    <form action={upsertPassType} className="form-grid">
      {pass ? <input type="hidden" name="id" value={pass.id} /> : null}
      {locationId ? <input type="hidden" name="locationId" value={locationId} /> : null}
      <input type="hidden" name="redirectTo" value="/passes" />
      <div className="field"><label>Name</label><input name="name" defaultValue={pass?.name ?? ""} required /></div>
      <div className="field"><label>Price</label><input name="price" type="number" min="0" defaultValue={pass?.price ?? ""} required /></div>
      <div className="field"><label>Coworking days</label><input name="coworkingDays" type="number" min="0" defaultValue={pass?.coworkingDays ?? ""} required /></div>
      <div className="field"><label>Validity period (days)</label><input name="validityDays" type="number" min="1" defaultValue={pass?.validityDays ?? 30} required /></div>
      <div className="field"><label>Included meeting credit hours</label><input name="meetingCreditHours" type="number" min="0" step="0.5" defaultValue={pass?.meetingCreditHours ?? 0} required /></div>
      <div className="field"><label>Free coffee per check-in</label><input name="freeCoffeePerCheckIn" type="number" min="0" defaultValue={pass?.freeCoffeePerCheckIn ?? 1} required /></div>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={pass?.isActive ?? true} /></label>
      <div className="actions"><button className="btn">Save pass</button></div>
    </form>
  );
}
