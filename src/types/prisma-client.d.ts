declare module "@prisma/client" {
  export class PrismaClient {
    [key: string]: any;
    constructor(...args: any[]);
    $disconnect(): Promise<void>;
    $transaction(...args: any[]): Promise<any>;
  }

  export enum Role {
    SUPER_ADMIN = "SUPER_ADMIN",
    ADMIN = "ADMIN"
  }

  export enum CustomerType {
    INDIVIDUAL = "INDIVIDUAL",
    PARTNER_ORGANIZATION = "PARTNER_ORGANIZATION",
    CORPORATE = "CORPORATE",
    WALK_IN = "WALK_IN"
  }

  export enum PaymentMethod {
    CASH = "CASH",
    KBZPAY = "KBZPAY",
    WAVEPAY = "WAVEPAY",
    BANK_TRANSFER = "BANK_TRANSFER",
    CARD = "CARD",
    OTHER = "OTHER"
  }

  export enum PaymentStatus {
    UNPAID = "UNPAID",
    PAID = "PAID",
    PARTIALLY_PAID = "PARTIALLY_PAID",
    WAIVED = "WAIVED",
    VOID = "VOID"
  }

  export enum DiscountType {
    PERCENTAGE = "PERCENTAGE",
    FIXED_AMOUNT = "FIXED_AMOUNT"
  }

  export enum RoomType {
    MEETING_ROOM = "MEETING_ROOM",
    TRAINING_ROOM = "TRAINING_ROOM",
    FOCUS_ROOM = "FOCUS_ROOM",
    PHONE_BOOTH = "PHONE_BOOTH"
  }

  export enum BookingStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED"
  }

  export enum CoffeeKind {
    FREE_ENTITLEMENT = "FREE_ENTITLEMENT",
    UPGRADE = "UPGRADE",
    PAID_ITEM = "PAID_ITEM"
  }

  export enum PaymentFor {
    PASS = "PASS",
    BOOKING = "BOOKING",
    COFFEE = "COFFEE",
    UPGRADE = "UPGRADE",
    MANUAL = "MANUAL"
  }
}
