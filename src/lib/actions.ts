"use server";

import { addDays, endOfDay, startOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BookingStatus, CoffeeKind, CustomerType, DiscountType, PaymentFor, PaymentMethod, PaymentStatus, Role, RoomType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDiscount } from "@/lib/format";
import { canAdjustPayments, getCurrentStaff } from "@/lib/session";

const money = z.coerce.number().int().min(0);
const optionalMoney = z.coerce.number().int().min(0).optional().nullable();
const requiredText = z.string().trim().min(1);

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function discountFromForm(formData: FormData) {
  const type = optionalText(formData, "discountType") as DiscountType | null;
  const value = Number(formData.get("discountValue") || 0);
  return {
    discountType: type || null,
    discountValue: value > 0 ? value : null,
    discountReason: optionalText(formData, "discountReason"),
    discountApprovedBy: optionalText(formData, "discountApprovedBy"),
    discountNotes: optionalText(formData, "discountNotes")
  };
}

function paymentFromForm(formData: FormData) {
  return {
    method: String(formData.get("paymentMethod") || "CASH") as PaymentMethod,
    status: String(formData.get("paymentStatus") || "PAID") as PaymentStatus,
    receiptNumber: optionalText(formData, "receiptNumber")
  };
}

export async function createCustomer(formData: FormData) {
  const data = z.object({
    fullName: requiredText,
    phone: requiredText,
    email: z.string().email().optional().or(z.literal("")),
    organization: z.string().optional(),
    customerType: z.nativeEnum(CustomerType),
    notes: z.string().optional()
  }).parse(Object.fromEntries(formData));

  const customer = await prisma.customer.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email || null,
      organization: data.organization || null,
      customerType: data.customerType,
      notes: data.notes || null
    }
  });
  await prisma.activityLog.create({ data: { message: `Registered ${customer.fullName}`, entity: "customer", entityId: customer.id } });
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const data = z.object({
    fullName: requiredText,
    phone: requiredText,
    email: z.string().email().optional().or(z.literal("")),
    organization: z.string().optional(),
    customerType: z.nativeEnum(CustomerType),
    notes: z.string().optional()
  }).parse(Object.fromEntries(formData));

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      email: data.email || null,
      organization: data.organization || null,
      customerType: data.customerType,
      notes: data.notes || null
    }
  });
  await prisma.activityLog.create({ data: { message: `Updated customer profile`, entity: "customer", entityId: customerId } });
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteCustomer(customerId: string) {
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.activityLog.create({ data: { message: "Deleted customer", entity: "customer", entityId: customerId } });
  revalidatePath("/customers");
  redirect("/customers");
}

export async function upsertPassType(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    price: money,
    coworkingDays: z.coerce.number().int().min(0),
    validityDays: z.coerce.number().int().min(1),
    meetingCreditHours: z.coerce.number().min(0),
    freeCoffeePerCheckIn: z.coerce.number().int().min(0),
    isActive: z.coerce.boolean().default(false)
  }).parse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on"
  });

  if (id) await prisma.passType.update({ where: { id }, data });
  else await prisma.passType.create({ data });
  await prisma.activityLog.create({ data: { message: `${id ? "Updated" : "Created"} pass type ${data.name}`, entity: "pass" } });
  revalidatePath("/passes");
  revalidatePath("/settings");
}

export async function deletePassType(id: string) {
  await prisma.passType.delete({ where: { id } });
  revalidatePath("/passes");
}

