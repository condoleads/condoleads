'use client'
import { useEffect } from 'react'

interface Props {
  building_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  listing_id?: string | null
}

export default function CharliePageContext({ building_id, community_id, municipality_id, area_id, listing_id }: Props) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('charlie:pagecontext', {
      detail: { building_id, community_id, municipality_id, area_id, listing_id }
    }))
  }, [])
  return null
}
