'use client'

import Link from 'next/link'

interface GeoLink {
  name: string
  slug: string
}

interface GeoInterlinkingProps {
  title: string
  links: GeoLink[]
  currentSlug?: string
}

export default function GeoInterlinking({
  title,
  links,
  currentSlug,
}: GeoInterlinkingProps) {
  // Filter out the current page from the links
  const filteredLinks = currentSlug
    ? links.filter(l => l.slug !== currentSlug)
    : links

  if (filteredLinks.length === 0) return null

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {filteredLinks.map((link) => (
          <Link
            key={link.slug}
            href={`/${link.slug}`}
            className="inline-block px-3 py-1.5 text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors"
          >
            {link.name}
          </Link>
        ))}
      </div>
    </section>
  )
}
