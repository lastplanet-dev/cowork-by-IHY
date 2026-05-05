import Link from "next/link";
import { cookies, headers } from "next/headers";
import { CalendarDays, CreditCard, Gauge, KeyRound, Settings, Users, DoorOpen, UserCircle } from "lucide-react";
import { FlashMessage } from "@/components/FlashMessage";

const nav = [
  ["/dashboard", "Dashboard", Gauge],
  ["/customers", "Customers", Users],
  ["/check-in", "Check-in", KeyRound],
  ["/bookings", "Bookings", DoorOpen],
  ["/calendar", "Calendar", CalendarDays],
  ["/payments", "Payments", CreditCard],
  ["/reports", "Reports", Gauge],
  ["/settings", "Settings", Settings],
  ["/profile", "Profile", UserCircle]
] as const;

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const pathname = headerStore.get("x-cowork-pathname") ?? "";
  const isLoggedIn = Boolean(cookieStore.get("coworkStaffId")?.value);
  const flashMessage = cookieStore.get("coworkFlash")?.value;
  const flashType = cookieStore.get("coworkFlashType")?.value === "danger" ? "danger" : "ok";
  const isAuthPage = pathname === "/" || pathname.startsWith("/login");
  if (!isLoggedIn || isAuthPage) return <main className="auth-main"><FlashMessage message={flashMessage ? decodeURIComponent(flashMessage) : undefined} type={flashType} />{children}</main>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/impact-hub-yangon-white.png" alt="Impact Hub Yangon" className="brand-logo" />
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
      <main className="main"><FlashMessage message={flashMessage ? decodeURIComponent(flashMessage) : undefined} type={flashType} />{children}</main>
    </div>
  );
}
