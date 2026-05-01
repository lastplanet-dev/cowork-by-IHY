import Link from "next/link";
import { CalendarDays, Coffee, CreditCard, Gauge, KeyRound, LayoutGrid, Settings, Users, UserCog, DoorOpen, BadgeDollarSign } from "lucide-react";

const nav = [
  ["/dashboard", "Dashboard", Gauge],
  ["/customers", "Customers", Users],
  ["/check-in", "Check-in", KeyRound],
  ["/passes", "Passes", BadgeDollarSign],
  ["/bookings", "Bookings", DoorOpen],
  ["/calendar", "Calendar", CalendarDays],
  ["/rooms", "Rooms", LayoutGrid],
  ["/coffee", "Coffee", Coffee],
  ["/payments", "Payments", CreditCard],
  ["/reports", "Reports", Gauge],
  ["/settings", "Settings", Settings],
  ["/staff", "Staff", UserCog]
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">IHY</div>
          <div>
            <strong>Cowork by IHY</strong>
            <span>Operations console</span>
          </div>
        </div>
        <div className="nav-caption">Workspace</div>
        <nav className="nav" aria-label="Main navigation">
          {nav.map(([href, label, Icon]) => (
            <Link href={href} key={href}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
