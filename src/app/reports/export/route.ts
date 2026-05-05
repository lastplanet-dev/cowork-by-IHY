import { endOfDay, format, parseISO, startOfMonth } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mmk } from "@/lib/format";
import { getOperationalLocation } from "@/lib/session";

export async function GET(request: NextRequest) {
  const location = await getOperationalLocation();
  const formatType = request.nextUrl.searchParams.get("format") ?? "csv";
  const start = request.nextUrl.searchParams.get("start") ? parseISO(String(request.nextUrl.searchParams.get("start"))) : startOfMonth(new Date());
  const end = request.nextUrl.searchParams.get("end") ? endOfDay(parseISO(String(request.nextUrl.searchParams.get("end")))) : endOfDay(new Date());
  const rows = await reportRows(location.id, start, end);

  if (formatType === "pdf") {
    const pdf = simplePdf([`Cowork by IHY Report`, `${location.name}`, `${format(start, "yyyy-MM-dd")} to ${format(end, "yyyy-MM-dd")}`, "", ...rows.map((row) => row.join("  |  "))]);
    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="cowork-report-${format(start, "yyyyMMdd")}-${format(end, "yyyyMMdd")}.pdf"`
      }
    });
  }

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cowork-report-${format(start, "yyyyMMdd")}-${format(end, "yyyyMMdd")}.csv"`
    }
  });
}

async function reportRows(locationId: string, start: Date, end: Date) {
  const locationPaymentWhere = {
    OR: [
      { customer: { locationId } },
      { membership: { customer: { locationId } } },
      { booking: { room: { locationId } } },
      { coffeeSale: { coffeeItem: { locationId } } },
      { receivedBy: { locationId } }
    ]
  };
  const paidWhere = { AND: [{ paymentDate: { gte: start, lte: end }, status: { in: ["PAID", "PARTIALLY_PAID"] as const } }, locationPaymentWhere] };
  const [payments, coworkingUsage, roomUsage, coffeeSales] = await Promise.all([
    prisma.payment.groupBy({ by: ["paymentFor"], where: paidWhere, _sum: { amount: true }, _count: true }),
    prisma.checkIn.groupBy({ by: ["customerId"], where: { checkedInAt: { gte: start, lte: end }, customer: { locationId } }, _count: true }),
    prisma.booking.groupBy({ by: ["roomType"], where: { startsAt: { gte: start, lte: end }, room: { locationId } }, _sum: { durationHours: true }, _count: true }),
    prisma.coffeeSale.groupBy({ by: ["coffeeItemId"], where: { soldAt: { gte: start, lte: end }, coffeeItem: { locationId } }, _sum: { finalAmount: true, quantity: true }, _count: true })
  ]);
  const [customers, coffeeItems] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: coworkingUsage.map((row) => row.customerId) } } }),
    prisma.coffeeItem.findMany({ where: { id: { in: coffeeSales.map((row) => row.coffeeItemId) } } })
  ]);

  return [
    ["Section", "Item", "Count/Qty", "Amount/Hours"],
    ...payments.map((row) => ["Sales Summary", row.paymentFor, row._count, mmk(row._sum.amount)]),
    ...coworkingUsage.map((row) => ["Coworking Usage", customers.find((customer) => customer.id === row.customerId)?.fullName ?? "Customer", row._count, "visits"]),
    ...roomUsage.map((row) => ["Meeting Room Usage", row.roomType, row._count, `${row._sum.durationHours ?? 0} hours`]),
    ...coffeeSales.map((row) => ["Coffee Sales", coffeeItems.find((item) => item.id === row.coffeeItemId)?.name ?? "Coffee", row._sum.quantity ?? 0, mmk(row._sum.finalAmount)])
  ];
}

function simplePdf(lines: string[]) {
  const escaped = lines.map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const text = escaped.map((line, index) => `72 ${760 - index * 18} Td (${line}) Tj`).join("\n0 -18 Td ");
  const stream = `BT /F1 11 Tf 72 760 Td ${escaped.map((line) => `(${line}) Tj T*`).join("\n")} ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = objects.map((object) => {
    const current = offset;
    offset += object.length + 1;
    return current;
  });
  const body = objects.join("\n");
  const table = ["xref", `0 ${objects.length + 1}`, "0000000000 65535 f ", ...xref.map((value) => `${String(value).padStart(10, "0")} 00000 n `)].join("\n");
  return `%PDF-1.4\n${body}\n${table}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`;
}
