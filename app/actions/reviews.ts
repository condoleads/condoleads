'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function submitReview(formData: {
  building_id: string
  user_name: string
  rating: number
  comment: string
}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase
    .from('building_reviews')
    .insert({
      building_id: formData.building_id,
      user_name: formData.user_name,
      rating: formData.rating,
      comment: formData.comment
    })
    .select()

  if (error) {
    console.error('Server action error:', error)
    return { success: false, error: error.message }
  }

  // Revalidate the page to show new review
  revalidatePath(`/[slug]`)
  
  return { success: true, data }
}