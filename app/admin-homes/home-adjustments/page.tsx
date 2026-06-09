// app/admin-homes/home-adjustments/page.tsx
//
// v10 step 3 Phase 1: System 2 admin entry for per-tenant home adjustment
// overrides. Mirrors the shape of app/admin/adjustments/page.tsx (the System 1
// condo version) — but at /admin-homes/* and tenant-scoped.

import HomeAdjustmentsManager from '@/components/admin-homes/HomeAdjustmentsManager'

export default function HomeAdjustmentsPage() {
  return (
    <div className="p-8">
      <HomeAdjustmentsManager />
    </div>
  )
}
