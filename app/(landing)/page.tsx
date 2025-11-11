import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'
import BeforeAfter from '@/components/landing/BeforeAfter'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <EstimatorDemo />
      <PipelineFlow />
      <BeforeAfter />
      
      {/* More sections coming next */}
      <section className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            More sections coming soon...
          </h2>
          <p className="text-gray-600">Before/After comparison complete! </p>
        </div>
      </section>
    </main>
  )
}
