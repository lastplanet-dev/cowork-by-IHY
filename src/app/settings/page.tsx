import { PageHeader } from "@/components/PageHeader";
import { updateSetting } from "@/lib/actions";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  return (
    <>
      <PageHeader title="Settings" subtitle="System-wide defaults for WiFi, payment methods, discount reasons, and rules." />
      <div className="content">
        <section className="panel">
          <div className="section-head"><h2>Admin Settings</h2></div>
          <div className="grid cols-2">
            {settings.map((setting) => (
              <form action={updateSetting} className="card form-grid" key={setting.key}>
                <input type="hidden" name="key" value={setting.key} />
                <div className="field full"><label>{setting.key}</label><textarea name="value" defaultValue={setting.value} required /></div>
                <div className="actions"><button className="btn">Save</button></div>
              </form>
            ))}
            <form action={updateSetting} className="card form-grid">
              <div className="field"><label>New setting key</label><input name="key" required /></div>
              <div className="field full"><label>Value</label><textarea name="value" required /></div>
              <div className="actions"><button className="btn">Add setting</button></div>
            </form>
          </div>
        </section>
        <section className="panel">
          <div className="section-head"><h2>Configurable Modules</h2></div>
          <div className="grid cols-3">
            <a className="card" href="/passes"><strong>Membership/pass types</strong><p className="muted">Packages, price, validity, days, meeting credits.</p></a>
            <a className="card" href="/rooms"><strong>Room types and prices</strong><p className="muted">Rates, capacity, credit rules, buffers.</p></a>
            <a className="card" href="/coffee"><strong>Coffee menu</strong><p className="muted">Free entitlements, upgrades, paid POS items.</p></a>
            <a className="card" href="/staff"><strong>Staff users</strong><p className="muted">Roles, permissions, active status.</p></a>
            <a className="card" href="/payments"><strong>Payment methods</strong><p className="muted">Cash, KBZPay, WavePay, transfer, card, other.</p></a>
            <a className="card" href="/reports"><strong>Reports</strong><p className="muted">Sales, utilization, discounts, renewals.</p></a>
          </div>
        </section>
      </div>
    </>
  );
}
