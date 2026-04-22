// lib/paddle/prices.ts
// Paddle price ID constants + plan bundles
// All IDs read from NEXT_PUBLIC_PADDLE_PRICE_* env vars
// Values are trimmed defensively — env vars piped from PowerShell can have trailing \r\n

const trim = (v: string | undefined): string => (v || '').trim()

export const PADDLE_PRICES = {
  SOLO_STARTER: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_STARTER),
  SOLO_PREMIUM: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_PREMIUM),
  TEAM_STARTER: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_STARTER),
  TEAM_PREMIUM: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_PREMIUM),
  ENTERPRISE: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE),
  SOLO_SETUP: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_SETUP),
  TEAM_SETUP: trim(process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_SETUP),
} as const

export type PaddlePriceKey = keyof typeof PADDLE_PRICES

export const PLAN_BUNDLES = {
  soloStarter: [PADDLE_PRICES.SOLO_SETUP, PADDLE_PRICES.SOLO_STARTER],
  soloPremium: [PADDLE_PRICES.SOLO_SETUP, PADDLE_PRICES.SOLO_PREMIUM],
  teamStarter: [PADDLE_PRICES.TEAM_SETUP, PADDLE_PRICES.TEAM_STARTER],
  teamPremium: [PADDLE_PRICES.TEAM_SETUP, PADDLE_PRICES.TEAM_PREMIUM],
  enterprise: [PADDLE_PRICES.ENTERPRISE],
} as const

export type PlanKey = keyof typeof PLAN_BUNDLES

export function validatePaddlePrices(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  for (const [key, value] of Object.entries(PADDLE_PRICES)) {
    if (!value) missing.push(key)
  }
  return { ok: missing.length === 0, missing }
}