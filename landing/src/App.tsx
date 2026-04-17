import { AnimatedBackground } from './components/AnimatedBackground'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { CodeShowcase } from './components/CodeShowcase'
import { WhySection } from './components/WhySection'
import { PipelineFlow } from './components/PipelineFlow'
import { Stats } from './components/Stats'
import { Filters } from './components/Filters'
import { Comparison } from './components/Comparison'
import { CTA } from './components/CTA'
import { Footer } from './components/Footer'

function App() {
  return (
    <>
      <AnimatedBackground />
      <Navbar />
      <main>
        <Hero />
        <CodeShowcase />
        <WhySection />
        <PipelineFlow />
        <Stats />
        <Filters />
        <Comparison />
        <CTA />
      </main>
      <Footer />
    </>
  )
}

export default App
