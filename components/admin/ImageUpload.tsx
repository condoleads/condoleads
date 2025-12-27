'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, X, Move } from 'lucide-react'

interface ImageUploadProps {
  currentUrl: string | null
  onUpload: (url: string) => void
  folder: string
  aspectRatio?: '16:9' | '1:1'
  label?: string
}

export default function ImageUpload({ currentUrl, onUpload, folder, aspectRatio = '16:9', label }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const supabase = createClient()

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    setUploading(true)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload to Supabase Storage
      const fileName = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      
      const { data, error } = await supabase.storage
        .from('branding')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) {
        console.error('Upload error:', error)
        alert('Error uploading image: ' + error.message)
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(fileName)

      if (urlData?.publicUrl) {
        onUpload(urlData.publicUrl)
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Error uploading image')
    } finally {
      setUploading(false)
    }
  }

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    
    setPosition({ x, y })
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const clearImage = () => {
    setPreview(null)
    onUpload('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const aspectClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-square'

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {preview ? (
        <div className="relative">
          <div
            ref={containerRef}
            className={`relative ${aspectClass} bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200 cursor-move`}
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            <img
              src={preview}
              alt="Preview"
              className="absolute w-full h-full object-cover"
              style={{
                objectPosition: `${position.x}% ${position.y}%`
              }}
              draggable={false}
            />
            
            {/* Position indicator */}
            <div 
              className="absolute w-6 h-6 bg-white border-2 border-blue-500 rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
            >
              <Move className="w-3 h-3 text-blue-500" />
            </div>
            
            {/* Overlay hint */}
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
              <span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded">Drag to reposition</span>
            </div>
          </div>
          
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Change Image
            </button>
            <button
              onClick={clearImage}
              className="px-3 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-1">
            Position: {Math.round(position.x)}% x {Math.round(position.y)}%
          </p>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`w-full ${aspectClass} border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center gap-2 ${uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-500">Uploading...</span>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400" />
              <span className="text-sm text-gray-500">Click to upload image</span>
              <span className="text-xs text-gray-400">Max 5MB, JPG/PNG</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}