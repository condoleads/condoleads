'use client'
import { useEffect } from 'react'
interface Props {
  building_id?: string | null
  building_slug?: string | null
  community_id?: string | null
  community_slug?: string | null
  municipality_id?: string | null
  municipality_slug?: string | null
  area_id?: string | null
  area_slug?: string | null
  listing_id?: string | null
}
export default function CharliePageContext({ building_id, building_slug, community_id, community_slug, municipality_id, municipality_slug, area_id, area_slug, listing_id }: Props) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('charlie:pagecontext', {
      detail: { building_id, building_slug, community_id, community_slug, municipality_id, municipality_slug, area_id, area_slug, listing_id }
    }))
  }, [])
  return null
}
