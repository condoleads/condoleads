import { Mail, Phone, Home } from 'lucide-react';
import Link from 'next/link';

interface AgentCardProps {
  agent: {
    full_name: string;
    email: string;
    phone?: string | null;
    profile_photo_url?: string | null;
    subdomain: string;
  };
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl">
      <div className="flex items-center gap-4 mb-4">
        {agent.profile_photo_url ? (
          <img 
            src={agent.profile_photo_url} 
            alt={agent.full_name}
            className="w-20 h-20 rounded-full border-4 border-white shadow-lg object-cover"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center">
            <span className="text-2xl font-bold">
              {agent.full_name.split(' ').map(n => n[0]).join('')}
            </span>
          </div>
        )}
        
        <div>
          <p className="text-sm text-blue-200 mb-1">Your Agent</p>
          <h3 className="text-2xl font-bold">{agent.full_name}</h3>
          <p className="text-blue-200">Condo Specialist</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <a 
          href={`mailto:${agent.email}`}
          className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3 rounded-lg transition-all group"
        >
          <Mail className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="text-sm truncate">{agent.email}</span>
        </a>
        
        {agent.phone && (
          <a 
            href={`tel:${agent.phone}`}
            className="flex items-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3 rounded-lg transition-all group"
          >
            <Phone className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-sm">{agent.phone}</span>
          </a>
        )}
        
        <Link 
          href="/"
          className="flex items-center gap-3 bg-white text-blue-900 hover:bg-blue-50 px-4 py-3 rounded-lg transition-all font-semibold group justify-center"
        >
          <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
          View My Portfolio
        </Link>
      </div>
    </div>
  );
}
