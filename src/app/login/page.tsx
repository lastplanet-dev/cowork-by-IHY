import { PageHeader } from "@/components/PageHeader";
import { loginStaff, requestPasswordReset } from "@/lib/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  const params = await searchParams;
  return (
    <>
      <PageHeader title="Login" subtitle="Staff access for Cowork by IHY operations." />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <div>
              <img src="/brand/impact-hub-yangon.png" alt="Impact Hub Yangon" className="login-logo" />
              <h2>Staff Login</h2>
              <p className="muted">Use the staff account created in Settings.</p>
            </div>
          </div>
          {params.error === "invalid" ? <p className="notice danger">Email or password is incorrect.</p> : null}
          <form action={loginStaff} className="form-grid">
            <div className="field"><label>Email</label><input name="email" type="email" defaultValue="owner@ihy.local" required /></div>
            <div className="field"><label>Password</label><input name="password" type="password" defaultValue="changeme" required /></div>
            <label className="field checkbox-field"><span>Remember me on this device</span><input name="rememberMe" type="checkbox" defaultChecked /></label>
            <div className="actions"><button className="btn">Login</button></div>
          </form>
        </section>

        <section className="panel">
          <div className="section-head"><h2>Password Reset Request</h2></div>
          {params.reset === "requested" ? <p className="notice ok">Reset request saved for Super Admin review.</p> : null}
          <form action={requestPasswordReset} className="form-grid">
            <div className="field"><label>Staff email</label><input name="email" type="email" required /></div>
            <div className="actions"><button className="btn secondary">Request reset</button></div>
          </form>
        </section>
      </div>
    </>
  );
}
