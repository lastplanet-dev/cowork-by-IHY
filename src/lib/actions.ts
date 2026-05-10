"use server";

import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BookingStatus, CoffeeKind, CustomerType, DiscountType, PaymentFor, PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDiscount } from "@/lib/format";
import { canAdjustPayments, getOperationalLocation, getCurrentStaff } from "@/lib/session";
import { endOfYangonDayUtc, isWithinOperatingHours, operatingHoursFromForm, operatingHoursLabelForDate, operatingWindowForYangonDate, parseOperatingHours, parseYangonDateTimeToUtc, parseYangonDateToUtc, startOfYangonDayUtc } from "@/lib/yangon-time";

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

async function bookingPaymentAmount(formData: FormData, finalPrice: number, paymentStatus: PaymentStatus, redirectPath = "/bookings") {
  if (paymentStatus === PaymentStatus.PARTIALLY_PAID) {
    const deposit = money.parse(formData.get("amountPaid"));
    if (deposit <= 0) await redirectWithError(redirectPath, "Please enter the paid deposit amount.");
    if (deposit >= finalPrice) await redirectWithError(redirectPath, "Deposit amount should be less than the final booking price.");
    return deposit;
  }
  return finalPrice;
}

async function bookingPriceForRoom(room: { hourlyRate: number; halfDayRate: number | null; fullDayRate: number | null; bookingPricingMode?: string }, durationHours: number, formData: FormData) {
  const rentalPackage = String(formData.get("rentalPackage") || "HOURLY");
  if (room.bookingPricingMode === "HALF_DAY_FULL_DAY" && rentalPackage === "HOURLY") {
    await redirectWithError("/bookings", "This room can only be booked as half-day or full-day.");
  }
  if (rentalPackage === "HALF_DAY") {
    if (!room.halfDayRate) await redirectWithError("/bookings", "Half-day rate is not configured for this room.");
    if (Math.abs(durationHours - 4) > 0.01) await redirectWithError("/bookings", "Half-day bookings must be exactly 4 hours.");
    return room.halfDayRate ?? 0;
  }
  if (rentalPackage === "FULL_DAY") {
    if (!room.fullDayRate) await redirectWithError("/bookings", "Full-day rate is not configured for this room.");
    if (Math.abs(durationHours - 8) > 0.01) await redirectWithError("/bookings", "Full-day bookings must be exactly 8 hours.");
    return room.fullDayRate ?? 0;
  }
  let price = Math.round(room.hourlyRate * durationHours);
  if (durationHours >= 8 && room.fullDayRate) price = room.fullDayRate;
  else if (durationHours >= 4 && room.halfDayRate) price = room.halfDayRate;
  return price;
}

function redirectAfterSave(formData: FormData) {
  const redirectTo = optionalText(formData, "redirectTo");
  if (redirectTo) redirect(redirectTo);
}

async function setFlash(message: string, type: "ok" | "danger" = "ok") {
  const cookieStore = await cookies();
  cookieStore.set("coworkFlash", encodeURIComponent(message), { path: "/", maxAge: 20, sameSite: "lax" });
  cookieStore.set("coworkFlashType", type, { path: "/", maxAge: 20, sameSite: "lax" });
}

async function redirectWithError(path: string, message: string): Promise<never> {
  await setFlash(message, "danger");
  redirect(path);
}

async function nextCustomerCode(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  const prefix = (location?.name ?? "IHY")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase() || "IHY";
  const count = await prisma.customer.count({ where: { locationId } });
  for (let index = count + 1; index < count + 1000; index += 1) {
    const code = `${prefix}-${String(index).padStart(5, "0")}`;
    const existing = await prisma.customer.findUnique({ where: { customerCode: code } });
    if (!existing) return code;
  }
  return `${prefix}-${Date.now()}`;
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
  await setFlash(`Customer ${customer.fullName} registered successfully.`);
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
  await setFlash("Customer profile updated successfully.");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
}

