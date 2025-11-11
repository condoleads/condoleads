import HeroSection from '@/components/landing/HeroSection'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      
      {/* More sections coming next */}
      <section className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            More sections coming soon...
          </h2>
          <p className="text-gray-600">Hero section complete! </p>
        </div>
      </section>
    </main>
  )
}