'use client'
import Link from 'next/link'
import AuthStatus from '@/components/auth/AuthStatus'

export default function UniversalNav() {
  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold text-emerald-600">CondoLeads</span>
          </Link>
          
          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-gray-700 hover:text-emerald-600 font-medium transition-colors">
              Home
            </Link>
            <a href="#buildings" className="text-gray-700 hover:text-emerald-600 font-medium transition-colors">
              Buildings
            </a>
            <a href="#estimate" className="text-gray-700 hover:text-emerald-600 font-medium transition-colors">
              Estimator
            </a>
          </div>
          
          {/* Auth Status */}
          <div className="flex items-center">
            <AuthStatus />
          </div>
        </div>
      </div>
    </nav>
  )
}