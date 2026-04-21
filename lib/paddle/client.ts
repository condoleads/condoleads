// lib/paddle/client.ts
// Paddle.js singleton initializer for browser-side checkout overlay
import { initializePaddle, type Paddle } from '@paddle/paddle-js'

let paddleInstance: Paddle | undefined

export async function getPaddle(): Promise<Paddle | undefined> {
  if (paddleInstance) return paddleInstance

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  const env = (process.env.NEXT_PUBLIC_PADDLE_ENV || 'production') as 'sandbox' | 'production'

  if (!token) {
    console.error('[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set')
    return undefined
  }

  try {
    paddleInstance = await initializePaddle({
      environment: env,
      token,
    })
    return paddleInstance
  } catch (err) {
    console.error('[Paddle] initializePaddle failed:', err)
    return undefined
  }
}