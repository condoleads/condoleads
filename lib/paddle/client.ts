// lib/paddle/client.ts
// Paddle.js singleton initializer for browser-side checkout overlay
import { initializePaddle, type Paddle } from '@paddle/paddle-js'

let paddleInstance: Paddle | undefined

export async function getPaddle(): Promise<Paddle | undefined> {
  if (paddleInstance) return paddleInstance

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  if (!token) {
    console.error('[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set')
    return undefined
  }

  // Trim whitespace/newlines defensively (env vars piped from PowerShell can have trailing \r\n)
  const envRaw = (process.env.NEXT_PUBLIC_PADDLE_ENV || '').trim().toLowerCase()
  const isSandbox = envRaw === 'sandbox'

  try {
    // Only pass environment when explicitly sandbox; production is Paddle's default
    // when the field is omitted. This avoids "undefined checkoutFrontEndBase" errors
    // caused by unrecognized environment strings.
    const initOptions: Parameters<typeof initializePaddle>[0] = { token }
    if (isSandbox) {
      initOptions.environment = 'sandbox'
    }

    paddleInstance = await initializePaddle(initOptions)
    return paddleInstance
  } catch (err) {
    console.error('[Paddle] initializePaddle failed:', err)
    return undefined
  }
}