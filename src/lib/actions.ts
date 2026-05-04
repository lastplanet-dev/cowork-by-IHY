"use server";

import { addDays, endOfDay, startOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BookingStatus, CoffeeKind, CustomerType, DiscountType, PaymentFor, PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDiscount } from "@/lib/format";
import { canAdjustPayments, getOperationalLocation, getCurrentStaff } from "@/lib/session";

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

function redirectAfterSave(formData: FormData) {
  const redirectTo = optionalText(formData, "redirectTo");
  if (redirectTo) redirect(redirectTo);
}

async function nextCustomerCode(locationId: string) {
  const count = await prisma.customer.count({ where: { locationId } });
  return `IHY-${String(count + 1).padStart(5, "0")}`;
}

function isFocusRoomType(roomType: string) {
  return ["FOCUS_ROOM", "PHONE_BOOTH", "Focus Room", "Phone Booth", "Focus Room / Phone Booth"].includes(roomType);
}

function isMeetingRoomType(roomType: string) {
  return roomType === "MEETING_ROOM" || roomType === "Meeting Room";
}

function isTrainingRoomType(roomType: string) {
  return roomType === "TRAINING_ROOM" || roomType === "Training Room";
}

function passwordMatches(storedPassword: string | null, submittedPassword: string) {
  if (!storedPassword) return false;
  if (storedPassword.startsWith("local-demo:")) return storedPassword === `local-demo:${submittedPassword}`;
  return storedPassword === submittedPassword;
}

export async function loginStaff(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const password = requiredText.parse(formData.get("password"));
  const rememberMe = formData.get("rememberMe") === "on";
  const staff = await prisma.staffUser.findFirst({ where: { email, isActive: true } });

  if (!staff || !passwordMatches(staff.passwordHash, password)) {
    redirect("/login?error=invalid");
  }

  (await cookies()).set("coworkStaffId", staff.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 12
  });
  redirect("/dashboard");
}

