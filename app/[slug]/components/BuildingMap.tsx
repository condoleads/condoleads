'use client'

import { useEffect, useRef } from 'react'

interface BuildingMapProps {
  latitude: number | null
  longitude: number | null
  buildingName: string
  address: string
}

export default function BuildingMap({ latitude, longitude, buildingName, address }: BuildingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    // Don't render map if coordinates are missing
    if (!latitude || !longitude || typeof window === 'undefined' || !mapRef.current) return

    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      // Fix for default marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      })

      if (!mapInstanceRef.current) {
  const map = L.map(mapRef.current, {
    scrollWheelZoom: false  // Disable scroll zoom
  }).setView([latitude, longitude], 15)
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  
  L.marker([latitude, longitude])
    .addTo(map)
    .bindPopup(`<b>${buildingName}</b><br>${address}`)
    .openPopup()
  
  mapInstanceRef.current = map
  
  // Optional: Enable scroll zoom when user clicks on the map
  map.on('click', function() {
    map.scrollWheelZoom.enable()
  })
  
  // Disable scroll zoom when mouse leaves the map
  map.on('mouseout', function() {
    map.scrollWheelZoom.disable()
  })
}
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [latitude, longitude, buildingName, address])

  // Don't render if no coordinates
  if (!latitude || !longitude) {
    return null
  }

  return (
    <section className="py-16 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-slate-900 mb-8">Location</h2>
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div ref={mapRef} className="w-full h-[500px]"></div>
          <div className="p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">{buildingName}</h3>
            <p className="text-slate-600">{address}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
