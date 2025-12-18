import { ArrowRight, Home, Mail, Phone, Star, Award } from 'lucide-react';

interface HeroSectionProps {
  agent: {
    full_name: string;
    email: string;
    cell_phone?: string | null
    office_phone?: string | null
    whatsapp_number?: string | null;
    bio?: string;
    profile_photo_url?: string;
  };
}

export function HeroSection({ agent }: HeroSectionProps) {
  return (
    <div className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-blue-600 text-white overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-2000"></div>
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-5 gap-12 items-center">
          
          {/* LEFT: Agent Photo & Credentials - Takes 2 columns */}
          <div className="lg:col-span-2 flex flex-col items-center text-center">
            {/* Large Professional Photo */}
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-pink-500 rounded-full animate-pulse"></div>
              {agent.profile_photo_url ? (
                <img 
                  src={agent.profile_photo_url} 
                  alt={agent.full_name}
                  className="relative w-48 h-48 md:w-64 md:h-64 rounded-full border-8 border-white shadow-2xl object-cover transform hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 border-8 border-white shadow-2xl flex items-center justify-center">
                  <span className="text-7xl font-bold">
                    {agent.full_name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
              )}
              
              {/* Verified Badge */}
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-green-400 to-blue-500 px-6 py-2 rounded-full border-4 border-white shadow-xl">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-white" />
                  <span className="font-bold text-white">Condo Realtor</span>
                </div>
              </div>
            </div>
            
            {/* Agent Name - Large and Bold */}
            <h1 className="text-5xl md:text-6xl font-black mb-3 bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
              {agent.full_name}
            </h1>
            
            {/* Title with Icon */}
            <div className="flex items-center gap-2 mb-6">
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
              <p className="text-2xl font-semibold text-blue-100">Toronto Condo Specialist</p>
              <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
            </div>
            
            {/* Contact Buttons - Prominent */}
            <div className="flex flex-col gap-3 w-full max-w-sm mb-6">
              <a 
                href={`mailto:${agent.email}`}
                className="flex items-center justify-center gap-3 bg-white text-blue-900 px-6 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-all shadow-lg hover:shadow-2xl group"
              >
                <Mail className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="truncate">{agent.email}</span>
              </a>
              
              {agent.cell_phone && (
                <a 
                  href={`tel:${agent.cell_phone}`}
                  className="flex items-center justify-center gap-3 bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:from-green-600 hover:to-green-700 transition-all shadow-lg hover:shadow-2xl group"
                >
                  <Phone className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  {agent.cell_phone}
                </a>
              )}
            </div>
            
            {/* Trust Indicators */}
            <div className="flex gap-4 text-blue-200 text-sm">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Licensed Professional
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Local Expert
              </div>
            </div>
          </div>
          
          {/* RIGHT: Content & CTAs - Takes 3 columns */}
          <div className="lg:col-span-3 space-y-8">
            {/* Bio */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
              <p className="text-2xl text-white leading-relaxed font-light">
                {agent.bio || `Browse available listings in Toronto's most sought-after condos. Get instant digital estimates and personalized service.`}
              </p>
            </div>
            
            {/* Main CTAs */}
            <div className="grid sm:grid-cols-2 gap-4">
              <a 
                href="#buildings"
                className="group relative overflow-hidden bg-white text-blue-900 px-8 py-6 rounded-2xl font-bold text-xl hover:bg-blue-50 transition-all shadow-xl hover:shadow-2xl"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 group-hover:opacity-10 transition-opacity"></div>
                <div className="relative flex items-center justify-center gap-3">
                  <Home className="w-7 h-7 group-hover:scale-110 transition-transform" />
                  Browse Condos
                </div>
              </a>
              
              <a 
                href="#estimate"
                className="group relative overflow-hidden bg-gradient-to-r from-green-500 to-blue-500 text-white px-8 py-6 rounded-2xl font-bold text-xl hover:from-green-600 hover:to-blue-600 transition-all shadow-xl hover:shadow-2xl"
              >
                <div className="relative flex items-center justify-center gap-3">
                  Get Free Estimate
                  <ArrowRight className="w-7 h-7 group-hover:translate-x-1 transition-transform" />
                </div>
              </a>
            </div>
            
            {/* Value Props - Compact */}
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-400 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-bold">Premium Buildings</p>
                </div>
                <p className="text-sm text-blue-100">Curated portfolio</p>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-bold">Instant Estimates</p>
                </div>
                <p className="text-sm text-blue-100">Real market data</p>
              </div>
              
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-400 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="font-bold">Expert Service</p>
                </div>
                <p className="text-sm text-blue-100">Personal guidance</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

