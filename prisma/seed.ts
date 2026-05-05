import { addDays, addHours, setHours, setMinutes } from "date-fns";
import { PrismaClient, Role, CustomerType, CoffeeKind, PaymentMethod, PaymentStatus, PaymentFor } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.paymentAdjustment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.coworkingBooking.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.coffeeSale.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.membershipPurchase.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomTypeSetting.deleteMany();
  await prisma.coffeeItem.deleteMany();
  await prisma.passType.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.location.deleteMany();
  await prisma.setting.deleteMany();

  const [downtown, riverside] = await Promise.all([
    prisma.location.create({ data: { name: "IHY Downtown", address: "Main coworking space", phone: "09 111 222 333", coworkingSeatCapacity: 30 } }),
    prisma.location.create({ data: { name: "IHY Riverside", address: "Second coworking space", phone: "09 444 555 666", coworkingSeatCapacity: 18 } })
  ]);

  const [owner, host] = await Promise.all([
    prisma.staffUser.create({
      data: { locationId: downtown.id, name: "IHY Owner", email: "owner@ihy.local", passwordHash: "local-demo:changeme", role: Role.SUPER_ADMIN, canSettings: true }
    }),
    prisma.staffUser.create({
      data: { locationId: downtown.id, name: "Community Host", email: "host@ihy.local", passwordHash: "local-demo:changeme", role: Role.ADMIN }
    })
  ]);

  const passes = await prisma.$transaction([
    prisma.passType.create({ data: { locationId: downtown.id, name: "1 Day Pass", price: 15000, coworkingDays: 1, validityDays: 1, meetingCreditHours: 0, freeCoffeePerCheckIn: 1 } }),
    prisma.passType.create({ data: { locationId: downtown.id, name: "5 Days Pass", price: 65000, coworkingDays: 5, validityDays: 30, meetingCreditHours: 1, freeCoffeePerCheckIn: 1 } }),
    prisma.passType.create({ data: { locationId: downtown.id, name: "10 Days Pass", price: 120000, coworkingDays: 10, validityDays: 45, meetingCreditHours: 2, freeCoffeePerCheckIn: 1 } }),
    prisma.passType.create({ data: { locationId: downtown.id, name: "1 Month Pass", price: 220000, coworkingDays: 20, validityDays: 30, meetingCreditHours: 4, freeCoffeePerCheckIn: 1 } }),
    prisma.passType.create({ data: { locationId: riverside.id, name: "Riverside Day Pass", price: 12000, coworkingDays: 1, validityDays: 1, meetingCreditHours: 0, freeCoffeePerCheckIn: 1 } })
  ]);

  await prisma.roomTypeSetting.createMany({
    data: [
      { locationId: downtown.id, name: "Meeting Room", description: "Small or medium meeting spaces" },
      { locationId: downtown.id, name: "Training Room", description: "Larger event and training spaces" },
      { locationId: downtown.id, name: "Focus Room", description: "Quiet private work room" },
      { locationId: downtown.id, name: "Phone Booth", description: "Short calls and private phone use" },
      { locationId: riverside.id, name: "Meeting Room", description: "Riverside meeting spaces" }
    ]
  });

  const [meetingRoom, trainingRoom, focusRoom, booth] = await prisma.$transaction([
    prisma.room.create({ data: { locationId: downtown.id, name: "Meeting Room A", roomType: "Meeting Room", capacity: 8, hourlyRate: 25000, halfDayRate: 90000, fullDayRate: 160000, creditsCanBeUsed: true, minBookingMinutes: 60, bufferMinutes: 15 } }),
    prisma.room.create({ data: { locationId: downtown.id, name: "Training Room", roomType: "Training Room", capacity: 24, hourlyRate: 60000, halfDayRate: 220000, fullDayRate: 400000, creditsCanBeUsed: false, minBookingMinutes: 120, bufferMinutes: 30 } }),
    prisma.room.create({ data: { locationId: downtown.id, name: "Focus Room 1", roomType: "Focus Room", capacity: 1, hourlyRate: 0, creditsCanBeUsed: false, minBookingMinutes: 30, bufferMinutes: 0 } }),
    prisma.room.create({ data: { locationId: downtown.id, name: "Phone Booth", roomType: "Phone Booth", capacity: 1, hourlyRate: 0, creditsCanBeUsed: false, minBookingMinutes: 30, bufferMinutes: 0 } })
  ]);
  await prisma.room.create({ data: { locationId: riverside.id, name: "Riverside Meeting Room", roomType: "Meeting Room", capacity: 6, hourlyRate: 20000, halfDayRate: 75000, fullDayRate: 140000, creditsCanBeUsed: true } });

  const [blackCoffee, milkUpgrade, americano] = await prisma.$transaction([
    prisma.coffeeItem.create({ data: { locationId: downtown.id, name: "Free black coffee", price: 0, kind: CoffeeKind.FREE_ENTITLEMENT } }),
    prisma.coffeeItem.create({ data: { locationId: downtown.id, name: "Milk-based coffee upgrade", price: 2500, kind: CoffeeKind.UPGRADE } }),
    prisma.coffeeItem.create({ data: { locationId: downtown.id, name: "Americano", price: 3500, kind: CoffeeKind.PAID_ITEM } })
  ]);
  await prisma.coffeeItem.create({ data: { locationId: riverside.id, name: "Riverside free coffee", price: 0, kind: CoffeeKind.FREE_ENTITLEMENT } });

  const today = new Date();
  const [maya, koAung, thiri] = await Promise.all([
    prisma.customer.create({
      data: {
        fullName: "Maya Chen",
        customerCode: "IHY-00001",
        locationId: downtown.id,
        phone: "09 420 100 200",
        email: "maya@example.com",
        organization: "NexLab",
        customerType: CustomerType.CORPORATE,
        activePassName: "10 Days Pass",
        remainingCoworkingDays: 10,
        remainingMeetingCreditHours: 2,
        membershipExpiresAt: addDays(today, 42),
        notes: "Prefers quiet area."
      }
    }),
    prisma.customer.create({
      data: {
        fullName: "Ko Aung Min",
        customerCode: "IHY-00002",
        locationId: downtown.id,
        phone: "09 777 111 222",
        email: "aung@example.com",
        customerType: CustomerType.INDIVIDUAL,
        activePassName: "5 Days Pass",
        remainingCoworkingDays: 2,
        remainingMeetingCreditHours: 0.5,
        membershipExpiresAt: addDays(today, 5)
      }
    }),
    prisma.customer.create({
      data: {
        fullName: "Thiri Htun",
        customerCode: "IHY-00003",
        locationId: downtown.id,
        phone: "09 900 333 444",
        organization: "Partner Hub",
        customerType: CustomerType.PARTNER_ORGANIZATION,
        activePassName: "1 Month Pass",
        remainingCoworkingDays: 0,
        remainingMeetingCreditHours: 0,
        membershipExpiresAt: addDays(today, -2),
        notes: "Renewal follow-up needed."
      }
    })
  ]);

  await prisma.membershipPurchase.create({
    data: {
      customerId: maya.id,
      passTypeId: passes[2].id,
      passName: passes[2].name,
      priceBeforeDiscount: passes[2].price,
      finalPrice: passes[2].price,
      coworkingDaysAdded: 10,
      meetingCreditHoursAdded: 2,
      expiresAt: addDays(today, passes[2].validityDays),
      payment: {
        create: {
          customerId: maya.id,
          paymentFor: PaymentFor.PASS,
          amount: passes[2].price,
          method: PaymentMethod.KBZPAY,
          status: PaymentStatus.PAID,
          receivedById: host.id,
          receiptNumber: "IHY-0001"
        }
      }
    }
  });

  await prisma.$transaction([
    prisma.checkIn.create({
      data: {
        customerId: koAung.id,
        checkedInAt: setMinutes(setHours(today, 9), 15),
        wifiPasswordShown: "IHY-Cowork-2026",
        coffeeSales: { create: { customerId: koAung.id, coffeeItemId: blackCoffee.id, unitPrice: 0, finalAmount: 0 } }
      }
    }),
    prisma.customer.update({ where: { id: koAung.id }, data: { remainingCoworkingDays: 1, isInside: true } })
  ]);

  const start = setMinutes(setHours(today, 14), 0);
  await prisma.booking.create({
    data: {
      customerId: maya.id,
      roomId: meetingRoom.id,
      roomType: meetingRoom.roomType,
      startsAt: start,
      endsAt: addHours(start, 2),
      durationHours: 2,
      priceBeforeDiscount: 50000,
      finalPrice: 0,
      creditHoursUsed: 2,
      paymentStatus: PaymentStatus.WAIVED,
      status: "CONFIRMED",
      notes: "Uses included credits."
    }
  });

  await prisma.booking.create({
    data: {
      customerId: koAung.id,
      roomId: focusRoom.id,
      roomType: focusRoom.roomType,
      startsAt: setMinutes(setHours(today, 11), 0),
      endsAt: setMinutes(setHours(today, 11), 30),
      durationHours: 0.5,
      priceBeforeDiscount: 0,
      finalPrice: 0,
      paymentStatus: PaymentStatus.WAIVED,
      status: "CONFIRMED"
    }
  });

  await prisma.booking.create({
    data: {
      customerId: maya.id,
      roomId: trainingRoom.id,
      roomType: trainingRoom.roomType,
      startsAt: addDays(setMinutes(setHours(today, 10), 0), 1),
      endsAt: addDays(setMinutes(setHours(today, 14), 0), 1),
      durationHours: 4,
      priceBeforeDiscount: 220000,
      finalPrice: 220000,
      paymentStatus: PaymentStatus.UNPAID,
      status: "PENDING"
    }
  });

  await prisma.coworkingBooking.createMany({
    data: [
      { locationId: downtown.id, customerId: maya.id, bookingDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()), notes: "Reserved a hot desk." },
      { locationId: downtown.id, customerId: koAung.id, bookingDate: new Date(today.getFullYear(), today.getMonth(), today.getDate()), status: "CHECKED_IN", notes: "Arrived in the morning." }
    ]
  });

  await prisma.setting.createMany({
    data: [
      { key: "wifiPassword", value: "IHY-Cowork-2026" },
      { key: "activeLocationId", value: downtown.id },
      { key: "paymentMethods", value: "cash,KBZPay,WavePay,bank transfer,card,other" },
      { key: "discountReasons", value: "partner discount,long-hour rental,manual adjustment,promotion" },
      { key: "allowMeetingCreditsForTraining", value: "false" }
    ]
  });

  await prisma.activityLog.createMany({
    data: [
      { staffId: owner.id, message: "Created Cowork by IHY workspace settings", entity: "settings" },
      { staffId: host.id, message: "Checked in Ko Aung Min", entity: "check-in", entityId: koAung.id },
      { staffId: host.id, message: "Booked Meeting Room A for Maya Chen", entity: "booking", entityId: maya.id },
      { staffId: host.id, message: "Added sample coffee menu", entity: "coffee", entityId: americano.id },
      { staffId: host.id, message: "Phone Booth ready for bookings", entity: "room", entityId: booth.id }
    ]
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
