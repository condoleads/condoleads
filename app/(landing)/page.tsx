import LandingHeader from '@/components/landing/LandingHeader'
import HeroSection from '@/components/landing/HeroSection'
import EstimatorDemo from '@/components/landing/EstimatorDemo'
import PipelineFlow from '@/components/landing/PipelineFlow'
import BeforeAfter from '@/components/landing/BeforeAfter'
import PreviewGenerator from '@/components/landing/PreviewGenerator'
import FeatureCards from '@/components/landing/FeatureCards'
import DemoEmbed from '@/components/landing/DemoEmbed'
import CommunityApplication from '@/components/landing/CommunityApplication'

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main className="pt-16">
        <HeroSection />
        <EstimatorDemo />
        <PipelineFlow />
        <BeforeAfter />
        <PreviewGenerator />
        <FeatureCards />
        <DemoEmbed />
        <CommunityApplication />
      </main>
    </>
  )
}