export async function logoutStaff() {
  (await cookies()).set("coworkStaffId", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  redirect("/login");
}

export async function createCustomer(formData: FormData) {
  const activeLocation = await getOperationalLocation();
  const locationId = activeLocation.id;
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
      customerCode: await nextCustomerCode(locationId),
      fullName: data.fullName,
      phone: data.phone,
      email: data.email || null,
      organization: data.organization || null,
      customerType: data.customerType,
      notes: data.notes || null,
      locationId
    }
  });
  await prisma.activityLog.create({ data: { message: `Registered ${customer.fullName}`, entity: "customer", entityId: customer.id } });
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}`);
}

export async function updateCustomer(customerId: string, formData: FormData) {
  const activeLocation = await getOperationalLocation();
  const existing = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (existing.locationId !== activeLocation.id) throw new Error("This customer belongs to another location.");
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
  const activeLocation = await getOperationalLocation();
  const locationId = activeLocation.id;
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

  if (id) await prisma.passType.update({ where: { id }, data: { ...data, locationId } });
  else await prisma.passType.create({ data: { ...data, locationId } });
  await prisma.activityLog.create({ data: { message: `${id ? "Updated" : "Created"} pass type ${data.name}`, entity: "pass" } });
  revalidatePath("/passes");
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deletePassType(id: string) {
  await prisma.passType.delete({ where: { id } });
  revalidatePath("/passes");
}

export async function sellPass(customerId: string, formData: FormData) {
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const passTypeId = requiredText.parse(formData.get("passTypeId"));
  const pass = await prisma.passType.findUniqueOrThrow({ where: { id: passTypeId } });
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(pass.price, discount.discountType, discount.discountValue);
  const payment = paymentFromForm(formData);
  const now = new Date();
  const existing = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (existing.locationId !== activeLocation.id || pass.locationId !== activeLocation.id) {
    throw new Error("Customer and pass type must belong to your current location.");
  }
  const hasActivePass = Boolean(existing.membershipExpiresAt && existing.membershipExpiresAt > now && existing.remainingCoworkingDays > 0);
  const baseExpiry = hasActivePass && existing.membershipExpiresAt ? existing.membershipExpiresAt : now;
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
        remainingCoworkingDays: hasActivePass ? { increment: pass.coworkingDays } : pass.coworkingDays,
        remainingMeetingCreditHours: hasActivePass ? { increment: pass.meetingCreditHours } : pass.meetingCreditHours,
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
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const now = new Date();
  if (customer.locationId !== activeLocation.id) throw new Error("This customer belongs to another location.");

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
  const freeCoffee = await prisma.coffeeItem.findFirst({ where: { kind: CoffeeKind.FREE_ENTITLEMENT, isActive: true, locationId: activeLocation.id } });
  const upgrade = await prisma.coffeeItem.findFirst({ where: { kind: CoffeeKind.UPGRADE, isActive: true, locationId: activeLocation.id } });

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
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const customerId = requiredText.parse(formData.get("customerId"));
  const roomId = requiredText.parse(formData.get("roomId"));
  const startsAt = new Date(String(formData.get("startsAt")));
  const endsAt = new Date(String(formData.get("endsAt")));
  if (startsAt < new Date()) throw new Error("Booking start time must be in the future.");
  if (endsAt <= startsAt) throw new Error("End time must be after start time.");

  const [room, customer] = await Promise.all([
    prisma.room.findUniqueOrThrow({ where: { id: roomId } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  ]);
  if (room.locationId !== activeLocation.id || customer.locationId !== activeLocation.id) {
    throw new Error("Booking customer and room must belong to your current location.");
  }
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
  if (isFocusRoomType(room.roomType) && !active) {
    throw new Error("Focus room and phone booth bookings are free only for active coworking users.");
  }

  let priceBeforeDiscount = Math.round(room.hourlyRate * durationHours);
  if (durationHours >= 8 && room.fullDayRate) priceBeforeDiscount = room.fullDayRate;
  else if (durationHours >= 4 && room.halfDayRate) priceBeforeDiscount = room.halfDayRate;

  let creditHoursUsed = 0;
  if (isMeetingRoomType(room.roomType) && room.creditsCanBeUsed) {
    creditHoursUsed = Math.min(durationHours, customer.remainingMeetingCreditHours);
  }
  if (isTrainingRoomType(room.roomType)) creditHoursUsed = 0;
  if (isFocusRoomType(room.roomType)) priceBeforeDiscount = 0;

  const chargeableHours = Math.max(0, durationHours - creditHoursUsed);
  const creditAdjustedPrice = isMeetingRoomType(room.roomType) ? Math.round(room.hourlyRate * chargeableHours) : priceBeforeDiscount;
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

export async function updateBooking(bookingId: string, formData: FormData) {
  const activeLocation = await getOperationalLocation();
  const customerId = requiredText.parse(formData.get("customerId"));
  const roomId = requiredText.parse(formData.get("roomId"));
  const startsAt = new Date(String(formData.get("startsAt")));
  const endsAt = new Date(String(formData.get("endsAt")));
  if (startsAt < new Date()) throw new Error("Booking start time must be in the future.");
  if (endsAt <= startsAt) throw new Error("End time must be after start time.");

  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const [room, customer] = await Promise.all([
    prisma.room.findUniqueOrThrow({ where: { id: roomId } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  ]);
  if (room.locationId !== activeLocation.id || customer.locationId !== activeLocation.id) {
    throw new Error("Booking customer and room must belong to your current location.");
  }
  const durationHours = Math.max(0.5, (endsAt.getTime() - startsAt.getTime()) / 36e5);
  if (durationHours * 60 < room.minBookingMinutes) throw new Error(`Minimum booking is ${room.minBookingMinutes} minutes.`);

  const clash = await prisma.booking.findFirst({
    where: {
      id: { not: bookingId },
      roomId,
      status: { not: BookingStatus.CANCELLED },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  if (clash) throw new Error("This room is already booked for that time.");

  const active = customer.membershipExpiresAt && customer.membershipExpiresAt >= new Date() && customer.remainingCoworkingDays > 0;
  if (isFocusRoomType(room.roomType) && !active) {
    throw new Error("Focus room and phone booth bookings are free only for active coworking users.");
  }

  let priceBeforeDiscount = Math.round(room.hourlyRate * durationHours);
  if (durationHours >= 8 && room.fullDayRate) priceBeforeDiscount = room.fullDayRate;
  else if (durationHours >= 4 && room.halfDayRate) priceBeforeDiscount = room.halfDayRate;

  let availableCredits = customer.remainingMeetingCreditHours;
  if (existing.customerId === customerId) availableCredits += existing.creditHoursUsed;
  let creditHoursUsed = 0;
  if (isMeetingRoomType(room.roomType) && room.creditsCanBeUsed) {
    creditHoursUsed = Math.min(durationHours, availableCredits);
  }
  if (isTrainingRoomType(room.roomType)) creditHoursUsed = 0;
  if (isFocusRoomType(room.roomType)) priceBeforeDiscount = 0;

  const chargeableHours = Math.max(0, durationHours - creditHoursUsed);
  const creditAdjustedPrice = isMeetingRoomType(room.roomType) ? Math.round(room.hourlyRate * chargeableHours) : priceBeforeDiscount;
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(creditAdjustedPrice, discount.discountType, discount.discountValue);
  const paymentStatus = String(formData.get("paymentStatus") || (finalPrice === 0 ? "WAIVED" : "UNPAID")) as PaymentStatus;
  const status = String(formData.get("status") || "CONFIRMED") as BookingStatus;
  const staff = await getCurrentStaff();

  await prisma.$transaction(async (tx) => {
    if (existing.creditHoursUsed > 0) {
      await tx.customer.update({
        where: { id: existing.customerId },
        data: { remainingMeetingCreditHours: { increment: existing.creditHoursUsed } }
      });
    }

    if (creditHoursUsed > 0) {
      await tx.customer.update({
        where: { id: customerId },
        data: { remainingMeetingCreditHours: { decrement: creditHoursUsed } }
      });
    }

    await tx.booking.update({
      where: { id: bookingId },
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
        status
      }
    });

    const payment = await tx.payment.findUnique({ where: { bookingId } });
    if (payment) {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          customerId,
          amount: finalPrice,
          status: paymentStatus,
          method: String(formData.get("paymentMethod") || payment.method) as PaymentMethod,
          receiptNumber: optionalText(formData, "receiptNumber")
        }
      });
    } else if (finalPrice > 0 || paymentStatus !== "UNPAID") {
      await tx.payment.create({
        data: {
          customerId,
          bookingId,
          paymentFor: PaymentFor.BOOKING,
          amount: finalPrice,
          method: String(formData.get("paymentMethod") || "CASH") as PaymentMethod,
          status: paymentStatus,
          receiptNumber: optionalText(formData, "receiptNumber"),
          receivedById: staff.id
        }
      });
    }

    await tx.activityLog.create({ data: { message: `Updated ${room.name} booking`, entity: "booking", entityId: bookingId } });
  });

  revalidatePath("/bookings");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath(`/customers/${customerId}`);
}

export async function cancelBooking(id: string) {
  await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED } });
  revalidatePath("/bookings");
  revalidatePath("/calendar");
}

export async function upsertRoom(formData: FormData) {
  const id = optionalText(formData, "id");
  const activeLocation = await getOperationalLocation();
  const locationId = activeLocation.id;
  const data = z.object({
    name: requiredText,
    roomType: requiredText,
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

  if (id) await prisma.room.update({ where: { id }, data: { ...data, locationId } });
  else await prisma.room.create({ data: { ...data, locationId } });
  revalidatePath("/rooms");
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deleteRoom(id: string) {
  await prisma.room.delete({ where: { id } });
  revalidatePath("/rooms");
}

export async function upsertRoomType(formData: FormData) {
  const id = optionalText(formData, "id");
  const activeLocation = await getOperationalLocation();
  const data = z.object({
    name: requiredText,
    description: z.string().optional(),
    isActive: z.boolean()
  }).parse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on"
  });

  if (id) await prisma.roomTypeSetting.update({ where: { id }, data });
  else await prisma.roomTypeSetting.create({ data: { ...data, locationId: activeLocation.id } });
  revalidatePath("/rooms");
  redirectAfterSave(formData);
}

export async function deleteRoomType(id: string) {
  await prisma.roomTypeSetting.delete({ where: { id } });
  revalidatePath("/rooms");
}

export async function upsertCoffeeItem(formData: FormData) {
  const id = optionalText(formData, "id");
  const activeLocation = await getOperationalLocation();
  const locationId = activeLocation.id;
  const data = z.object({
    name: requiredText,
    price: money,
    kind: z.nativeEnum(CoffeeKind),
    isActive: z.boolean()
  }).parse({ ...Object.fromEntries(formData), isActive: formData.get("isActive") === "on" });
  if (id) await prisma.coffeeItem.update({ where: { id }, data: { ...data, locationId } });
  else await prisma.coffeeItem.create({ data: { ...data, locationId } });
  revalidatePath("/coffee");
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function recordCoffeeSale(formData: FormData) {
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const item = await prisma.coffeeItem.findUniqueOrThrow({ where: { id: requiredText.parse(formData.get("coffeeItemId")) } });
  if (item.locationId !== activeLocation.id) throw new Error("This coffee item belongs to another location.");
  const quantity = z.coerce.number().int().min(1).parse(formData.get("quantity") || 1);
  const customerId = optionalText(formData, "customerId");
  if (customerId) {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (customer.locationId !== activeLocation.id) throw new Error("This customer belongs to another location.");
  }
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

export async function completePayment(paymentId: string, formData: FormData) {
  const staff = await getCurrentStaff();
  const existing = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const method = String(formData.get("method") || existing.method || "CASH") as PaymentMethod;
  const receiptNumber = optionalText(formData, "receiptNumber") ?? existing.receiptNumber;
  const paymentDate = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        method,
        receiptNumber,
        paymentDate,
        receivedById: staff.id
      }
    });

    if (existing.bookingId) {
      await tx.booking.update({
        where: { id: existing.bookingId },
        data: { paymentStatus: PaymentStatus.PAID }
      });
    }

    await tx.activityLog.create({
      data: {
        staffId: staff.id,
        message: `Completed ${existing.paymentFor.toLowerCase()} payment`,
        entity: "payment",
        entityId: paymentId
      }
    });
  });

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");
}

export async function voidPayment(paymentId: string, formData: FormData) {
  formData.set("status", "VOID");
  await updatePayment(paymentId, formData);
}

export async function upsertStaff(formData: FormData) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can manage staff accounts.");
  const id = optionalText(formData, "id");
  const activeLocation = await getOperationalLocation();
  const locationId = optionalText(formData, "locationId") ?? activeLocation.id;
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
  if (id) await prisma.staffUser.update({ where: { id }, data: { ...data, locationId } });
  else await prisma.staffUser.create({ data: { ...data, locationId, passwordHash: "changeme" } });
  revalidatePath("/staff");
  redirectAfterSave(formData);
}

export async function deleteStaff(staffId: string) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can delete staff accounts.");
  if (staff.id === staffId) throw new Error("You cannot delete your own active account.");
  await prisma.staffUser.delete({ where: { id: staffId } });
  revalidatePath("/staff");
}

export async function updateSetting(formData: FormData) {
  const key = requiredText.parse(formData.get("key"));
  const value = requiredText.parse(formData.get("value"));
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  revalidatePath("/settings");
}

export async function upsertLocation(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    address: z.string().optional(),
    phone: z.string().optional(),
    isActive: z.boolean()
  }).parse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on"
  });

  if (id) await prisma.location.update({ where: { id }, data });
  else await prisma.location.create({ data });
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deleteLocation(id: string) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can delete locations.");
  await prisma.location.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function setActiveLocation(formData: FormData) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can switch locations.");
  const locationId = requiredText.parse(formData.get("locationId"));
  await prisma.setting.upsert({
    where: { key: "activeLocationId" },
    create: { key: "activeLocationId", value: locationId },
    update: { value: locationId }
  });
  revalidatePath("/");
  redirectAfterSave(formData);
  redirect("/dashboard");
}

export async function updateOwnPassword(formData: FormData) {
  const staff = await getCurrentStaff();
  const newPassword = requiredText.min(8, "Use at least 8 characters").parse(formData.get("newPassword"));
  const confirmPassword = requiredText.parse(formData.get("confirmPassword"));
  if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
  await prisma.staffUser.update({
    where: { id: staff.id },
    data: { passwordHash: `local-demo:${newPassword}` }
  });
  await prisma.activityLog.create({ data: { staffId: staff.id, message: "Updated profile password", entity: "staff", entityId: staff.id } });
  revalidatePath("/profile");
}

export async function requestPasswordReset(formData: FormData) {
  const email = z.string().email().parse(formData.get("email"));
  const resetToken = `reset-${Date.now()}`;
  await prisma.staffUser.updateMany({
    where: { email },
    data: { resetToken, resetRequestedAt: new Date() }
  });
  redirect("/login?reset=requested");
}
