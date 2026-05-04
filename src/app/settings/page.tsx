import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { deleteLocation, setActiveLocation, updateSetting, upsertLocation } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { getCurrentStaff, getOperationalLocation, getSelectableLocations } from "@/lib/session";

export default async function SettingsPage() {
  const [settings, locations, activeLocation, staff] = await Promise.all([
    prisma.setting.findMany({ orderBy: { key: "asc" } }),
    getSelectableLocations(),
    getOperationalLocation(),
    getCurrentStaff()
  ]);
  const settingMap = new Map(settings.map((setting) => [setting.key, setting.value]));
  const visibleSettings = [
    { key: "wifiPassword", label: "WiFi password", help: "This is shown to the host after a customer checks in.", type: "input" },
    { key: "paymentMethods", label: "Payment methods", help: "Comma-separated methods shown in payment workflows.", type: "textarea" },
    { key: "discountReasons", label: "Discount reasons", help: "Common reasons staff can choose when applying discounts.", type: "textarea" }
  ];
  const isSuperAdmin = staff.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader title="Settings" subtitle="Configure locations, rooms, packages, coffee menu, users, and system-wide defaults." />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Locations</h2>
              <p className="muted">{isSuperAdmin ? "Choose the coworking space you want to manage or configure." : "Your staff account is assigned to this coworking space."}</p>
            </div>
            {isSuperAdmin ? (
              <form action={setActiveLocation} className="actions">
                <input type="hidden" name="redirectTo" value="/settings" />
                <select name="locationId" defaultValue={activeLocation.id}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                <button className="btn">Switch location</button>
              </form>
            ) : <span className="status">{activeLocation.name}</span>}
          </div>
          {isSuperAdmin ? <div className="grid cols-2">
            {locations.map((location) => (
              <div className="card metric" key={location.id}>
                <span>{location.isActive ? "Active location" : "Inactive location"}</span>
                <strong>{location.name}</strong>
                <p className="muted">{location.address ?? "No address saved."}</p>
                <p className="muted">{location.phone ?? "No phone saved."}</p>
                <div className="actions">
                  <details>
                    <summary className="btn secondary">Edit</summary>
                    <form action={upsertLocation} className="edit-popover form-grid">
                      <div className="floating-close"><CloseDetailsButton /></div>
                      <input type="hidden" name="id" value={location.id} />
                      <input type="hidden" name="redirectTo" value="/settings" />
                      <div className="field"><label>Name</label><input name="name" defaultValue={location.name} required /></div>
                      <div className="field"><label>Phone</label><input name="phone" defaultValue={location.phone ?? ""} /></div>
                      <div className="field full"><label>Address</label><input name="address" defaultValue={location.address ?? ""} /></div>
                      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={location.isActive} /></label>
                      <div className="actions"><button className="btn">Save location</button></div>
                    </form>
                  </details>
                  {locations.length > 1 ? <DeleteButton label={location.name} action={deleteLocation.bind(null, location.id)} /> : null}
                </div>
              </div>
            ))}
            <details className="card add-panel">
              <summary className="section-head"><h2>New location</h2><span className="btn">Add location</span></summary>
              <div className="floating-close"><CloseDetailsButton /></div>
              <form action={upsertLocation} className="form-grid">
                <input type="hidden" name="redirectTo" value="/settings" />
                <div className="field"><label>New location name</label><input name="name" required /></div>
                <div className="field"><label>Phone</label><input name="phone" /></div>
                <div className="field full"><label>Address</label><input name="address" /></div>
                <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked /></label>
                <div className="actions"><button className="btn">Save location</button></div>
              </form>
            </details>
          </div> : (
            <div className="card metric">
              <span>Current location</span>
              <strong>{activeLocation.name}</strong>
              <p className="muted">{activeLocation.address ?? "No address saved yet."}</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-head"><h2>Configurable Modules</h2><span className="status ok">{activeLocation.name}</span></div>
          <div className="grid cols-3">
            <a className="card module-card" href="/passes"><strong>Membership/pass types</strong><p className="muted">Add or edit coworking packages, prices, validity, day balance, meeting credits, and coffee entitlement.</p><span>Configure passes</span></a>
            <a className="card module-card" href="/rooms"><strong>Rooms and prices</strong><p className="muted">Add or edit meeting rooms, training rooms, phone booths, rates, capacities, credit rules, and booking buffers.</p><span>Configure rooms</span></a>
            <a className="card module-card" href="/coffee"><strong>Coffee menu</strong><p className="muted">Add or edit free coffee, upgrade options, paid coffee items, and POS prices.</p><span>Configure coffee</span></a>
            {isSuperAdmin ? <a className="card module-card" href="/staff"><strong>Staff users</strong><p className="muted">Add or edit staff accounts, roles, assigned locations, permissions, and active status.</p><span>Manage staff</span></a> : null}
            <a className="card module-card" href="/payments"><strong>Payment collection</strong><p className="muted">Review unpaid records, complete collections, and confirm who still needs follow-up.</p><span>Review payments</span></a>
            <a className="card module-card" href="/reports"><strong>Reports</strong><p className="muted">View sales, room utilization, discounts, renewal follow-up, customer visits, and meeting credit usage.</p><span>View reports</span></a>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Workspace Defaults</h2>
              <p className="muted">Simple defaults used by the host during daily operations.</p>
            </div>
          </div>
          <div className="grid cols-2">
            {visibleSettings.map((setting) => (
              <form action={updateSetting} className="card form-grid" key={setting.key}>
                <input type="hidden" name="key" value={setting.key} />
                <div className="field full">
                  <label>{setting.label}</label>
                  {setting.type === "input" ? <input name="value" defaultValue={String(settingMap.get(setting.key) ?? "")} required /> : <textarea name="value" defaultValue={String(settingMap.get(setting.key) ?? "")} required />}
                  <span className="muted">{setting.help}</span>
                </div>
                <div className="actions"><button className="btn">Save</button></div>
              </form>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
