/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js']
  },
  images: {
    domains: ['res.cloudinary.com', 'photos.proptx.com'],
    formats: ['image/webp', 'image/avif']
  }
};

module.exports = nextConfig;