'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react'
import RegisterModal from '@/components/auth/RegisterModal'

interface Photo {
  media_url: string
  order_number: number
}

interface PropertyGalleryProps {
  photos: Photo[]
  shouldBlur?: boolean
  maxPhotos?: number
}

export default function PropertyGallery({ photos, shouldBlur = false, maxPhotos }: PropertyGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  
  // Limit photos if gating
  const displayPhotos = maxPhotos ? photos.slice(0, maxPhotos) : photos
  
  const openLightbox = () => {
    if (shouldBlur) {
      setShowRegister(true)
      return
    }
    setIsLightboxOpen(true)
  }

  const closeLightbox = () => {
    setIsLightboxOpen(false)
  }

  const nextPhoto = () => {
    setCurrentIndex((prev) => (prev + 1) % displayPhotos.length)
  }

  const prevPhoto = () => {
    setCurrentIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length)
  }

  // No photos - show placeholder
  if (photos.length === 0) {
    return (
      <div className="w-full h-96 bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
        <div className="text-white text-center">
          <svg className="w-20 h-20 mx-auto mb-4 opacity-80" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3L2 12h3v8h14v-8h3L12 3zm0 2.5L18 11v7h-2v-6h-8v6H6v-7l6-5.5z"/>
          </svg>
          <p className="text-lg font-semibold">Photos Coming Soon</p>
        </div>
      </div>
    )
  }

  // Only 1 photo - show single centered
  if (displayPhotos.length === 1) {
    return (
      <>
        <div className="relative w-full">
          <div className={`relative h-[500px] bg-slate-200 ${shouldBlur ? 'blur-lg' : ''}`}>
            <Image
              src={displayPhotos[0].media_url}
              alt="Property photo"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>

          {shouldBlur && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <button
                onClick={() => setShowRegister(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors shadow-xl"
              >
                Register to View All Photos
              </button>
            </div>
          )}

          {!shouldBlur && (
            <button
              onClick={openLightbox}
              className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10"
            >
              <Maximize2 className="w-4 h-4" />
              View Full Screen
            </button>
          )}
        </div>

        {/* Lightbox */}
        {isLightboxOpen && !shouldBlur && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-full p-12">
              <Image
                src={displayPhotos[0].media_url}
                alt="Full size photo"
                fill
                className="object-contain"
              />
            </div>
          </div>
        )}

        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setShowRegister(false)
            window.location.reload()
          }}
          registrationSource="property_gallery"
        />
      </>
    )
  }

  // 2+ photos - show 2 side by side with thumbnail navigation
  const secondPhotoIndex = currentIndex + 1 < displayPhotos.length ? currentIndex + 1 : 0

  return (
    <>
      <div className="relative w-full">
        {/* Main gallery - 2 photos side by side */}
        <div className={`grid grid-cols-2 gap-1 h-[500px] ${shouldBlur ? 'blur-lg' : ''}`}>
          {/* Left photo */}
          <div className="relative bg-slate-200 group">
            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={`Property photo ${currentIndex + 1}`}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {!shouldBlur && (
              <button
                onClick={openLightbox}
                className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10 opacity-0 group-hover:opacity-100"
              >
                <Maximize2 className="w-4 h-4" />
                View Full Screen
              </button>
            )}
          </div>

          {/* Right photo */}
          <div className="relative bg-slate-200 group">
            <Image
              src={displayPhotos[secondPhotoIndex].media_url}
              alt={`Property photo ${secondPhotoIndex + 1}`}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* +X more badge */}
            {photos.length > 2 && !shouldBlur && (
              <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-semibold">
                +{photos.length - 2} more
              </div>
            )}

            {!shouldBlur && (
              <button
                onClick={openLightbox}
                className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10"
              >
                <Maximize2 className="w-4 h-4" />
                View Full Screen
              </button>
            )}
          </div>
        </div>

        {/* Gating overlay */}
        {shouldBlur && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="text-center bg-white rounded-xl shadow-2xl p-8 max-w-md mx-4">
              <div className="mb-4">
                <svg 
                  className="w-16 h-16 mx-auto text-blue-600" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {photos.length} Photos Available
              </h3>
              <p className="text-gray-600 mb-6">
                Register for free to view the complete photo gallery and property details
              </p>
              <button
                onClick={() => setShowRegister(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
              >
                Register to View All Photos
              </button>
              <p className="text-xs text-gray-500 mt-4">
                Showing {displayPhotos.length} of {photos.length} photos
              </p>
            </div>
          </div>
        )}

        {/* Photo counter and navigation arrows */}
        {!shouldBlur && (
          <div className="absolute bottom-4 right-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-semibold z-10 flex items-center gap-3">
            <button
              onClick={prevPhoto}
              className="hover:text-emerald-400 transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span>{currentIndex + 1} / {displayPhotos.length}</span>
            <button
              onClick={nextPhoto}
              className="hover:text-emerald-400 transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Thumbnail strip */}
        {!shouldBlur && (
          <div className="bg-slate-100 py-4">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {displayPhotos.map((photo, index) => (
                  <button
                    key={photo.order_number}
                    onClick={() => setCurrentIndex(index)}
                    className={`flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentIndex
                        ? 'border-emerald-500 ring-2 ring-emerald-500 ring-offset-2'
                        : 'border-slate-300 hover:border-emerald-400'
                    }`}
                  >
                    <Image
                      src={photo.media_url}
                      alt={`Thumbnail ${index + 1}`}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {isLightboxOpen && !shouldBlur && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          <button
            onClick={prevPhoto}
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition-colors z-10"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <button
            onClick={nextPhoto}
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-4 rounded-full transition-colors z-10"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          <div className="relative w-full h-full p-12">
            <Image
              src={displayPhotos[currentIndex].media_url}
              alt={`Full size ${currentIndex + 1}`}
              fill
              className="object-contain"
            />
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/10 text-white px-6 py-3 rounded-full text-sm font-semibold backdrop-blur-sm">
            {currentIndex + 1} / {displayPhotos.length}
          </div>
        </div>
      )}

      <RegisterModal
        isOpen={showRegister}
        onClose={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false)
          window.location.reload()
        }}
        registrationSource="property_gallery"
      />
    </>
  )
}
