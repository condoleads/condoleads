interface Room {
  id: string
  room_type: string
  room_length: number | null
  room_width: number | null
  room_features: string[] | null
  room_dimensions: string | null
  room_level: string | null
}

interface RoomDimensionsProps {
  rooms: Room[]
}

export default function RoomDimensions({ rooms }: RoomDimensionsProps) {
  if (!rooms || rooms.length === 0) return null

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Rooms</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Size</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Features</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const sizeDisplay = room.room_length && room.room_width 
                ? `${room.room_length} x ${room.room_width} ft`
                : room.room_dimensions || '-'
              
              const features = room.room_features?.join(', ') || '-'
              
              return (
                <tr key={room.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-900 font-medium">
                    {room.room_type}
                    {room.room_level && (
                      <span className="text-xs text-slate-500 ml-2">({room.room_level})</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {sizeDisplay}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-sm">
                    {features}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}