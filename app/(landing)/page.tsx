import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'
import BeforeAfter from '@/components/landing/BeforeAfter'
import PreviewGenerator from '@/components/landing/PreviewGenerator'
import FeatureCards from '@/components/landing/FeatureCards'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <EstimatorDemo />
      <PipelineFlow />
      <BeforeAfter />
      <PreviewGenerator />
      <FeatureCards />
      
      {/* More sections coming next */}
      <section className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            More sections coming soon...
          </h2>
          <p className="text-gray-600">Feature cards complete! </p>
        </div>
      </section>
    </main>
  )
}
