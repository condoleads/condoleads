// lib/platform/auth.ts
import { createServerClient } from '@/lib/supabase/server'

export interface PlatformAdminUser {
  id: string
  userId: string
  name: string
  email: string
  grantedAt: string
}

export async function resolvePlatformAdmin(): Promise<PlatformAdminUser | null> {
  const supabase = await createServerClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()

  console.log('[platform.auth] getUser -->', {
    hasUser: !!user,
    userId: user?.id,
    userEmail: user?.email,
    userErr: userErr?.message,
  })

  if (!user) return null

  const { data: admin, error: adminErr } = await supabase
    .from('platform_admins')
    .select('id, user_id, email, full_name, granted_at, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  console.log('[platform.auth] platform_admins lookup -->', {
    found: !!admin,
    adminId: admin?.id,
    adminEmail: admin?.email,
    adminErr: adminErr?.message,
  })

  if (!admin) return null

  return {
    id: admin.id,
    userId: admin.user_id,
    name: admin.full_name,
    email: admin.email,
    grantedAt: admin.granted_at,
  }
}
