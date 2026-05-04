import { PageHeader } from "@/components/PageHeader";
import { logoutStaff, updateOwnPassword } from "@/lib/actions";
import { getOperationalLocation, getCurrentStaff } from "@/lib/session";

export default async function ProfilePage() {
  const [staff, location] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  return (
    <>
      <PageHeader title="Profile" subtitle="Manage your staff profile and password." />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <h2>User Profile</h2>
            <form action={logoutStaff}><button className="btn secondary">Logout</button></form>
          </div>
          <div className="grid cols-4">
            <div className="card metric"><span>Name</span><strong>{staff.name}</strong></div>
            <div className="card metric"><span>Email</span><strong>{staff.email}</strong></div>
            <div className="card metric"><span>Role</span><strong>{staff.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</strong></div>
            <div className="card metric"><span>Location</span><strong>{location.name}</strong></div>
          </div>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Change Password</h2></div>
          <form action={updateOwnPassword} className="form-grid">
            <div className="field"><label>New password</label><input name="newPassword" type="password" minLength={8} required /></div>
            <div className="field"><label>Confirm password</label><input name="confirmPassword" type="password" minLength={8} required /></div>
            <div className="actions"><button className="btn">Update password</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
