// app/charlie/components/AppointmentForm.tsx
// Appointment booking form for WALLiam Charlie plans
// Buyer: property selection + date/time
// Seller: date/time only
// Pre-fills user data from Supabase profile
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenantId } from '@/hooks/useTenantId'

interface Props {
  type: 'buyer' | 'seller'
  listings?: any[]
  userId?: string | null
  sessionId?: string | null
  geoContext?: { geoType: string; geoId: string; geoName: string } | null
  agent?: { name: string; email?: string; phone?: string; photo?: string; brokerage?: string } | null
  onBooked: () => void
}

const TIME_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function getAvailableDates(): Date[] {
  const dates: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 1; i <= 30; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    if (d.getDay() !== 0) dates.push(d) // exclude Sundays
  }
  return dates
}

export default function AppointmentForm({ type, listings = [], userId, sessionId, geoContext, agent, onBooked }: Props) {
  const tenantId = useTenantId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [selectedListings, setSelectedListings] = useState<string[]>([])
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [profileLoaded, setProfileLoaded] = useState(false)

  // Pre-fill user data
  useEffect(() => {
    if (!userId || profileLoaded) return
    const supabase = createClient()
    Promise.all([
      supabase.auth.getUser(),
      supabase.from('user_profiles').select('full_name, phone').eq('id', userId).single()
    ]).then(([{ data: authData }, { data: profile }]) => {
      if (authData?.user?.email) setEmail(authData.user.email)
      if (profile?.full_name) setName(profile.full_name)
      if (profile?.phone) setPhone(profile.phone)
      setProfileLoaded(true)
    })
  }, [userId, profileLoaded])

  const availableDates = getAvailableDates()
  const calYear = calendarMonth.getFullYear()
  const calMonth = calendarMonth.getMonth()

  // Calendar grid
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const availableInMonth = availableDates.filter(d => d.getMonth() === calMonth && d.getFullYear() === calYear)
  const availableDayNums = new Set(availableInMonth.map(d => d.getDate()))

  function toggleListing(key: string) {
    setSelectedListings(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function prevMonth() {
    const d = new Date(calendarMonth)
    d.setMonth(d.getMonth() - 1)
    const today = new Date(); today.setHours(0,0,0,0)
    if (d.getMonth() >= today.getMonth() || d.getFullYear() > today.getFullYear()) {
      setCalendarMonth(d)
    }
  }

  function nextMonth() {
    const d = new Date(calendarMonth)
    d.setMonth(d.getMonth() + 1)
    const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 30)
    if (d <= maxDate) setCalendarMonth(d)
  }

  async function handleSubmit() {
    if (!tenantId) { setError('Still loading — please try again in a moment'); return }
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    if (!selectedDate) { setError('Please select a date'); return }
    if (!selectedTime) { setError('Please select a time slot'); return }
    if (type === 'buyer' && selectedListings.length === 0) { setError('Please select at least one property to view'); return }

    setSubmitting(true); setError('')

    const selectedProps = listings
      .filter(l => selectedListings.includes(l.listing_key || l.id))
      .map(l => ({
        listing_key: l.listing_key,
        address: l.unparsed_address,
        price: l.list_price,
        slug: l._slug || null,
      }))

    try {
      const res = await fetch('/api/charlie/appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          intent: type,
          appointment_date: selectedDate.toISOString().split('T')[0],
          appointment_time: selectedTime,
          appointment_properties: type === 'buyer' ? selectedProps : null,
          sessionId: sessionId || null,
          userId: userId || null,
          community_id: geoContext?.geoType === 'community' ? geoContext.geoId : null,
          municipality_id: geoContext?.geoType === 'municipality' ? geoContext.geoId : null,
          area_id: geoContext?.geoType === 'area' ? geoContext.geoId : null,
          geo_name: geoContext?.geoName || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        onBooked()
      } else {
        setError(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const s: Record<string, React.CSSProperties> = {
    section: { marginBottom: 20 },
    label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, marginBottom: 10, display: 'block' },
    input: { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
  }

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        {type === 'buyer' ? '🏠 Book a Viewing' : '📋 Book a Consultation'}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
        {type === 'buyer'
          ? 'Select the properties you want to visit and pick a time.'
          : 'Pick a time for your free CMA consultation with your agent.'}
      </div>

      {/* Contact */}
      <div style={s.section}>
        <span style={s.label}>Your Details</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={s.input} type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          <input style={s.input} type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={s.input} type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>

      {/* Property selection — buyer only */}
      {type === 'buyer' && listings.length > 0 && (
        <div style={s.section}>
          <span style={s.label}>Properties to View</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {listings.slice(0, 5).map((l: any) => {
              const key = l.listing_key || l.id
              const selected = selectedListings.includes(key)
              return (
                <div
                  key={key}
                  onClick={() => toggleListing(key)}
                  style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${selected ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                    background: selected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `2px solid ${selected ? '#3b82f6' : 'rgba(255,255,255,0.2)'}`,
                    background: selected ? '#3b82f6' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.unparsed_address?.split(',')[0] || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                      {l.bedrooms_total} bed · {l.bathrooms_total_integer} bath
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
                    ${l.list_price?.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div style={s.section}>
        <span style={s.label}>Select a Date</span>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, padding: '0 8px' }}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{MONTHS[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, padding: '0 8px' }}>›</button>
          </div>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 700, padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1
              const available = availableDayNums.has(dayNum)
              const thisDate = new Date(calYear, calMonth, dayNum)
              const isSelected = selectedDate?.toDateString() === thisDate.toDateString()
              return (
                <div
                  key={dayNum}
                  onClick={() => available && setSelectedDate(thisDate)}
                  style={{ display: 'flex', justifyContent: 'center' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: isSelected ? 700 : 400, cursor: available ? 'pointer' : 'default', background: isSelected ? '#3b82f6' : 'transparent', color: isSelected ? '#fff' : available ? '#fff' : 'rgba(255,255,255,0.15)', border: '1px solid transparent' }}>{dayNum}</div>
                </div>
              )
            })}
          </div>
          {selectedDate && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#3b82f6', textAlign: 'center', fontWeight: 600 }}>
              {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()}
            </div>
          )}
        </div>
      </div>

      {/* Time slots */}
      <div style={s.section}>
        <span style={s.label}>Select a Time</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TIME_SLOTS.map(slot => (
            <button key={slot} onClick={() => setSelectedTime(slot)} style={{ padding: '8px 14px', borderRadius: 100, border: `1px solid ${selectedTime === slot ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`, background: selectedTime === slot ? 'rgba(59,130,246,0.2)' : 'transparent', color: selectedTime === slot ? '#93c5fd' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: selectedTime === slot ? 700 : 400, cursor: 'pointer' }}>
              {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{error}</div>}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%', padding: 14, borderRadius: 12, border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
          background: submitting ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #1d4ed8, #4f46e5)',
          color: '#fff', fontSize: 14, fontWeight: 700, opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Booking...' : type === 'buyer' ? '📅 Book My Viewing' : '📅 Book My Consultation'}
      </button>
    </div>
  )
}