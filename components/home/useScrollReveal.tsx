'use client'

import { useEffect, useRef, useState } from 'react'

interface ScrollRevealOptions {
  threshold?: number
  delay?: number
  once?: boolean
}

export function useScrollReveal({ threshold = 0.15, delay = 0, once = true }: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => setIsVisible(true), delay)
          } else {
            setIsVisible(true)
          }
          if (once) observer.unobserve(el)
        } else if (!once) {
          setIsVisible(false)
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, delay, once])

  return { ref, isVisible }
}

export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right'
}) {
  const { ref, isVisible } = useScrollReveal({ delay })

  const transforms: Record<string, string> = {
    up: 'translateY(30px)',
    down: 'translateY(-30px)',
    left: 'translateX(30px)',
    right: 'translateX(-30px)',
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translate(0)' : transforms[direction],
        transition: `opacity 0.6s ease-out, transform 0.6s ease-out`,
      }}
    >
      {children}
    </div>
  )
}