export default function RootPage() {
  const subdomain = 'demo'; // For now, we'll default to demo
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-700 text-white">
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">Toronto Condo Specialist</h1>
        <h2 className="text-3xl font-light mb-6">Demo Agent</h2>
        <p className="text-xl mb-8 max-w-3xl mx-auto">
          Your trusted guide to luxury condo living in Toronto. 
          Exclusive access to premium buildings.
        </p>
        
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold mb-6">Featured Buildings</h3>
          <div className="grid gap-4">
            <div className="bg-white/20 rounded-lg p-4">
              <h4 className="font-bold">The One</h4>
              <p className="text-sm opacity-90">1 Bloor St E - Yorkville</p>
            </div>
            <div className="bg-white/20 rounded-lg p-4">
              <h4 className="font-bold">Harbour Plaza Residences</h4>
              <p className="text-sm opacity-90">33 Bay St - Financial District</p>
            </div>
          </div>
        </div>
        
        <div className="mt-8">
          <a href="mailto:demo@condoleads.ca" 
             className="bg-white text-blue-600 px-8 py-4 rounded-full font-semibold hover:shadow-lg transition-all">
            Contact Agent
          </a>
        </div>
      </div>
    </div>
  );
}
