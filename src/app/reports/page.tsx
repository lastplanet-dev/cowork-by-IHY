import { startOfMonth, startOfToday } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export default async function ReportsPage() {
  const activeLocation = await getOperationalLocation();
  const locationPaymentWhere = paymentLocationWhere(activeLocation.id);
  const [daily, monthly, passSales, roomRevenue, coffeeRevenue, discounts, expired, utilization, creditUse, visits] = await Promise.all([
    prisma.payment.aggregate({ where: { AND: [{ paymentDate: { gte: startOfToday() }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { AND: [{ paymentDate: { gte: startOfMonth(new Date()) }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: "PASS", status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: "BOOKING", status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({ where: { AND: [{ paymentFor: { in: ["COFFEE", "UPGRADE"] }, status: { in: ["PAID", "PARTIALLY_PAID"] } }, locationPaymentWhere] }, _sum: { amount: true }, _count: true }),
    prisma.membershipPurchase.findMany({ where: { discountValue: { gt: 0 }, customer: { locationId: activeLocation.id } }, take: 20, include: { customer: true } }),
    prisma.customer.findMany({ where: { locationId: activeLocation.id, membershipExpiresAt: { lt: new Date() } }, take: 20 }),
    prisma.booking.groupBy({ by: ["roomType"], where: { room: { locationId: activeLocation.id } }, _sum: { durationHours: true }, _count: true }),
    prisma.booking.aggregate({ where: { room: { locationId: activeLocation.id } }, _sum: { creditHoursUsed: true } }),
    prisma.checkIn.groupBy({ by: ["customerId"], where: { customer: { locationId: activeLocation.id } }, _count: true, orderBy: { _count: { customerId: "desc" } }, take: 10 })
  ]);
  const visitCustomers = await prisma.customer.findMany({ where: { id: { in: visits.map((v) => v.customerId) } } });

  return (
    <>
      <PageHeader title="Reports" subtitle={`${activeLocation.name}: simple operating reports for sales, usage, discounts, renewals, and visits.`} />
      <div className="content">
        <div className="grid cols-4">
          <div className="card metric"><span>Daily sales</span><strong>{mmk(daily._sum.amount)}</strong></div>
          <div className="card metric"><span>Monthly sales</span><strong>{mmk(monthly._sum.amount)}</strong></div>
          <div className="card metric"><span>Room revenue</span><strong>{mmk(roomRevenue._sum.amount)}</strong></div>
          <div className="card metric"><span>Coffee revenue</span><strong>{mmk(coffeeRevenue._sum.amount)}</strong></div>
        </div>
        <div className="grid cols-2">
          <Report title="Sales by Module" rows={[["Coworking pass sales", `${passSales._count} records`, mmk(passSales._sum.amount)], ["Room rental revenue", `${roomRevenue._count} bookings`, mmk(roomRevenue._sum.amount)], ["Coffee and upgrades", `${coffeeRevenue._count} sales`, mmk(coffeeRevenue._sum.amount)]]} />
          <Report title="Room Utilization" rows={utilization.map((u) => [u.roomType.replaceAll("_", " "), `${u._count} bookings`, `${u._sum.durationHours ?? 0} hours`])} />
          <Report title="Meeting Credit Usage" rows={[["Credits consumed", `${creditUse._sum.creditHoursUsed ?? 0} hours`, "Meeting room only"]]} />
          <Report title="Expired Memberships" rows={expired.map((c) => [c.fullName, c.activePassName ?? "None", `${c.remainingCoworkingDays} days left`])} />
          <Report title="Discount Report" rows={discounts.map((d) => [d.customer.fullName, d.discountReason ?? "No reason", mmk(d.priceBeforeDiscount - d.finalPrice)])} />
          <Report title="Customer Visit History" rows={visits.map((v) => [visitCustomers.find((c) => c.id === v.customerId)?.fullName ?? "Customer", `${v._count} visits`, ""])} />
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
