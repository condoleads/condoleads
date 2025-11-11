'use client'

interface WalkScoreProps {
  latitude: number
  longitude: number
  address: string
  buildingName: string
}

export default function WalkScore({ latitude, longitude, address, buildingName }: WalkScoreProps) {
  // Create a direct link to Walk Score for this specific address
  const walkScoreLink = `https://www.walkscore.com/score/${encodeURIComponent(address)}`

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-slate-900 mb-8">Neighborhood & Walkability</h2>
        
        <div className="bg-slate-50 rounded-2xl overflow-hidden shadow-xl p-8">
          <p className="text-lg text-slate-700 mb-6">
            Explore the walkability, transit, and bike scores for {buildingName}
          </p>
          
          
          <a
            href={walkScoreLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-4 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
          >
            View Walk Score & Transit Score for {buildingName}
          </a>
          
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-md text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">?</div>
              <div className="text-sm text-slate-600">Walk Score</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">?</div>
              <div className="text-sm text-slate-600">Transit Score</div>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-md text-center">
              <div className="text-4xl font-bold text-orange-600 mb-2">?</div>
              <div className="text-sm text-slate-600">Bike Score</div>
            </div>
          </div>
          
          <p className="text-xs text-slate-500 text-center mt-6">
            Data provided by <a href="https://www.walkscore.com" target="_blank" rel="noopener" className="text-emerald-600 hover:underline">Walk Score</a>
          </p>
        </div>
      </div>
    </section>
  )
}
