'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react'

interface Photo {
  media_url: string
  order_number: number
}

interface PropertyGalleryProps {
  photos: Photo[]
}

export default function PropertyGallery({ photos }: PropertyGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  
  const openLightbox = () => {
    setIsLightboxOpen(true)
  }

  const closeLightbox = () => {
    setIsLightboxOpen(false)
  }

  const nextPhoto = () => {
    setCurrentIndex((prev) => (prev + 1) % photos.length)
  }

  const prevPhoto = () => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }

  // No photos - show placeholder (same as cards)
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
  if (photos.length === 1) {
    return (
      <>
        <div className="relative w-full">
          <div className="relative h-[500px] bg-slate-200">
            <Image
              src={photos[0].media_url}
              alt="Property photo"
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            <button
              onClick={openLightbox}
              className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10"
            >
              <Maximize2 className="w-4 h-4" />
              View Full Screen
            </button>
          </div>
        </div>

        {/* Lightbox */}
        {isLightboxOpen && (
          <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center">
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-full p-12">
              <Image
                src={photos[0].media_url}
                alt="Full size photo"
                fill
                className="object-contain"
              />
            </div>
          </div>
        )}
      </>
    )
  }

  // 2+ photos - show 2 side by side with thumbnail navigation
  const secondPhotoIndex = currentIndex + 1 < photos.length ? currentIndex + 1 : 0

  return (
    <>
      <div className="relative w-full">
        {/* Main gallery - 2 photos side by side */}
        <div className="grid grid-cols-2 gap-1 h-[500px]">
          {/* Left photo */}
          <div className="relative bg-slate-200 group">
            <Image
              src={photos[currentIndex].media_url}
              alt={`Property photo ${currentIndex + 1}`}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* Expand button - bottom left, shows on hover */}
            <button
              onClick={openLightbox}
              className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10 opacity-0 group-hover:opacity-100"
            >
              <Maximize2 className="w-4 h-4" />
              View Full Screen
            </button>
          </div>

          {/* Right photo */}
          <div className="relative bg-slate-200 group">
            <Image
              src={photos[secondPhotoIndex].media_url}
              alt={`Property photo ${secondPhotoIndex + 1}`}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            
            {/* +X more badge in top-right if more than 2 photos */}
            {photos.length > 2 && (
              <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-semibold">
                +{photos.length - 2} more
              </div>
            )}
            
            {/* Expand button - bottom left */}
            <button
              onClick={openLightbox}
              className="absolute bottom-4 left-4 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors z-10"
            >
              <Maximize2 className="w-4 h-4" />
              View Full Screen
            </button>
          </div>
        </div>

        {/* Photo counter and navigation arrows */}
        <div className="absolute bottom-4 right-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-semibold z-10 flex items-center gap-3">
          <button
            onClick={prevPhoto}
            className="hover:text-emerald-400 transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span>{currentIndex + 1} / {photos.length}</span>
          <button
            onClick={nextPhoto}
            className="hover:text-emerald-400 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Thumbnail strip - click to change main view */}
        <div className="bg-slate-100 py-4">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {photos.map((photo, index) => (
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
      </div>

      {/* Lightbox - Full screen view */}
      {isLightboxOpen && (
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
              src={photos[currentIndex].media_url}
              alt={`Full size ${currentIndex + 1}`}
              fill
              className="object-contain"
            />
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/10 text-white px-6 py-3 rounded-full text-sm font-semibold backdrop-blur-sm">
            {currentIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  )
}