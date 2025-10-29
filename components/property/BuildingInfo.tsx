interface BuildingInfoProps {
  buildingName: string
  address: string
  yearBuilt?: number | null
  totalUnits?: number | null
  parkingType?: string | null
  petPolicy?: string | null
}

export default function BuildingInfo({ 
  buildingName, 
  address,
  yearBuilt,
  totalUnits,
  parkingType,
  petPolicy
}: BuildingInfoProps) {
  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Building Information</h2>
      
      <div className="space-y-3">
        <div className="flex justify-between py-3 border-b border-slate-100">
          <span className="text-slate-600">Building Name</span>
          <span className="font-semibold text-slate-900">{buildingName}</span>
        </div>
        
        <div className="flex justify-between py-3 border-b border-slate-100">
          <span className="text-slate-600">Address</span>
          <span className="font-semibold text-slate-900 text-right">{address}</span>
        </div>
        
        {yearBuilt && (
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span className="text-slate-600">Year Built</span>
            <span className="font-semibold text-slate-900">{yearBuilt}</span>
          </div>
        )}
        
        {totalUnits && (
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span className="text-slate-600">Total Units</span>
            <span className="font-semibold text-slate-900">{totalUnits}</span>
          </div>
        )}
        
        {parkingType && (
          <div className="flex justify-between py-3 border-b border-slate-100">
            <span className="text-slate-600">Parking Type</span>
            <span className="font-semibold text-slate-900">{parkingType}</span>
          </div>
        )}
        
        {petPolicy && (
          <div className="flex justify-between py-3">
            <span className="text-slate-600">Pet Policy</span>
            <span className="font-semibold text-slate-900">{petPolicy}</span>
          </div>
        )}
      </div>
    </section>
  )
}
