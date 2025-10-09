interface PropertyDescriptionProps {
  description: string | null
}

export default function PropertyDescription({ description }: PropertyDescriptionProps) {
  if (!description) return null

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">About This Property</h2>
      <div className="prose prose-slate max-w-none">
        <p className="text-slate-700 leading-relaxed whitespace-pre-line">
          {description}
        </p>
      </div>
    </section>
  )
}