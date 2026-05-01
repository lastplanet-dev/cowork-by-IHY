# Cowork by IHY

Full-stack coworking operations MVP for a Community Host and Admin team.

## What is included

- Dashboard for daily check-ins, active users, bookings, renewals, sales, pending payments, credits, and activity.
- Customer profiles with pass balance, renewal history, payments, bookings, check-ins, and coffee upgrades.
- Pass type management with the default 1, 5, 10 day, and monthly packages.
- Check-in workflow that deducts one coworking day, shows WiFi, records free coffee, and can add a 2,500 MMK upgrade.
- Room booking workflow with double-booking protection, meeting credit consumption, focus room active-pass rule, and training room paid rule.
- Coffee/POS module, room settings, payment adjustment logging, staff roles, settings, and reports.

## Local setup

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

The app uses SQLite for local development through `DATABASE_URL="file:./dev.db"`.

## Roles

- Super Admin: full access, staff/settings management, payment edits/voids, and payment adjustment history.
- Admin / Community Host: daily operations, customers, renewals, bookings, check-ins, coffee/POS, discounts, and sales summaries.

## Notes

The current authentication layer is intentionally lightweight for the MVP. The server actions use the seeded Super Admin as the current staff user so the workflows can be tested locally before adding login/session management.
