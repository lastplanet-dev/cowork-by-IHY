import { DeleteButton } from "@/components/DeleteButton";
import { CloseDetailsButton } from "@/components/CloseDetailsButton";
import { PageHeader } from "@/components/PageHeader";
import { deleteRoom, deleteRoomType, upsertRoom, upsertRoomType } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";
import { dayKeys, parseOperatingHours } from "@/lib/yangon-time";

export default async function RoomsPage() {
  const activeLocation = await getOperationalLocation();
  const [rooms, roomTypes] = await Promise.all([
    prisma.room.findMany({ where: { locationId: activeLocation.id }, orderBy: [{ roomType: "asc" }, { name: "asc" }] }),
    prisma.roomTypeSetting.findMany({ where: { locationId: activeLocation.id }, orderBy: { name: "asc" } })
  ]);
  return (
    <>
      <PageHeader title="Rooms" subtitle="Manage room rates, capacity, credits, minimum duration, and buffer time." />
      <div className="content">
        <div className="grid cols-2">
          <details className="panel add-panel"><summary className="section-head"><h2>Rooms</h2><span className="btn">Add room</span></summary><div className="floating-close"><CloseDetailsButton /></div><RoomForm locationId={activeLocation.id} roomTypes={roomTypes} /></details>
          <details className="panel add-panel"><summary className="section-head"><h2>Room Types</h2><span className="btn">Add room type</span></summary><div className="floating-close"><CloseDetailsButton /></div><RoomTypeForm /></details>
        </div>
        <section className="panel">
          <div className="section-head"><h2>Room Type Records</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Description</th><th>Status</th><th></th></tr></thead>
            <tbody>{roomTypes.map((type) => <tr key={type.id}><td>{type.name}</td><td>{type.description ?? "-"}</td><td><span className={type.isActive ? "status ok" : "status"}>{type.isActive ? "Active" : "Inactive"}</span></td><td><div className="actions"><details><summary className="btn secondary">Edit</summary><div className="edit-popover"><div className="floating-close"><CloseDetailsButton /></div><RoomTypeForm type={type} /></div></details><DeleteButton label={type.name} action={deleteRoomType.bind(null, type.id)} /></div></td></tr>)}</tbody>
          </table>
        </section>
        <section className="panel">
          <div className="section-head"><h2>Room Settings</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th>Hourly</th><th>Half/full day</th><th>Rules</th><th>Status</th><th></th></tr></thead>
            <tbody>{rooms.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.roomType.replaceAll("_", " ")}</td><td>{r.capacity}</td><td>{mmk(r.hourlyRate)}</td><td>{mmk(r.halfDayRate)} / {mmk(r.fullDayRate)}</td><td>{r.creditsCanBeUsed ? "Credits allowed" : "Cash/waive only"}<br /><span className="muted">{r.minBookingMinutes} min · {r.bufferMinutes} min buffer · {r.operatingHoursJson ? "Custom hours" : "Location hours"}</span></td><td><span className={r.isActive ? "status ok" : "status"}>{r.isActive ? "Active" : "Inactive"}</span></td><td><div className="actions"><details><summary className="btn secondary">Edit</summary><div className="edit-popover"><div className="floating-close"><CloseDetailsButton /></div><RoomForm room={r} locationId={activeLocation.id} roomTypes={roomTypes} /></div></details><DeleteButton label={r.name} action={deleteRoom.bind(null, r.id)} /></div></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function RoomForm({ room, locationId, roomTypes }: { room?: any; locationId?: string; roomTypes: any[] }) {
  return (
    <form action={upsertRoom} className="form-grid">
      {room ? <input type="hidden" name="id" value={room.id} /> : null}
      {locationId ? <input type="hidden" name="locationId" value={locationId} /> : null}
      <input type="hidden" name="redirectTo" value="/rooms" />
      <div className="field"><label>Room name</label><input name="name" defaultValue={room?.name ?? ""} required /></div>
      <div className="field"><label>Room type</label><select name="roomType" defaultValue={room?.roomType ?? roomTypes[0]?.name ?? ""} required>{roomTypes.filter((type) => type.isActive || type.name === room?.roomType).map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}</select></div>
      <div className="field"><label>Capacity</label><input name="capacity" type="number" min="1" defaultValue={room?.capacity ?? 4} /></div>
      <div className="field"><label>Hourly rate</label><input name="hourlyRate" type="number" min="0" defaultValue={room?.hourlyRate ?? 0} /></div>
      <div className="field"><label>Half-day rate</label><input name="halfDayRate" type="number" min="0" defaultValue={room?.halfDayRate ?? ""} /></div>
      <div className="field"><label>Full-day rate</label><input name="fullDayRate" type="number" min="0" defaultValue={room?.fullDayRate ?? ""} /></div>
      <div className="field"><label>Minimum minutes</label><input name="minBookingMinutes" type="number" min="15" defaultValue={room?.minBookingMinutes ?? 60} /></div>
      <div className="field"><label>Buffer minutes</label><input name="bufferMinutes" type="number" min="0" defaultValue={room?.bufferMinutes ?? 0} /></div>
      <label className="field full"><span>Use location operating hours</span><input name="inheritLocationHours" type="checkbox" defaultChecked={!room?.operatingHoursJson} /></label>
      <OperatingHoursFields prefix="roomHours" value={room?.operatingHoursJson} />
      <label className="field"><span>Credits can be used</span><input name="creditsCanBeUsed" type="checkbox" defaultChecked={room?.creditsCanBeUsed ?? false} /></label>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={room?.isActive ?? true} /></label>
      <div className="actions"><button className="btn">Save room</button></div>
    </form>
  );
}

function OperatingHoursFields({ prefix, value }: { prefix: string; value?: string | null }) {
  const hours = parseOperatingHours(value);
  return (
    <div className="field full">
      <label>Custom room operating hours</label>
      <div className="hours-grid">
        {dayKeys.map((day) => (
          <div className="hours-row" key={day}>
            <label><input name={`${prefix}_${day}_open`} type="checkbox" defaultChecked={hours[day].open} /> {day.toUpperCase()}</label>
            <input name={`${prefix}_${day}_start`} type="time" step="300" defaultValue={hours[day].start} />
            <input name={`${prefix}_${day}_end`} type="time" step="300" defaultValue={hours[day].end} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomTypeForm({ type }: { type?: any }) {
  return (
    <form action={upsertRoomType} className="form-grid">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <input type="hidden" name="redirectTo" value="/rooms" />
      <div className="field"><label>Room type name</label><input name="name" defaultValue={type?.name ?? ""} required /></div>
      <div className="field full"><label>Description</label><textarea name="description" defaultValue={type?.description ?? ""} /></div>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked={type?.isActive ?? true} /></label>
      <div className="actions"><button className="btn">Save room type</button></div>
    </form>
  );
}
