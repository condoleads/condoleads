interface StatusBadgeProps {
  status: 'Active' | 'Closed'
  transactionType: 'For Sale' | 'For Lease'
}

export default function StatusBadge({ status, transactionType }: StatusBadgeProps) {
  const isSale = transactionType === 'For Sale'
  const isClosed = status === 'Closed'
  
  const config = {
    'For Sale': { text: 'For Sale', bg: 'bg-emerald-500' },
    'Sold': { text: 'Sold', bg: 'bg-red-500' },
    'For Lease': { text: 'For Lease', bg: 'bg-sky-500' },
    'Leased': { text: 'Leased', bg: 'bg-orange-500' },
  }
  
  const key = isClosed 
    ? (isSale ? 'Sold' : 'Leased')
    : transactionType
  
  const { text, bg } = config[key]
  
  return (
    <span className={`${bg} text-white px-4 py-2 rounded-full text-sm font-bold inline-block`}>
      {text}
    </span>
  )
}
