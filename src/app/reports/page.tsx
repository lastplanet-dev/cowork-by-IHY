import { endOfDay, format, parseISO, startOfMonth } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const params = await searchParams;
  const activeLocation = await getOperationalLocation();
  const periodStart = params.start ? parseISO(params.start) : startOfMonth(new Date());
  const periodEnd = params.end ? endOfDay(parseISO(params.end)) : endOfDay(new Date());
  const locationPaymentWhere = paymentLocationWhere(activeLocation.id);
  const periodPaymentWhere = { AND: [{ paymentDate: { gte: periodStart, lte: periodEnd }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] };
  const [periodSales, passSales, roomRevenue, coffeeRevenue, discounts, expired, coworkingUsage, roomUsage, coffeeSales, creditUse] = await Promise.all([
    prisma.payment.aggregate({ where: periodPaymentWhere, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: "PASS" }, periodPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: "BOOKING" }, periodPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: { in: ["COFFEE", "UPGRADE"] } }, periodPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.membershipPurchase.findMany({ where: { discountValue: { gt: 0 }, createdAt: { gte: periodStart, lte: periodEnd }, customer: { locationId: activeLocation.id } }, take: 20, include: { customer: true } }),
    prisma.customer.findMany({ where: { locationId: activeLocation.id, membershipExpiresAt: { lt: new Date() } }, take: 20 }),
    prisma.checkIn.groupBy({ by: ["customerId"], where: { checkedInAt: { gte: periodStart, lte: periodEnd }, customer: { locationId: activeLocation.id } }, _count: true, orderBy: { _count: { customerId: "desc" } }, take: 10 }),
    prisma.booking.groupBy({ by: ["roomType"], where: { startsAt: { gte: periodStart, lte: periodEnd }, room: { locationId: activeLocation.id } }, _sum: { durationHours: true }, _count: true }),
    prisma.coffeeSale.groupBy({ by: ["coffeeItemId"], where: { soldAt: { gte: periodStart, lte: periodEnd }, coffeeItem: { locationId: activeLocation.id } }, _sum: { finalAmount: true, quantity: true }, _count: true }),
    prisma.booking.aggregate({ where: { startsAt: { gte: periodStart, lte: periodEnd }, room: { locationId: activeLocation.id } }, _sum: { creditHoursUsed: true } })
  ]);
  const [visitCustomers, coffeeItems] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: coworkingUsage.map((v) => v.customerId) } } }),
    prisma.coffeeItem.findMany({ where: { id: { in: coffeeSales.map((sale) => sale.coffeeItemId) } } })
  ]);
  const query = `start=${format(periodStart, "yyyy-MM-dd")}&end=${format(periodEnd, "yyyy-MM-dd")}`;

  return (
    <>
      <PageHeader title="Reports" subtitle={`${activeLocation.name}: simple operating reports for sales, usage, discounts, renewals, and visits.`} />
      <div className="content">
        <section className="panel">
          <div className="section-head">
            <h2>Report Period</h2>
            <div className="actions">
              <a className="btn secondary" href={`/reports/export?format=csv&${query}`}>Export Excel/CSV</a>
              <a className="btn secondary" href={`/reports/export?format=pdf&${query}`}>Export PDF</a>
            </div>
          </div>
          <form className="form-grid">
            <div className="field"><label>Start date</label><input name="start" type="date" defaultValue={format(periodStart, "yyyy-MM-dd")} /></div>
            <div className="field"><label>End date</label><input name="end" type="date" defaultValue={format(periodEnd, "yyyy-MM-dd")} /></div>
            <div className="actions"><button className="btn">Apply period</button></div>
          </form>
        </section>
        <div className="grid cols-4">
          <div className="card metric"><span>Period sales</span><strong>{mmk(periodSales._sum.amount)}</strong></div>
          <div className="card metric"><span>Payment records</span><strong>{periodSales._count}</strong></div>
          <div className="card metric"><span>Room revenue</span><strong>{mmk(roomRevenue._sum.amount)}</strong></div>
          <div className="card metric"><span>Coffee revenue</span><strong>{mmk(coffeeRevenue._sum.amount)}</strong></div>
        </div>
        <div className="grid cols-2">
          <Report title="Sales Summary" rows={[["Coworking pass sales", `${passSales._count} records`, mmk(passSales._sum.amount)], ["Room rental revenue", `${roomRevenue._count} records`, mmk(roomRevenue._sum.amount)], ["Coffee and upgrades", `${coffeeRevenue._count} records`, mmk(coffeeRevenue._sum.amount)]]} />
          <Report title="Coworking Usage Report" rows={coworkingUsage.map((v) => [visitCustomers.find((c) => c.id === v.customerId)?.fullName ?? "Customer", `${v._count} visits`, ""])} />
          <Report title="Meeting Room Usage Report" rows={roomUsage.map((u) => [u.roomType.replaceAll("_", " "), `${u._count} bookings`, `${u._sum.durationHours ?? 0} hours`])} />
          <Report title="Coffee Sales Summary" rows={coffeeSales.map((sale) => [coffeeItems.find((item) => item.id === sale.coffeeItemId)?.name ?? "Coffee item", `${sale._sum.quantity ?? 0} cups`, mmk(sale._sum.finalAmount)])} />
          <Report title="Meeting Credit Usage" rows={[["Credits consumed", `${creditUse._sum.creditHoursUsed ?? 0} hours`, "Meeting room only"]]} />
          <Report title="Expired Memberships" rows={expired.map((c) => [c.fullName, c.activePassName ?? "None", `${c.remainingCoworkingDays} days left`])} />
          <Report title="Discount Report" rows={discounts.map((d) => [d.customer.fullName, d.discountReason ?? "No reason", mmk(d.priceBeforeDiscount - d.finalPrice)])} />
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

function Report({ title, rows }: { title: string; rows: string[][] }) {
  return <section className="panel"><div className="section-head"><h2>{title}</h2></div><table><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, n) => <td key={n}>{c}</td>)}</tr>)}{!rows.length && <tr><td className="muted">No records yet.</td></tr>}</tbody></table></section>;
}
