import { createClient } from '@/lib/supabase/server'
import BrandingClient from './BrandingClient'

export default async function BrandingPage() {
  const supabase = createClient()
  
  const { data: agents, error } = await supabase
    .from('agents')
    .select('id, full_name, subdomain, custom_domain, site_title, site_tagline, og_image_url, is_active')
    .order('full_name')
  
  if (error) {
    console.error('Error fetching agents:', error)
  }
  
  return <BrandingClient initialAgents={agents || []} />
}