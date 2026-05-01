import { PageHeader } from "@/components/PageHeader";
import { upsertStaff } from "@/lib/actions";
import { prisma } from "@/lib/prisma";

export default async function StaffPage() {
  const staff = await prisma.staffUser.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Staff" subtitle="Role-based access for Super Admin and Community Host/Admin users." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Add Staff Account</h2></div>
          <StaffForm />
        </section>
        <section className="panel">
          <div className="section-head"><h2>Staff Users</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Settings</th><th>Status</th></tr></thead>
            <tbody>{staff.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin / Community Host"}</td><td>{user.canSettings ? "Allowed" : "Restricted"}</td><td><span className={user.isActive ? "status ok" : "status"}>{user.isActive ? "Active" : "Inactive"}</span></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function StaffForm() {
  return (
    <form action={upsertStaff} className="form-grid">
      <div className="field"><label>Name</label><input name="name" required /></div>
      <div className="field"><label>Email</label><input name="email" type="email" required /></div>
      <div className="field"><label>Role</label><select name="role" defaultValue="ADMIN"><option value="ADMIN">Admin / Community Host</option><option value="SUPER_ADMIN">Super Admin</option></select></div>
      <label className="field"><span>Can change settings</span><input name="canSettings" type="checkbox" /></label>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked /></label>
      <div className="actions"><button className="btn">Save staff</button></div>
    </form>
  );
}
