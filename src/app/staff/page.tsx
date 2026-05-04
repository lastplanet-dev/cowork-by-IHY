import { PageHeader } from "@/components/PageHeader";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { DeleteButton } from "@/components/DeleteButton";
import { deleteStaff, upsertStaff } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff, getOperationalLocation, getSelectableLocations } from "@/lib/session";

export default async function StaffPage() {
  const [currentStaff, activeLocation, locations] = await Promise.all([getCurrentStaff(), getOperationalLocation(), getSelectableLocations()]);
  const staff = await prisma.staffUser.findMany({
    where: currentStaff.role === "SUPER_ADMIN" ? { OR: [{ locationId: activeLocation.id }, { role: "SUPER_ADMIN" }] } : { id: currentStaff.id },
    include: { location: true },
    orderBy: { name: "asc" }
  });
  return (
    <>
      <PageHeader title="Staff" subtitle="Role-based access for Super Admin and Community Host/Admin users." />
      <div className="content">
        {currentStaff.role === "SUPER_ADMIN" ? <details className="panel add-panel">
          <summary className="section-head"><h2>Staff Users</h2><span className="btn">Add staff</span></summary>
          <div className="floating-close"><CloseDetailsButton /></div>
          <StaffForm locationId={activeLocation.id} locations={locations} />
        </details> : null}
        <section className="panel">
          <div className="section-head"><h2>Staff Users</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Location</th><th>Role</th><th>Settings</th><th>Status</th><th></th></tr></thead>
            <tbody>{staff.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.location?.name ?? "All locations"}</td><td>{user.role === "SUPER_ADMIN" ? "Super Admin" : "Admin / Community Host"}</td><td>{user.canSettings ? "Allowed" : "Restricted"}</td><td><span className={user.isActive ? "status ok" : "status"}>{user.isActive ? "Active" : "Inactive"}</span></td><td>{currentStaff.role === "SUPER_ADMIN" ? <div className="actions"><details><summary className="btn secondary">Edit</summary><div className="edit-popover"><div className="floating-close"><CloseDetailsButton /></div><StaffForm user={user} locationId={user.locationId ?? activeLocation.id} locations={locations} /></div></details>{currentStaff.id !== user.id ? <DeleteButton label={user.name} action={deleteStaff.bind(null, user.id)} /> : null}</div> : <span className="muted">Profile only</span>}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function StaffForm({ user, locationId, locations }: { user?: any; locationId?: string; locations: any[] }) {
  return (
    <form action={upsertStaff} className="form-grid">
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <input type="hidden" name="redirectTo" value="/staff" />
      <div className="field"><label>Name</label><input name="name" defaultValue={user?.name ?? ""} required /></div>
      <div className="field"><label>Email</label><input name="email" type="email" defaultValue={user?.email ?? ""} required /></div>
      <div className="field"><label>Assigned location</label><select name="locationId" defaultValue={locationId ?? ""}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
      <div className="field"><label>Role</label><select name="role" defaultValue={user?.role ?? "ADMIN"}><option value="ADMIN">Admin / Community Host</option><option value="SUPER_ADMIN">Super Admin</option></select></div>
      <label className="field"><span>Can change settings</span><input name="canSettings" type="checkbox" defaultChecked={user?.canSettings ?? false} /></label>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={user?.isActive ?? true} /></label>
      <div className="actions"><button className="btn">Save staff</button></div>
    </form>
  );
}
