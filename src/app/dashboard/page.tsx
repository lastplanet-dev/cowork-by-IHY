import { endOfDay, startOfDay, addDays } from "date-fns";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { setActiveLocation } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { mmk, shortDate, shortTime } from "@/lib/format";
import { getCurrentStaff, getOperationalLocation, getSelectableLocations } from "@/lib/session";

export default async function DashboardPage() {
  const [staff, activeLocation, locations] = await Promise.all([getCurrentStaff(), getOperationalLocation(), getSelectableLocations()]);
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const soon = addDays(new Date(), 7);
  const locationPaymentWhere = paymentLocationWhere(activeLocation.id);

  const [todayCheckIns, inside, bookings, expiring, payments, sales, activities, creditMembers] = await Promise.all([
    prisma.checkIn.count({ where: { checkedInAt: { gte: todayStart, lte: todayEnd }, customer: { locationId: activeLocation.id } } }),
    prisma.customer.findMany({ where: { isInside: true, locationId: activeLocation.id }, orderBy: { fullName: "asc" } }),
    prisma.booking.findMany({
      where: { startsAt: { gte: todayStart, lte: todayEnd }, status: { in: ["PENDING", "CONFIRMED"] }, room: { locationId: activeLocation.id } },
      include: { customer: true, room: true },
      orderBy: { startsAt: "asc" },
      take: 8
    }),
    prisma.customer.findMany({
      where: { locationId: activeLocation.id, OR: [{ membershipExpiresAt: { lt: new Date() } }, { membershipExpiresAt: { gte: new Date(), lte: soon } }, { remainingCoworkingDays: { lte: 1 } }] },
      orderBy: { membershipExpiresAt: "asc" },
      take: 8
    }),
    prisma.payment.findMany({ where: { AND: [{ status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, include: { customer: true, booking: { include: { room: true } }, coffeeSale: { include: { coffeeItem: true } }, membership: true }, orderBy: { paymentDate: "desc" }, take: 8 }),
    prisma.payment.groupBy({
      by: ["paymentFor"],
      where: { AND: [{ paymentDate: { gte: todayStart, lte: todayEnd }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] },
      _sum: { amount: true }
    }),
    prisma.activityLog.findMany({ where: { OR: [{ staff: { locationId: activeLocation.id } }, { staff: { role: "SUPER_ADMIN" } }, { staffId: null }] }, orderBy: { createdAt: "desc" }, take: 8, include: { staff: true } }),
    prisma.customer.findMany({ where: { locationId: activeLocation.id, remainingMeetingCreditHours: { gt: 0 } }, orderBy: { remainingMeetingCreditHours: "desc" }, take: 6 })
  ]);

  const salesTotal = sales.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${activeLocation.name}: today’s check-ins, bookings, renewals, payments, and sales at a glance.`}
        action={
          <div className="actions">
            {staff.role === "SUPER_ADMIN" ? (
              <form action={setActiveLocation} className="location-switch">
                <input type="hidden" name="redirectTo" value="/dashboard" />
                <select name="locationId" defaultValue={activeLocation.id} aria-label="Switch location">
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                <button className="btn secondary">Switch</button>
              </form>
            ) : <span className="status">{activeLocation.name}</span>}
            <Link className="btn" href="/check-in">Check in</Link>
            <Link className="btn secondary" href="/bookings">New booking</Link>
          </div>
        }
      />
      <div className="content">
        <div className="grid cols-4">
          <div className="card metric"><span>Today’s check-ins</span><strong>{todayCheckIns}</strong></div>
          <div className="card metric"><span>Currently inside</span><strong>{inside.length}</strong></div>
          <div className="card metric"><span>Upcoming bookings</span><strong>{bookings.length}</strong></div>
          <div className="card metric"><span>Daily sales</span><strong>{mmk(salesTotal)}</strong></div>
        </div>

        <div className="grid cols-2">
          <section className="panel">
            <div className="section-head"><h2>Today’s Room Bookings</h2><Link className="btn secondary" href="/calendar">Calendar</Link></div>
            <table>
              <thead><tr><th>Time</th><th>Room</th><th>Customer</th><th>Status</th></tr></thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{shortTime(booking.startsAt)}-{shortTime(booking.endsAt)}</td>
                    <td>{booking.room.name}</td>
                    <td>{booking.customer.fullName}</td>
                    <td><span className="status ok">{booking.status}</span></td>
                  </tr>
                ))}
                {!bookings.length && <tr><td colSpan={4} className="muted">No bookings today.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="section-head"><h2>Renewal Follow-up</h2><Link className="btn secondary" href="/customers">Customers</Link></div>
            <table>
              <thead><tr><th>Customer</th><th>Pass</th><th>Days</th><th>Expiry</th></tr></thead>
              <tbody>
                {expiring.map((customer) => (
                  <tr key={customer.id}>
                    <td><Link href={`/customers/${customer.id}`}>{customer.fullName}</Link></td>
                    <td>{customer.activePassName ?? "None"}</td>
                    <td>{customer.remainingCoworkingDays}</td>
                    <td><span className={customer.membershipExpiresAt && customer.membershipExpiresAt < new Date() ? "status bad" : "status warn"}>{shortDate(customer.membershipExpiresAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="grid cols-3">
          <section className="panel">
            <div className="section-head"><h3>Active Users Inside</h3></div>
            <div className="activity">
              {inside.map((customer) => <div key={customer.id}><strong>{customer.fullName}</strong><br /><span className="muted">{customer.remainingCoworkingDays} days left</span></div>)}
              {!inside.length && <p className="muted">No active users inside.</p>}
            </div>
          </section>

          <section className="panel">
            <div className="section-head"><h3>Meeting Credits</h3></div>
            <table>
              <tbody>
                {creditMembers.map((customer) => (
                  <tr key={customer.id}><td>{customer.fullName}</td><td>{customer.remainingMeetingCreditHours} hr</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="section-head"><h3>Pending Payments</h3></div>
            <table>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}><td>{payment.customer?.fullName ?? "Walk-in"}</td><td>{payment.paymentFor}</td><td>{mmk(payment.amount)}</td></tr>
                ))}
                {!payments.length && <tr><td className="muted">No pending payments.</td></tr>}
              </tbody>
            </table>
          </section>
        </div>

        <div className="grid cols-2">
          <section className="panel">
            <div className="section-head"><h2>Daily Sales Summary</h2></div>
            <table>
              <tbody>
                {sales.map((row) => <tr key={row.paymentFor}><td>{row.paymentFor}</td><td>{mmk(row._sum.amount)}</td></tr>)}
                {!sales.length && <tr><td className="muted">No paid sales recorded today.</td></tr>}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="section-head"><h2>Recent Activity</h2></div>
            <div className="activity">
              {activities.map((item) => (
                <div key={item.id}><strong>{item.message}</strong><br /><span className="muted">{item.staff?.name ?? "System"} · {shortDate(item.createdAt)} {shortTime(item.createdAt)}</span></div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function paymentLocationWhere(locationId: string) {
  return {
    OR: [
      { customer: { locationId } },
      { membership: { customer: { locationId } } },
      { booking: { room: { locationId } } },
      { coffeeSale: { coffeeItem: { locationId } } },
      { receivedBy: { locationId } }
    ]
  };
}