export async function deleteCustomer(customerId: string) {
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.activityLog.create({ data: { message: "Deleted customer", entity: "customer", entityId: customerId } });
  await setFlash("Customer deleted successfully.");
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
  await setFlash(`Pass type ${id ? "updated" : "created"} successfully.`);
  revalidatePath("/passes");
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deletePassType(id: string) {
  await prisma.passType.delete({ where: { id } });
  await setFlash("Pass type deleted successfully.");
  revalidatePath("/passes");
}

export async function sellPass(customerId: string, formData: FormData) {
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const passTypeId = requiredText.parse(formData.get("passTypeId"));
  const pass = await prisma.passType.findUniqueOrThrow({ where: { id: passTypeId } });
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(pass.price, discount.discountType, discount.discountValue);
  const payment = paymentFromForm(formData);
  const paymentAmount = await bookingPaymentAmount(formData, finalPrice, payment.status, `/customers/${customerId}`);
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
        amount: paymentAmount,
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
  await setFlash(`${existing.fullName} renewed successfully.`);
}

export async function checkInCustomer(formData: FormData) {
  const customerId = requiredText.parse(formData.get("customerId"));
  const overrideDuplicate = formData.get("overrideDuplicate") === "on";
  const upgradeCoffee = formData.get("upgradeCoffee") === "on";
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  const now = new Date();
  if (customer.locationId !== activeLocation.id) await redirectWithError("/check-in", "This customer belongs to another location.");

  if (!customer.membershipExpiresAt || customer.membershipExpiresAt < now || customer.remainingCoworkingDays <= 0) {
    await redirectWithError("/check-in", "Customer needs an active pass with remaining coworking days before check-in.");
  }

  const existingToday = await prisma.checkIn.findFirst({
    where: { customerId, checkedInAt: { gte: startOfYangonDayUtc(now), lte: endOfYangonDayUtc(now) } }
  });
  if (existingToday && !overrideDuplicate) {
    await redirectWithError("/check-in", "This customer is already checked in today. Use admin override if needed.");
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
  await setFlash(`${customer.fullName} checked in successfully.`);
}

export async function checkOutCustomer(customerId: string) {
  await prisma.customer.update({ where: { id: customerId }, data: { isInside: false } });
  await prisma.checkIn.updateMany({
    where: { customerId, checkedOutAt: null },
    data: { checkedOutAt: new Date() }
  });
  revalidatePath("/dashboard");
  revalidatePath("/check-in");
  await setFlash("Customer checked out successfully.");
}

export async function createBooking(formData: FormData) {
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const customerId = requiredText.parse(formData.get("customerId"));
  const roomId = requiredText.parse(formData.get("roomId"));
  const startsAt = parseYangonDateTimeToUtc(String(formData.get("startsAt")));
  const endsAt = parseYangonDateTimeToUtc(String(formData.get("endsAt")));
  if (startsAt < new Date()) await redirectWithError("/bookings", "Selected time is in the past. Please choose a future time.");
  if (endsAt <= startsAt) await redirectWithError("/bookings", "End time must be after start time.");

  const [room, customer] = await Promise.all([
    prisma.room.findUniqueOrThrow({ where: { id: roomId }, include: { location: true } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  ]);
  if (room.locationId !== activeLocation.id || customer.locationId !== activeLocation.id) {
    await redirectWithError("/bookings", "Booking customer and room must belong to your current location.");
  }
  const durationHours = Math.max(0.5, (endsAt.getTime() - startsAt.getTime()) / 36e5);
  if (durationHours * 60 < room.minBookingMinutes) await redirectWithError("/bookings", `Minimum booking is ${room.minBookingMinutes} minutes.`);
  const schedule = parseOperatingHours(room.operatingHoursJson ?? room.location?.operatingHoursJson);
  if (!isWithinOperatingHours(startsAt, endsAt, schedule)) {
    await redirectWithError("/bookings", `Selected time is outside the operating hours. ${room.name} is available: ${operatingHoursLabelForDate(startsAt, schedule)}.`);
  }

  const clash = await prisma.booking.findFirst({
    where: {
      roomId,
      status: { not: BookingStatus.CANCELLED },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  if (clash) await redirectWithError("/bookings", "This room is already booked for that time.");

  const active = customer.membershipExpiresAt && customer.membershipExpiresAt >= new Date() && customer.remainingCoworkingDays > 0;
  if (isFocusRoomType(room.roomType) && !active) {
    await redirectWithError("/bookings", `${customer.fullName} has no active membership or remaining coworking days. Focus room and phone booth bookings are free only for active coworking users.`);
  }

  let priceBeforeDiscount = await bookingPriceForRoom(room, durationHours, formData);

  const useMeetingCredit = formData.get("useMeetingCredit") === "on";
  let creditHoursUsed = 0;
  if (useMeetingCredit && isMeetingRoomType(room.roomType) && room.creditsCanBeUsed) {
    creditHoursUsed = Math.min(durationHours, customer.remainingMeetingCreditHours);
  }
  if (useMeetingCredit && !room.creditsCanBeUsed) {
    await redirectWithError("/bookings", `${room.name} is not configured to accept meeting room credits.`);
  }
  if (useMeetingCredit && creditHoursUsed <= 0) {
    await redirectWithError("/bookings", `${customer.fullName} has no available meeting room credit.`);
  }
  if (isTrainingRoomType(room.roomType)) creditHoursUsed = 0;
  if (isFocusRoomType(room.roomType)) priceBeforeDiscount = 0;

  const chargeableHours = Math.max(0, durationHours - creditHoursUsed);
  const creditAdjustedPrice = isMeetingRoomType(room.roomType) ? Math.round(room.hourlyRate * chargeableHours) : priceBeforeDiscount;
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(creditAdjustedPrice, discount.discountType, discount.discountValue);
  const paymentStatus = String(formData.get("paymentStatus") || (finalPrice === 0 ? "WAIVED" : "UNPAID")) as PaymentStatus;
  const paymentAmount = await bookingPaymentAmount(formData, finalPrice, paymentStatus);

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

    if (paymentStatus !== PaymentStatus.WAIVED) {
      await tx.payment.create({
        data: {
          customerId,
          bookingId: booking.id,
          paymentFor: PaymentFor.BOOKING,
          amount: paymentAmount,
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
  await setFlash("Booking created successfully.");
}

export async function updateBooking(bookingId: string, formData: FormData) {
  const activeLocation = await getOperationalLocation();
  const customerId = requiredText.parse(formData.get("customerId"));
  const roomId = requiredText.parse(formData.get("roomId"));
  const startsAt = parseYangonDateTimeToUtc(String(formData.get("startsAt")));
  const endsAt = parseYangonDateTimeToUtc(String(formData.get("endsAt")));
  if (startsAt < new Date()) await redirectWithError("/bookings", "Selected time is in the past. Please choose a future time.");
  if (endsAt <= startsAt) await redirectWithError("/bookings", "End time must be after start time.");

  const existing = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  const [room, customer] = await Promise.all([
    prisma.room.findUniqueOrThrow({ where: { id: roomId }, include: { location: true } }),
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } })
  ]);
  if (room.locationId !== activeLocation.id || customer.locationId !== activeLocation.id) {
    await redirectWithError("/bookings", "Booking customer and room must belong to your current location.");
  }
  const durationHours = Math.max(0.5, (endsAt.getTime() - startsAt.getTime()) / 36e5);
  if (durationHours * 60 < room.minBookingMinutes) await redirectWithError("/bookings", `Minimum booking is ${room.minBookingMinutes} minutes.`);
  const schedule = parseOperatingHours(room.operatingHoursJson ?? room.location?.operatingHoursJson);
  if (!isWithinOperatingHours(startsAt, endsAt, schedule)) {
    await redirectWithError("/bookings", `Selected time is outside the operating hours. ${room.name} is available: ${operatingHoursLabelForDate(startsAt, schedule)}.`);
  }

  const clash = await prisma.booking.findFirst({
    where: {
      id: { not: bookingId },
      roomId,
      status: { not: BookingStatus.CANCELLED },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    }
  });
  if (clash) await redirectWithError("/bookings", "This room is already booked for that time.");

  const active = customer.membershipExpiresAt && customer.membershipExpiresAt >= new Date() && customer.remainingCoworkingDays > 0;
  if (isFocusRoomType(room.roomType) && !active) {
    await redirectWithError("/bookings", `${customer.fullName} has no active membership or remaining coworking days. Focus room and phone booth bookings are free only for active coworking users.`);
  }

  let priceBeforeDiscount = await bookingPriceForRoom(room, durationHours, formData);

  let availableCredits = customer.remainingMeetingCreditHours;
  if (existing.customerId === customerId) availableCredits += existing.creditHoursUsed;
  const useMeetingCredit = formData.get("useMeetingCredit") === "on";
  let creditHoursUsed = 0;
  if (useMeetingCredit && isMeetingRoomType(room.roomType) && room.creditsCanBeUsed) {
    creditHoursUsed = Math.min(durationHours, availableCredits);
  }
  if (useMeetingCredit && !room.creditsCanBeUsed) {
    await redirectWithError("/bookings", `${room.name} is not configured to accept meeting room credits.`);
  }
  if (useMeetingCredit && creditHoursUsed <= 0) {
    await redirectWithError("/bookings", `${customer.fullName} has no available meeting room credit.`);
  }
  if (isTrainingRoomType(room.roomType)) creditHoursUsed = 0;
  if (isFocusRoomType(room.roomType)) priceBeforeDiscount = 0;

  const chargeableHours = Math.max(0, durationHours - creditHoursUsed);
  const creditAdjustedPrice = isMeetingRoomType(room.roomType) ? Math.round(room.hourlyRate * chargeableHours) : priceBeforeDiscount;
  const discount = discountFromForm(formData);
  const finalPrice = calculateDiscount(creditAdjustedPrice, discount.discountType, discount.discountValue);
  const paymentStatus = String(formData.get("paymentStatus") || (finalPrice === 0 ? "WAIVED" : "UNPAID")) as PaymentStatus;
  const paymentAmount = await bookingPaymentAmount(formData, finalPrice, paymentStatus);
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
          amount: paymentAmount,
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
          amount: paymentAmount,
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
  await setFlash("Booking updated successfully.");
}

export async function cancelBooking(id: string) {
  await prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED } });
  await setFlash("Booking cancelled successfully.");
  revalidatePath("/bookings");
  revalidatePath("/calendar");
}

export async function createCoworkingBooking(formData: FormData) {
  const [staff, activeLocation] = await Promise.all([getCurrentStaff(), getOperationalLocation()]);
  const customerId = requiredText.parse(formData.get("customerId"));
  const bookingDateText = requiredText.parse(formData.get("bookingDate"));
  const bookingDate = parseYangonDateToUtc(bookingDateText);
  const today = startOfYangonDayUtc();
  const redirectTo = `/bookings?tab=coworking&date=${bookingDateText}`;

  if (bookingDate < today) await redirectWithError(redirectTo, "Coworking seat bookings must be for today or a future date.");
  const schedule = parseOperatingHours(activeLocation.operatingHoursJson);
  const operatingWindow = operatingWindowForYangonDate(bookingDateText, schedule);
  if (!operatingWindow) {
    await redirectWithError(redirectTo, "Selected time is outside the operating hours.");
  }
  if (!operatingWindow) return;
  if (bookingDate.getTime() === today.getTime() && operatingWindow.end < new Date()) {
    await redirectWithError(redirectTo, "Selected time is in the past. Please choose a future time.");
  }
  if (activeLocation.coworkingSeatCapacity <= 0) {
    await redirectWithError(redirectTo, "Please set coworking seat capacity for this location in Settings first.");
  }

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.locationId !== activeLocation.id) {
    await redirectWithError(redirectTo, "Customer must belong to your current location.");
  }

  const [existingBooking, bookedSeats] = await Promise.all([
    prisma.coworkingBooking.findUnique({
      where: { locationId_customerId_bookingDate: { locationId: activeLocation.id, customerId, bookingDate } }
    }),
    prisma.coworkingBooking.count({
      where: { locationId: activeLocation.id, bookingDate, status: { not: "CANCELLED" } }
    })
  ]);

  if (existingBooking && existingBooking.status !== "CANCELLED") {
    await redirectWithError(redirectTo, "This customer already has a coworking seat booking for that day.");
  }
  if (bookedSeats >= activeLocation.coworkingSeatCapacity) {
    await redirectWithError(redirectTo, "Coworking seats are fully booked for that day.");
  }

  await prisma.$transaction(async (tx) => {
    if (existingBooking) {
      await tx.coworkingBooking.update({
        where: { id: existingBooking.id },
        data: { status: "CONFIRMED", notes: optionalText(formData, "notes") }
      });
    } else {
      await tx.coworkingBooking.create({
        data: {
          locationId: activeLocation.id,
          customerId,
          bookingDate,
          notes: optionalText(formData, "notes")
        }
      });
    }
    await tx.activityLog.create({
      data: { staffId: staff.id, message: `Reserved coworking seat for ${customer.fullName}`, entity: "coworking-booking", entityId: customerId }
    });
  });

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  await setFlash("Coworking seat booked successfully.");
  redirect(redirectTo);
}

export async function cancelCoworkingBooking(id: string, formData: FormData) {
  await prisma.coworkingBooking.update({ where: { id }, data: { status: "CANCELLED" } });
  await setFlash("Coworking seat booking cancelled successfully.");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  redirectAfterSave(formData);
}

export async function markCoworkingBookingCheckedIn(id: string, formData: FormData) {
  await prisma.coworkingBooking.update({ where: { id }, data: { status: "CHECKED_IN" } });
  await setFlash("Coworking seat booking marked as arrived.");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  redirectAfterSave(formData);
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
    bookingPricingMode: z.enum(["HOURLY", "HALF_DAY_FULL_DAY"]),
    creditsCanBeUsed: z.boolean(),
    isActive: z.boolean(),
    minBookingMinutes: z.coerce.number().int().min(15),
    bufferMinutes: z.coerce.number().int().min(0)
  }).parse({
    ...Object.fromEntries(formData),
    creditsCanBeUsed: formData.get("creditsCanBeUsed") === "on",
    isActive: formData.get("isActive") === "on"
  });
  const operatingHoursJson = formData.get("inheritLocationHours") === "on" ? null : operatingHoursFromForm(formData, "roomHours");

  if (id) await prisma.room.update({ where: { id }, data: { ...data, operatingHoursJson, locationId } });
  else await prisma.room.create({ data: { ...data, operatingHoursJson, locationId } });
  await setFlash(`Room ${id ? "updated" : "created"} successfully.`);
  revalidatePath("/rooms");
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deleteRoom(id: string) {
  await prisma.room.delete({ where: { id } });
  await setFlash("Room deleted successfully.");
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
  await setFlash(`Room type ${id ? "updated" : "created"} successfully.`);
  revalidatePath("/rooms");
  redirectAfterSave(formData);
}

export async function deleteRoomType(id: string) {
  await prisma.roomTypeSetting.delete({ where: { id } });
  await setFlash("Room type deleted successfully.");
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
  await setFlash(`Coffee menu item ${id ? "updated" : "created"} successfully.`);
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
  await setFlash("Coffee sale recorded successfully.");
}

export async function deleteCoffeeItem(id: string) {
  await prisma.coffeeItem.delete({ where: { id } });
  await setFlash("Coffee menu item deleted successfully.");
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
  await setFlash("Payment adjustment saved successfully.");
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
  await setFlash("Payment marked as paid successfully.");
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
  const password = optionalText(formData, "password");
  const confirmPassword = optionalText(formData, "confirmPassword");
  if (!id && !password) throw new Error("Password is required for new staff accounts.");
  if (password && password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (password && password !== confirmPassword) throw new Error("Passwords do not match.");
  const data = z.object({
    name: requiredText,
    email: z.string().email(),
    role: z.nativeEnum(Role),
    isActive: z.boolean()
  }).parse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on"
  });
  const payload = { ...data, locationId, canSettings: data.role === Role.ADMIN };
  if (id) await prisma.staffUser.update({ where: { id }, data: { ...payload, ...(password ? { passwordHash: `local-demo:${password}` } : {}) } });
  else await prisma.staffUser.create({ data: { ...payload, passwordHash: `local-demo:${password}` } });
  await setFlash(`Staff account ${id ? "updated" : "created"} successfully.`);
  revalidatePath("/staff");
  redirectAfterSave(formData);
}

export async function deleteStaff(staffId: string) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can delete staff accounts.");
  if (staff.id === staffId) throw new Error("You cannot delete your own active account.");
  await prisma.staffUser.delete({ where: { id: staffId } });
  await setFlash("Staff account deleted successfully.");
  revalidatePath("/staff");
}

export async function updateSetting(formData: FormData) {
  const key = requiredText.parse(formData.get("key"));
  const value = requiredText.parse(formData.get("value"));
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await setFlash("Workspace default saved successfully.");
  revalidatePath("/settings");
}

export async function upsertLocation(formData: FormData) {
  const id = optionalText(formData, "id");
  const data = z.object({
    name: requiredText,
    address: z.string().optional(),
    phone: z.string().optional(),
    coworkingSeatCapacity: z.coerce.number().int().min(0),
    isActive: z.boolean()
  }).parse({
    ...Object.fromEntries(formData),
    isActive: formData.get("isActive") === "on"
  });
  const operatingHoursJson = operatingHoursFromForm(formData, "locationHours");

  if (id) await prisma.location.update({ where: { id }, data: { ...data, operatingHoursJson } });
  else await prisma.location.create({ data: { ...data, operatingHoursJson } });
  await setFlash(`Location ${id ? "updated" : "created"} successfully.`);
  revalidatePath("/settings");
  redirectAfterSave(formData);
}

export async function deleteLocation(id: string) {
  const staff = await getCurrentStaff();
  if (staff.role !== Role.SUPER_ADMIN) throw new Error("Only Super Admin can delete locations.");
  await prisma.location.delete({ where: { id } });
  await setFlash("Location deleted successfully.");
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
  await setFlash("Location switched successfully.");
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
  await setFlash("Password updated successfully.");
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
