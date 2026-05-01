import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { deletePassType, upsertPassType } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";

export default async function PassesPage() {
  const passes = await prisma.passType.findMany({ orderBy: { price: "asc" } });
  return (
    <>
      <PageHeader title="Passes" subtitle="Customize coworking days, validity, meeting credits, and coffee entitlement." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Create Pass Type</h2></div>
          <PassForm />
        </section>
        <section className="panel">
          <div className="section-head"><h2>Pass Types</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Price</th><th>Days</th><th>Validity</th><th>Credits</th><th>Coffee</th><th>Status</th><th></th></tr></thead>
            <tbody>{passes.map((pass) => <tr key={pass.id}><td>{pass.name}</td><td>{mmk(pass.price)}</td><td>{pass.coworkingDays}</td><td>{pass.validityDays} days</td><td>{pass.meetingCreditHours} hr</td><td>{pass.freeCoffeePerCheckIn}/check-in</td><td><span className={pass.isActive ? "status ok" : "status"}>{pass.isActive ? "Active" : "Inactive"}</span></td><td><DeleteButton label={pass.name} action={deletePassType.bind(null, pass.id)} /></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function PassForm() {
  return (
    <form action={upsertPassType} className="form-grid">
      <div className="field"><label>Name</label><input name="name" required /></div>
      <div className="field"><label>Price</label><input name="price" type="number" min="0" required /></div>
      <div className="field"><label>Coworking days</label><input name="coworkingDays" type="number" min="0" required /></div>
      <div className="field"><label>Validity period (days)</label><input name="validityDays" type="number" min="1" defaultValue="30" required /></div>
      <div className="field"><label>Included meeting credit hours</label><input name="meetingCreditHours" type="number" min="0" step="0.5" defaultValue="0" required /></div>
      <div className="field"><label>Free coffee per check-in</label><input name="freeCoffeePerCheckIn" type="number" min="0" defaultValue="1" required /></div>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked /></label>
      <div className="actions"><button className="btn">Save pass</button></div>
    </form>
  );
}
