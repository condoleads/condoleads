const fs = require('fs')
const path = 'C:/Condoleads/project/app/api/admin-homes/agents/route.ts'
const original = fs.readFileSync(path, 'utf8')
const useCRLF = original.includes('\r\n')

if (original.includes("from '@/lib/admin-homes/service-client'")) {
  console.log('[SKIP] already uses service-client utility')
  process.exit(0)
}

let content = original.replace(/\r\n/g, '\n')

const oldBlock = `import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}`

const newBlock = `import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can } from '@/lib/admin-homes/permissions'`

if (!content.includes(oldBlock)) { console.error('[FAIL] OLD block not found'); process.exit(1) }
if (content.split(oldBlock).length - 1 > 1) { console.error('[FAIL] OLD block not unique'); process.exit(1) }
content = content.replace(oldBlock, newBlock)

const final = useCRLF ? content.replace(/\n/g, '\r\n') : content
fs.writeFileSync(path, final, 'utf8')
console.log('Written ' + path)
console.log('Bytes: ' + original.length + ' -> ' + final.length + ' (delta ' + (final.length - original.length) + ')')