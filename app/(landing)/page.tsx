import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <EstimatorDemo />
      <PipelineFlow />
      
      {/* More sections coming next */}
      <section className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            More sections coming soon...
          </h2>
          <p className="text-gray-600">Pipeline flow complete! </p>
        </div>
      </section>
    </main>
  )
}