export async function sellPass(customerId: string, formData: FormData) {
  const staff = await getCurrentStaff();
  const passTypeId = requiredText.parse(formData.get("passTypeId"));
  const pass = await prisma.passType.findUniqueOrThrow({ where: { id: passTypeId } });
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(pass.price, discount.discountType, discount.discountValue);
  const payment = paymentFromForm(formData);
  const now = new Date();
  const existing = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const baseExpiry = existing.membershipExpiresAt && existing.membershipExpiresAt > now ? existing.membershipExpiresAt : now;
  const expiresAt = addDays(baseExpiry, pass.validityDays);

  await prisma.$transaction(async (tx) => {
    const membership = await tx.membershipPurchase.create({
      data: {
        customerId,
        passTypeId: pass.id,
        passName: pass.name,
        priceBeforeDiscount: pass.price,
        ...discount,
        finalPrice,
        coworkingDaysAdded: pass.coworkingDays,
        meetingCreditHoursAdded: pass.meetingCreditHours,
        expiresAt
      }
    });

    await tx.customer.update({
      where: { id: customerId },
      data: {
        activePassName: pass.name,
        remainingCoworkingDays: { increment: pass.coworkingDays },
        remainingMeetingCreditHours: { increment: pass.meetingCreditHours },
        membershipExpiresAt: expiresAt
      }
    });

    await tx.payment.create({
      data: {
        customerId,
        membershipPurchaseId: membership.id,
        paymentFor: PaymentFor.PASS,
        amount: finalPrice,
        method: payment.method,
        status: payment.status,
        receiptNumber: payment.receiptNumber,
        receivedById: staff.id
      }
    });

    await tx.activityLog.create({ data: { staffId: staff.id, message: `Sold ${pass.name}`, entity: "customer", entityId: customerId } });
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/dashboard");
}

export async function checkInCustomer(formData: FormData) {
  const customerId = requiredText.parse(formData.get("customerId"));
  const overrideDuplicate = formData.get("overrideDuplicate") === "on";
  const upgradeCoffee = formData.get("upgradeCoffee") === "on";
  const staff = await getCurrentStaff();
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const now = new Date();

  if (!customer.membershipExpiresAt || customer.membershipExpiresAt < now || customer.remainingCoworkingDays <= 0) {
    throw new Error("Customer needs an active pass with remaining coworking days before check-in.");
  }

  const existingToday = await prisma.checkIn.findFirst({
    where: { customerId, checkedInAt: { gte: startOfDay(now), lte: endOfDay(now) } }
  });
  if (existingToday && !overrideDuplicate) {
    throw new Error("This customer is already checked in today. Use admin override if needed.");
  }

  const wifi = await prisma.setting.findUnique({ where: { key: "wifiPassword" } });
  const freeCoffee = await prisma.coffeeItem.findFirst({ where: { kind: CoffeeKind.FREE_ENTITLEMENT, isActive: true } });
  const upgrade = await prisma.coffeeItem.findFirst({ where: { kind: CoffeeKind.UPGRADE, isActive: true } });

  await prisma.$transaction(async (tx) => {
    const checkIn = await tx.checkIn.create({
      data: {
        customerId,
        wifiPasswordShown: wifi?.value ?? "Ask staff",
        overrideDuplicate
      }
    });

    await tx.customer.update({
      where: { id: customerId },
      data: { remainingCoworkingDays: { decrement: 1 }, isInside: true }
    });

    if (freeCoffee) {
      await tx.coffeeSale.create({
        data: { customerId, checkInId: checkIn.id, coffeeItemId: freeCoffee.id, unitPrice: 0, finalAmount: 0 }
      });
    }

    if (upgrade && upgradeCoffee) {
      const sale = await tx.coffeeSale.create({
        data: { customerId, checkInId: checkIn.id, coffeeItemId: upgrade.id, unitPrice: upgrade.price, finalAmount: upgrade.price }
      });
      await tx.payment.create({
        data: {
          customerId,
          coffeeSaleId: sale.id,
          paymentFor: PaymentFor.UPGRADE,
          amount: upgrade.price,
          method: String(formData.get("paymentMethod") || "CASH") as PaymentMethod,
          status: PaymentStatus.PAID,
          receivedById: staff.id
        }
      });
    }

    await tx.activityLog.create({ data: { staffId: staff.id, message: `Checked in ${customer.fullName}`, entity: "check-in", entityId: checkIn.id } });
  });

  revalidatePath("/check-in");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${customerId}`);
}

export async function checkOutCustomer(customerId: string) {
  await prisma.customer.update({ where: { id: customerId }, data: { isInside: false } });
  await prisma.checkIn.updateMany({
    where: { customerId, checkedOutAt: null },
    data: { checkedOutAt: new Date() }
  });
  revalidatePath("/dashboard");
  revalidatePath("/check-in");
}

export async function createBooking(formData: FormData) {
  const staff = await getCurrentStaff();
  const customerId = requiredText.parse(formData.get("customerId"));
  const roomId = requiredText.parse(formData.get("roomId"));
  const startsAt = new Date(String(formData.get("startsAt")));
  const endsAt = new Date(String(formData.get("endsAt")));
  if (endsAt <= startsAt) throw new Error("End time must be after start time.");

  const [room, customer] = await Promise.all([
    prisma.room.findUniqueOrThrow({ where: { id: roomId } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  ]);
  const durationHours = Math.max(0.5, (endsAt.getTime() - startsAt.getTime()) / 36e5);
  if (durationHours * 60 < room.minBookingMinutes) throw new Error(`Minimum booking is ${room.minBookingMinutes} minutes.`);

  const clash = await prisma.booking.findFirst({
    where: {
      roomId,
      status: { not: BookingStatus.CANCELLED },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  if (clash) throw new Error("This room is already booked for that time.");

  const active = customer.membershipExpiresAt && customer.membershipExpiresAt >= new Date() && customer.remainingCoworkingDays > 0;
  if ((room.roomType === RoomType.FOCUS_ROOM || room.roomType === RoomType.PHONE_BOOTH) && !active) {
    throw new Error("Focus room and phone booth bookings are free only for active coworking users.");
  }

  let priceBeforeDiscount = Math.round(room.hourlyRate * durationHours);
  if (durationHours >= 8 && room.fullDayRate) priceBeforeDiscount = room.fullDayRate;
  else if (durationHours >= 4 && room.halfDayRate) priceBeforeDiscount = room.halfDayRate;

  let creditHoursUsed = 0;
  if (room.roomType === RoomType.MEETING_ROOM && room.creditsCanBeUsed) {
    creditHoursUsed = Math.min(durationHours, customer.remainingMeetingCreditHours);
  }
  if (room.roomType === RoomType.TRAINING_ROOM) creditHoursUsed = 0;
  if (room.roomType === RoomType.FOCUS_ROOM || room.roomType === RoomType.PHONE_BOOTH) priceBeforeDiscount = 0;

  const chargeableHours = Math.max(0, durationHours - creditHoursUsed);
  const creditAdjustedPrice = room.roomType === RoomType.MEETING_ROOM ? Math.round(room.hourlyRate * chargeableHours) : priceBeforeDiscount;
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(creditAdjustedPrice, discount.discountType, discount.discountValue);
  const paymentStatus = String(formData.get("paymentStatus") || (finalPrice === 0 ? "WAIVED" : "UNPAID")) as PaymentStatus;

  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        customerId,
        roomId,
        roomType: room.roomType,
        startsAt,
        endsAt,
        durationHours,
        priceBeforeDiscount,
        ...discount,
        finalPrice,
        creditHoursUsed,
        paymentStatus,
        notes: optionalText(formData, "notes"),
        status: String(formData.get("status") || "CONFIRMED") as BookingStatus
      }
    });

    if (creditHoursUsed > 0) {
      await tx.customer.update({ where: { id: customerId }, data: { remainingMeetingCreditHours: { decrement: creditHoursUsed } } });
    }

    if (finalPrice > 0 || paymentStatus !== "UNPAID") {
      await tx.payment.create({
        data: {
          customerId,
          bookingId: booking.id,
          paymentFor: PaymentFor.BOOKING,
          amount: finalPrice,
          method: String(formData.get("paymentMethod") || "CASH") as PaymentMethod,
          status: paymentStatus,
          receiptNumber: optionalText(formData, "receiptNumber"),
          receivedById: staff.id
        }
      });
    }

    await tx.activityLog.create({ data: { staffId: staff.id, message: `Created ${room.name} booking`, entity: "booking", entityId: booking.id } });
  });

  revalidatePath("/bookings");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function cancelBooking(id: string) {
  await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED } });
  revalidatePath("/bookings");
  revalidatePath("/calendar");
}

export async function upsertRoom(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    roomType: z.nativeEnum(RoomType),
    capacity: z.coerce.number().int().min(1),
    hourlyRate: money,
    halfDayRate: optionalMoney,
    fullDayRate: optionalMoney,
    creditsCanBeUsed: z.boolean(),
    isActive: z.boolean(),
    minBookingMinutes: z.coerce.number().int().min(15),
    bufferMinutes: z.coerce.number().int().min(0)
  }).parse({
    ...Object.fromEntries(formData),
    creditsCanBeUsed: formData.get("creditsCanBeUsed") === "on",
    isActive: formData.get("isActive") === "on"
  });

  if (id) await prisma.room.update({ where: { id }, data });
  else await prisma.room.create({ data });
  revalidatePath("/rooms");
  revalidatePath("/settings");
}

export async function deleteRoom(id: string) {
  await prisma.room.delete({ where: { id } });
  revalidatePath("/rooms");
}

export async function upsertCoffeeItem(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    price: money,
    kind: z.nativeEnum(CoffeeKind),
    isActive: z.boolean()
  }).parse({ ...Object.fromEntries(formData), isActive: formData.get("isActive") === "on" });
  if (id) await prisma.coffeeItem.update({ where: { id }, data });
  else await prisma.coffeeItem.create({ data });
  revalidatePath("/coffee");
  revalidatePath("/settings");
}

export async function recordCoffeeSale(formData: FormData) {
  const staff = await getCurrentStaff();
  const item = await prisma.coffeeItem.findUniqueOrThrow({ where: { id: requiredText.parse(formData.get("coffeeItemId")) } });
  const quantity = z.coerce.number().int().min(1).parse(formData.get("quantity") || 1);
  const customerId = optionalText(formData, "customerId");
  const discount = discountFromForm(formData);
  const price = item.price * quantity;
  const finalAmount = calculateDiscount(price, discount.discountType, discount.discountValue);
  const sale = await prisma.coffeeSale.create({
    data: { customerId, coffeeItemId: item.id, quantity, unitPrice: item.price, ...discount, finalAmount }
  });
  await prisma.payment.create({
    data: {
      customerId,
      coffeeSaleId: sale.id,
      paymentFor: item.kind === CoffeeKind.UPGRADE ? PaymentFor.UPGRADE : PaymentFor.COFFEE,
      amount: finalAmount,
      method: String(formData.get("paymentMethod") || "CASH") as PaymentMethod,
      status: finalAmount === 0 ? PaymentStatus.WAIVED : PaymentStatus.PAID,
      receivedById: staff.id
    }
  });
  revalidatePath("/coffee");
  revalidatePath("/dashboard");
}

export async function deleteCoffeeItem(id: string) {
  await prisma.coffeeItem.delete({ where: { id } });
  revalidatePath("/coffee");
}

export async function updatePayment(paymentId: string, formData: FormData) {
  const staff = await getCurrentStaff();
  if (!canAdjustPayments(staff.role)) throw new Error("Only Super Admin can adjust submitted payments.");
  const existing = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const updated = {
    amount: money.parse(formData.get("amount")),
    method: String(formData.get("method") || existing.method) as PaymentMethod,
    status: String(formData.get("status") || existing.status) as PaymentStatus,
    paymentDate: new Date(String(formData.get("paymentDate") || existing.paymentDate)),
    receiptNumber: optionalText(formData, "receiptNumber")
  };
  const reason = requiredText.parse(formData.get("reason"));

  await prisma.$transaction([
    prisma.payment.update({ where: { id: paymentId }, data: updated }),
    prisma.paymentAdjustment.create({
      data: {
        paymentId,
        originalDetails: JSON.stringify(existing),
        updatedDetails: JSON.stringify(updated),
        reason,
        adjustedById: staff.id
      }
    })
  ]);
  revalidatePath("/payments");
}

export async function voidPayment(paymentId: string, formData: FormData) {
  formData.set("status", "VOID");
  await updatePayment(paymentId, formData);
}

export async function upsertStaff(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    email: z.string().email(),
    role: z.nativeEnum(Role),
    canSettings: z.boolean(),
    isActive: z.boolean()
  }).parse({
    ...Object.fromEntries(formData),
    canSettings: formData.get("canSettings") === "on",
    isActive: formData.get("isActive") === "on"
  });
  if (id) await prisma.staffUser.update({ where: { id }, data });
  else await prisma.staffUser.create({ data });
  revalidatePath("/staff");
}

export async function updateSetting(formData: FormData) {
  const key = requiredText.parse(formData.get("key"));
  const value = requiredText.parse(formData.get("value"));
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  revalidatePath("/settings");
}
