import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { DeleteButton } from "@/components/DeleteButton";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { createCustomer, deleteCustomer } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { shortDate } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const params = await searchParams;
  const activeLocation = await getOperationalLocation();
  const customers = await prisma.customer.findMany({
    where: {
      AND: [
        { locationId: activeLocation.id },
        params.q
          ? { OR: [{ customerCode: { contains: params.q } }, { fullName: { contains: params.q } }, { phone: { contains: params.q } }, { email: { contains: params.q } }, { organization: { contains: params.q } }] }
          : {},
        params.type ? { customerType: params.type as any } : {}
      ]
    },
    orderBy: { updatedAt: "desc" }
  });

  return (
    <>
      <PageHeader title="Customers" subtitle="Register, search, renew, and review coworking members." />
      <div className="content">
        <details className="panel add-panel">
          <summary className="section-head"><h2>Customers</h2><span className="btn"><Plus size={17} /> Add customer</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <form action={createCustomer} className="form-grid">
            <input type="hidden" name="locationId" value={activeLocation.id} />
            <div className="field"><label>Full name</label><input name="fullName" required /></div>
            <div className="field"><label>Phone number</label><input name="phone" required /></div>
            <div className="field"><label>Email</label><input name="email" type="email" /></div>
            <div className="field"><label>Organization/company</label><input name="organization" /></div>
            <div className="field"><label>Customer type</label><select name="customerType" defaultValue="INDIVIDUAL"><option value="INDIVIDUAL">Individual</option><option value="PARTNER_ORGANIZATION">Partner organization</option><option value="CORPORATE">Corporate</option><option value="WALK_IN">Walk-in</option></select></div>
            <div className="field full"><label>Notes</label><textarea name="notes" /></div>
            <div className="actions"><button className="btn"><Plus size={17} /> Register</button></div>
          </form>
        </details>

        <section className="panel">
          <div className="section-head">
            <h2>Customer Records</h2>
            <form className="actions">
              <input name="q" placeholder="Search ID, name, phone, email" defaultValue={params.q ?? ""} />
              <select name="type" defaultValue={params.type ?? ""}>
                <option value="">All types</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="PARTNER_ORGANIZATION">Partner org</option>
                <option value="CORPORATE">Corporate</option>
                <option value="WALK_IN">Walk-in</option>
              </select>
              <button className="btn secondary">Filter</button>
            </form>
          </div>
          <table>
            <thead><tr><th>Customer ID</th><th>Name</th><th>Type</th><th>Active pass</th><th>Days</th><th>Credits</th><th>Expiry</th><th></th></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.customerCode ?? "Pending"}</td>
                  <td><Link href={`/customers/${customer.id}`}><strong>{customer.fullName}</strong><br /><span className="muted">{customer.phone}</span></Link></td>
                  <td>{customer.customerType.replaceAll("_", " ")}</td>
                  <td>{customer.activePassName ?? "None"}</td>
                  <td>{customer.remainingCoworkingDays}</td>
                  <td>{customer.remainingMeetingCreditHours} hr</td>
                  <td>{shortDate(customer.membershipExpiresAt)}</td>
                  <td>
                    <div className="actions">
                      <Link className="btn secondary" href={`/customers/${customer.id}`}>Edit</Link>
                      <DeleteButton label={customer.fullName} action={deleteCustomer.bind(null, customer.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
