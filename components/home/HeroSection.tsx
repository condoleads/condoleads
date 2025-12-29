import { ArrowRight, Home, Mail, Phone, Building2 } from 'lucide-react';

interface HeroSectionProps {
  agent: {
    full_name: string;
    email: string;
    cell_phone?: string | null;
    office_phone?: string | null;
    whatsapp_number?: string | null;
    bio?: string;
    profile_photo_url?: string;
    team_name?: string | null;
    team_tagline?: string | null;
    team_logo_url?: string | null;
  };
  isTeamSite?: boolean;
}

export function HeroSection({ agent, isTeamSite = false }: HeroSectionProps) {
  return (
    <div className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
        <div className="flex flex-col md:flex-row md:items-center md:gap-12">

          <div className="flex flex-col items-center md:items-start text-center md:text-left md:flex-1">
            
            <div className="flex items-center gap-4 mb-4 md:flex-col md:items-start md:gap-0 md:mb-6">
              {agent.profile_photo_url ? (
                <img
                  src={agent.profile_photo_url}
                  alt={agent.full_name}
                  className="w-20 h-20 md:w-40 md:h-40 rounded-full border-4 border-white/20 shadow-xl object-cover md:mb-4"
                />
              ) : (
                <div className="w-20 h-20 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 border-4 border-white/20 shadow-xl flex items-center justify-center md:mb-4">
                  <span className="text-2xl md:text-5xl font-bold">
                    {agent.full_name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
              )}

              <div className="md:hidden">
                <h1 className="text-xl font-bold mb-1">
                  {isTeamSite && agent.team_name ? agent.team_name : agent.full_name}
                </h1>
                <p className="text-blue-300 text-sm">Toronto Condo Specialist</p>
              </div>
            </div>

            <div className="hidden md:block">
              <h1 className="text-4xl lg:text-5xl font-bold mb-2">
                {isTeamSite && agent.team_name ? agent.team_name : agent.full_name}
              </h1>
              {isTeamSite && agent.team_name && (
                <p className="text-lg text-blue-300 mb-2">Led by {agent.full_name}</p>
              )}
              <p className="text-xl text-blue-300 mb-4">Toronto Condo Specialist</p>
            </div>

            <p className="hidden md:block text-lg text-blue-100 leading-relaxed max-w-lg mb-6">
              {agent.bio || "Helping buyers and sellers navigate Toronto's condo market with expert guidance and instant digital estimates."}
            </p>

            <div className="flex gap-2 md:gap-3 w-full max-w-sm md:max-w-none mb-4 md:mb-0">
              {agent.cell_phone && (
                <a
                  href={`tel:${agent.cell_phone}`}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 md:px-6 md:py-3 rounded-lg font-semibold text-sm md:text-base transition-all shadow-lg"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="md:hidden">Call</span>
                  <span className="hidden md:inline">{agent.cell_phone}</span>
                </a>
              )}
              <a
                href={`mailto:${agent.email}`}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 md:px-6 md:py-3 rounded-lg font-semibold text-sm md:text-base transition-all border border-white/20"
              >
                <Mail className="w-4 h-4 md:w-5 md:h-5" />
                <span className="md:hidden">Email</span>
                <span className="hidden md:inline">Email Me</span>
              </a>
            </div>
          </div>

          <div className="md:flex-1 space-y-3 md:space-y-4 mt-6 md:mt-0">
            <a
              href="#buildings"
              className="group flex items-center justify-between bg-white text-slate-900 px-5 py-4 md:px-8 md:py-6 rounded-xl font-bold hover:shadow-2xl transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-base md:text-xl font-bold">Browse Condo Buildings</p>
                  <p className="text-xs md:text-sm text-slate-500 font-normal">View available listings</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-slate-400 group-hover:translate-x-1 transition-transform" />
            </a>

            <a
              href="#estimate"
              className="group flex items-center justify-between bg-gradient-to-r from-emerald-600 to-blue-600 text-white px-5 py-4 md:px-8 md:py-6 rounded-xl font-bold hover:shadow-2xl transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/20 flex items-center justify-center">
                  <Home className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div>
                  <p className="text-base md:text-xl font-bold">Get Free Estimate</p>
                  <p className="text-xs md:text-sm text-white/80 font-normal">Know your condo value</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover:translate-x-1 transition-transform" />
            </a>

            <div className="hidden md:flex gap-6 pt-4 text-blue-200 text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Licensed REALTOR
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Instant Digital Estimates
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}