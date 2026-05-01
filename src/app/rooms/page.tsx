import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { deleteRoom, upsertRoom } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";

export default async function RoomsPage() {
  const rooms = await prisma.room.findMany({ orderBy: [{ roomType: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader title="Rooms" subtitle="Manage room rates, capacity, credits, minimum duration, and buffer time." />
      <div className="content">
        <section className="panel"><div className="section-head"><h2>Add Room</h2></div><RoomForm /></section>
        <section className="panel">
          <div className="section-head"><h2>Room Settings</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th>Hourly</th><th>Half/full day</th><th>Rules</th><th>Status</th><th></th></tr></thead>
            <tbody>{rooms.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.roomType.replaceAll("_", " ")}</td><td>{r.capacity}</td><td>{mmk(r.hourlyRate)}</td><td>{mmk(r.halfDayRate)} / {mmk(r.fullDayRate)}</td><td>{r.creditsCanBeUsed ? "Credits allowed" : "Cash/waive only"}<br /><span className="muted">{r.minBookingMinutes} min · {r.bufferMinutes} min buffer</span></td><td><span className={r.isActive ? "status ok" : "status"}>{r.isActive ? "Active" : "Inactive"}</span></td><td><DeleteButton label={r.name} action={deleteRoom.bind(null, r.id)} /></td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function RoomForm() {
  return (
    <form action={upsertRoom} className="form-grid">
      <div className="field"><label>Room name</label><input name="name" required /></div>
      <div className="field"><label>Room type</label><select name="roomType" defaultValue="MEETING_ROOM"><option value="MEETING_ROOM">Meeting Room</option><option value="TRAINING_ROOM">Training Room</option><option value="FOCUS_ROOM">Focus Room</option><option value="PHONE_BOOTH">Phone Booth</option></select></div>
      <div className="field"><label>Capacity</label><input name="capacity" type="number" min="1" defaultValue="4" /></div>
      <div className="field"><label>Hourly rate</label><input name="hourlyRate" type="number" min="0" defaultValue="0" /></div>
      <div className="field"><label>Half-day rate</label><input name="halfDayRate" type="number" min="0" /></div>
      <div className="field"><label>Full-day rate</label><input name="fullDayRate" type="number" min="0" /></div>
      <div className="field"><label>Minimum minutes</label><input name="minBookingMinutes" type="number" min="15" defaultValue="60" /></div>
      <div className="field"><label>Buffer minutes</label><input name="bufferMinutes" type="number" min="0" defaultValue="0" /></div>
      <label className="field"><span>Credits can be used</span><input name="creditsCanBeUsed" type="checkbox" /></label>
      <label className="field"><span>Active</span><input name="isActive" type="checkbox" defaultChecked /></label>
      <div className="actions"><button className="btn">Save room</button></div>
    </form>
  );
}
