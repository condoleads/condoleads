'use client'

import Link from 'next/link'

interface CommunityCardProps {
  community: {
    id: string
    name: string
    slug: string
    forSale: number
    forLease: number
    buildingCount: number
  }
}

export default function CommunityCard({ community }: CommunityCardProps) {
  const totalActive = community.forSale + community.forLease

  return (
    <Link
      href={`/${community.slug}`}
      className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all bg-white"
    >
      <h3 className="font-semibold text-gray-900 text-sm mb-1 truncate">
        {community.name}
      </h3>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        {community.forSale > 0 && (
          <span>{community.forSale} for sale</span>
        )}
        {community.forLease > 0 && (
          <span>{community.forLease} for lease</span>
        )}
        {community.buildingCount > 0 && (
          <span>{community.buildingCount} building{community.buildingCount > 1 ? 's' : ''}</span>
        )}
        {totalActive === 0 && community.buildingCount === 0 && (
          <span>View listings</span>
        )}
      </div>
    </Link>
  )
}
