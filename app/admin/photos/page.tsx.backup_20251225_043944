'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Image, Upload, Check, X, Search } from 'lucide-react'

interface Building {
  id: string
  building_name: string
  slug: string
  cover_photo_url: string | null
  development_id: string | null
}

interface Development {
  id: string
  name: string
  slug: string
  cover_photo_url: string | null
}

interface ListingPhoto {
  media_url: string
  listing_id: string
}

export default function PhotoManagementPage() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [developments, setDevelopments] = useState<Development[]>([])
  const [selectedItem, setSelectedItem] = useState<{ type: 'building' | 'development'; id: string; name: string; currentPhoto: string | null } | null>(null)
  const [availablePhotos, setAvailablePhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'buildings' | 'developments'>('buildings')
  const [customUrl, setCustomUrl] = useState('')
  
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    
    const { data: buildingsData } = await supabase
      .from('buildings')
      .select('id, building_name, slug, cover_photo_url, development_id')
      .order('building_name')
    
    const { data: developmentsData } = await supabase
      .from('developments')
      .select('id, name, slug, cover_photo_url')
      .order('name')
    
    setBuildings(buildingsData || [])
    setDevelopments(developmentsData || [])
    setLoading(false)
  }

  async function selectItem(type: 'building' | 'development', id: string, name: string, currentPhoto: string | null) {
    setSelectedItem({ type, id, name, currentPhoto })
    setCustomUrl(currentPhoto || '')
    setAvailablePhotos([])

    if (type === 'building') {
      // Get photos from building's listings
      const { data: listings } = await supabase
        .from('mls_listings')
        .select('id')
        .eq('building_id', id)
      
      if (listings && listings.length > 0) {
        const listingIds = listings.map(l => l.id)
        const { data: photos } = await supabase
          .from('media')
          .select('media_url')
          .in('listing_id', listingIds)
          .eq('variant_type', 'large')
          .order('preferred_photo_yn', { ascending: false })
          .limit(20)
        
        const uniquePhotos = [...new Set((photos || []).map(p => p.media_url))]
        setAvailablePhotos(uniquePhotos)
      }
    } else {
      // Get photos from development's buildings' listings
      const { data: devBuildings } = await supabase
        .from('buildings')
        .select('id')
        .eq('development_id', id)
      
      if (devBuildings && devBuildings.length > 0) {
        const buildingIds = devBuildings.map(b => b.id)
        const { data: listings } = await supabase
          .from('mls_listings')
          .select('id')
          .in('building_id', buildingIds)
        
        if (listings && listings.length > 0) {
          const listingIds = listings.map(l => l.id)
          const { data: photos } = await supabase
            .from('media')
            .select('media_url')
            .in('listing_id', listingIds)
            .eq('variant_type', 'large')
            .order('preferred_photo_yn', { ascending: false })
            .limit(30)
          
          const uniquePhotos = [...new Set((photos || []).map(p => p.media_url))]
          setAvailablePhotos(uniquePhotos)
        }
      }
    }
  }

  async function saveCoverPhoto(photoUrl: string | null) {
    if (!selectedItem) return
    setSaving(true)

    const table = selectedItem.type === 'building' ? 'buildings' : 'developments'
    
    const { error } = await supabase
      .from(table)
      .update({ cover_photo_url: photoUrl })
      .eq('id', selectedItem.id)

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      // Update local state
      if (selectedItem.type === 'building') {
        setBuildings(prev => prev.map(b => 
          b.id === selectedItem.id ? { ...b, cover_photo_url: photoUrl } : b
        ))
      } else {
        setDevelopments(prev => prev.map(d => 
          d.id === selectedItem.id ? { ...d, cover_photo_url: photoUrl } : d
        ))
      }
      setSelectedItem({ ...selectedItem, currentPhoto: photoUrl })
      alert('Cover photo updated!')
    }
    setSaving(false)
  }

  const filteredBuildings = buildings.filter(b => 
    b.building_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredDevelopments = developments.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Photo Management</h1>
        <p className="text-gray-600 mt-2">Manage cover photos for buildings and developments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: List */}
        <div className="bg-white rounded-lg shadow p-6">
          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('buildings')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'buildings' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Buildings ({buildings.length})
            </button>
            <button
              onClick={() => setActiveTab('developments')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'developments' 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Developments ({developments.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {activeTab === 'buildings' ? (
              filteredBuildings.map(building => (
                <button
                  key={building.id}
                  onClick={() => selectItem('building', building.id, building.building_name, building.cover_photo_url)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedItem?.id === building.id 
                      ? 'bg-blue-50 border-2 border-blue-500' 
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {building.cover_photo_url ? (
                      <img src={building.cover_photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{building.building_name}</p>
                    <p className="text-xs text-gray-500">
                      {building.cover_photo_url ? '✓ Has cover photo' : 'No cover photo'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              filteredDevelopments.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => selectItem('development', dev.id, dev.name, dev.cover_photo_url)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedItem?.id === dev.id 
                      ? 'bg-purple-50 border-2 border-purple-500' 
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {dev.cover_photo_url ? (
                      <img src={dev.cover_photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{dev.name}</p>
                    <p className="text-xs text-gray-500">
                      {dev.cover_photo_url ? '✓ Has cover photo' : 'No cover photo'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Photo Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          {selectedItem ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{selectedItem.name}</h2>
              <p className="text-sm text-gray-500 mb-4">
                {selectedItem.type === 'building' ? 'Building' : 'Development'}
              </p>

              {/* Current Cover Photo */}
              <div className="mb-6">
                <h3 className="font-medium text-gray-700 mb-2">Current Cover Photo</h3>
                <div className="w-full h-48 rounded-lg overflow-hidden bg-gray-100 border-2 border-dashed border-gray-300">
                  {selectedItem.currentPhoto ? (
                    <img src={selectedItem.currentPhoto} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <Image className="w-12 h-12 mx-auto mb-2" />
                        <p>No cover photo set</p>
                      </div>
                    </div>
                  )}
                </div>
                {selectedItem.currentPhoto && (
                  <button
                    onClick={() => saveCoverPhoto(null)}
                    disabled={saving}
                    className="mt-2 text-sm text-red-600 hover:text-red-700"
                  >
                    Remove cover photo
                  </button>
                )}
              </div>

              {/* Custom URL */}
              <div className="mb-6">
                <h3 className="font-medium text-gray-700 mb-2">Custom Photo URL</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://example.com/photo.jpg"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  />
                  <button
                    onClick={() => saveCoverPhoto(customUrl)}
                    disabled={saving || !customUrl}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {saving ? '...' : 'Set'}
                  </button>
                </div>
              </div>

              {/* Available Photos from Listings */}
              <div>
                <h3 className="font-medium text-gray-700 mb-2">
                  Available Photos from Listings ({availablePhotos.length})
                </h3>
                {availablePhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                    {availablePhotos.map((photo, idx) => (
                      <button
                        key={idx}
                        onClick={() => saveCoverPhoto(photo)}
                        disabled={saving}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          selectedItem.currentPhoto === photo 
                            ? 'border-green-500 ring-2 ring-green-200' 
                            : 'border-transparent hover:border-blue-500'
                        }`}
                      >
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                        {selectedItem.currentPhoto === photo && (
                          <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-1">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No photos available from listings</p>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Image className="w-16 h-16 mx-auto mb-4" />
                <p>Select a building or development to manage photos</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}