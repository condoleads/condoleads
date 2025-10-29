import { notFound, redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { parsePropertySlug } from '@/lib/utils/slugs'

// Check if this is a property slug (contains -unit-)
function isPropertySlug(slug: string): boolean {
  return slug.includes('-unit-')
}

export default async function SlugPage({ params }: { params: { slug: string } }) {
  // Detect if this is a property URL
  if (isPropertySlug(params.slug)) {
    // This is a property - redirect to /p/[slug] route
    redirect(`/p/${params.slug}`)
  }

  // Otherwise, load the building page (import dynamically to avoid loading unnecessary code)
  const BuildingPage = (await import('./BuildingPage')).default
  return <BuildingPage params={params} />
}
