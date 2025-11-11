import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'
import BeforeAfter from '@/components/landing/BeforeAfter'
import PreviewGenerator from '@/components/landing/PreviewGenerator'
import FeatureCards from '@/components/landing/FeatureCards'
import DemoEmbed from '@/components/landing/DemoEmbed'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <EstimatorDemo />
      <PipelineFlow />
      <BeforeAfter />
      <PreviewGenerator />
      <FeatureCards />
      <DemoEmbed />
      
      {/* More sections coming next */}
      <section className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Final section coming next...
          </h2>
          <p className="text-gray-600">Demo embed complete! 🎉</p>
        </div>
      </section>
    </main>
  )
}
