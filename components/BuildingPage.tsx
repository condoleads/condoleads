// components/BuildingPage.tsx - BUILDING-SPECIFIC LANDING PAGE
'use client';

import { motion } from 'framer-motion';
import { Building, TrendingUp, Home, Calendar, MapPin, DollarSign, BarChart3, Users, Clock, Star } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Listing {
  id: string;
  mls_number: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  unit_number: string;
  status: string;
  sold_date: string;
  listing_date: string;
  days_on_market: number;
  description: string;
}

interface BuildingAnalytics {
  total_units_tracked: number;
  active_for_sale: number;
  active_for_lease: number;
  sold_last_90_days: number;
  leased_last_90_days: number;
  avg_sale_price: number;
  avg_lease_price: number;
  avg_days_on_market: number;
  price_per_sqft: number;
  occupancy_rate: number;
  price_trend: 'rising' | 'falling' | 'stable';
  market_activity: 'high' | 'medium' | 'low';
}

export function BuildingPage({ building, agent }: any) {
  const [forSaleListings, setForSaleListings] = useState<Listing[]>([]);
  const [forLeaseListings, setForLeaseListings] = useState<Listing[]>([]);
  const [soldListings, setSoldListings] = useState<Listing[]>([]);
  const [leasedListings, setLeasedListings] = useState<Listing[]>([]);
  const [analytics, setAnalytics] = useState<BuildingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('for-sale');
  
  useEffect(() => {
    loadBuildingData();
  }, []);
  
  const loadBuildingData = async () => {
    try {
      const response = await fetch(`/api/buildings/${building.slug}/listings`);
      const data = await response.json();
      
      if (data.success) {
        setForSaleListings(data.forSale || []);
        setForLeaseListings(data.forLease || []);
        setSoldListings(data.recentSold || []);
        setLeasedListings(data.recentLeased || []);
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Failed to load building data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`;
    }
    return `$${price.toLocaleString()}`;
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };
  
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'rising': return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'falling': return <TrendingUp className="h-5 w-5 text-red-500 rotate-180" />;
      default: return <BarChart3 className="h-5 w-5 text-blue-500" />;
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Building Header */}
      <motion.section 
        className="bg-gradient-to-br from-slate-800 to-slate-900 text-white py-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center mb-6">
            <Building className="h-12 w-12 mr-4 text-blue-400" />
            <div>
              <h1 className="text-4xl font-bold">{building.building_name || 'Toronto Condo Building'}</h1>
              <div className="flex items-center text-xl text-gray-300 mt-2">
                <MapPin className="h-5 w-5 mr-2" />
                {building.canonical_address}
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-3">Building Information</h3>
              <div className="space-y-2 text-gray-300">
                {building.static_content?.year_built && (
                  <div>Built: {building.static_content.year_built}</div>
                )}
                {building.static_content?.unit_count && (
                  <div>Total Units: {building.static_content.unit_count}</div>
                )}
                {building.static_content?.association_fee && (
                  <div>Maintenance Fee: ${building.static_content.association_fee}/month</div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <h3 className="text-lg font-semibold mb-3">Your Agent</h3>
              <div className="text-2xl font-bold text-blue-400">{agent.name}</div>
              <div className="text-gray-300">Toronto Condo Specialist</div>
              <button className="mt-4 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors">
                Contact Agent
              </button>
            </div>
          </div>
        </div>
      </motion.section>
      
      {/* Building Analytics Dashboard */}
      {analytics && (
        <motion.section 
          className="py-12 bg-white"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-8">Building Market Analytics</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Home className="h-8 w-8 text-blue-600" />
                  <span className="text-2xl font-bold text-blue-600">{analytics.active_for_sale}</span>
                </div>
                <div className="text-sm text-gray-600">For Sale</div>
                <div className="text-lg font-semibold text-gray-800">
                  {formatPrice(analytics.avg_sale_price)}
                </div>
                <div className="text-xs text-gray-500">Average Price</div>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Building className="h-8 w-8 text-green-600" />
                  <span className="text-2xl font-bold text-green-600">{analytics.active_for_lease}</span>
                </div>
                <div className="text-sm text-gray-600">For Lease</div>
                <div className="text-lg font-semibold text-gray-800">
                  {formatPrice(analytics.avg_lease_price)}/mo
                </div>
                <div className="text-xs text-gray-500">Average Rent</div>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                  <span className="text-2xl font-bold text-purple-600">{analytics.sold_last_90_days}</span>
                </div>
                <div className="text-sm text-gray-600">Sold (90 days)</div>
                <div className="text-lg font-semibold text-gray-800 flex items-center">
                  {getTrendIcon(analytics.price_trend)}
                  <span className="ml-2">{analytics.price_trend}</span>
                </div>
                <div className="text-xs text-gray-500">Price Trend</div>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <Clock className="h-8 w-8 text-orange-600" />
                  <span className="text-2xl font-bold text-orange-600">{analytics.avg_days_on_market}</span>
                </div>
                <div className="text-sm text-gray-600">Avg. Days on Market</div>
                <div className="text-lg font-semibold text-gray-800">
                  ${analytics.price_per_sqft}/sqft
                </div>
                <div className="text-xs text-gray-500">Price per SqFt</div>
              </div>
            </div>
          </div>
        </motion.section>
      )}
      
      {/* Listing Tabs */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {/* Tab Navigation */}
          <div className="flex flex-wrap justify-center mb-8 border-b">
            {[
              { id: 'for-sale', label: `For Sale (${forSaleListings.length})`, icon: DollarSign },
              { id: 'for-lease', label: `For Lease (${forLeaseListings.length})`, icon: Home },
              { id: 'sold', label: `Recently Sold (${soldListings.length})`, icon: TrendingUp },
              { id: 'leased', label: `Recently Leased (${leasedListings.length})`, icon: Calendar }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-3 mr-4 mb-2 rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Tab Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'for-sale' && (
              <ListingGrid 
                listings={forSaleListings} 
                type="sale" 
                formatPrice={formatPrice}
                formatDate={formatDate}
              />
            )}
            
            {activeTab === 'for-lease' && (
              <ListingGrid 
                listings={forLeaseListings} 
                type="lease" 
                formatPrice={formatPrice}
                formatDate={formatDate}
              />
            )}
            
            {activeTab === 'sold' && (
              <ListingGrid 
                listings={soldListings} 
                type="sold" 
                formatPrice={formatPrice}
                formatDate={formatDate}
              />
            )}
            
            {activeTab === 'leased' && (
              <ListingGrid 
                listings={leasedListings} 
                type="leased" 
                formatPrice={formatPrice}
                formatDate={formatDate}
              />
            )}
          </motion.div>
        </div>
      </section>
    </div>
  );
}

// Listing Grid Component
function ListingGrid({ listings, type, formatPrice, formatDate }: any) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">No {type} listings available</div>
        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
          Contact Agent for More Information
        </button>
      </div>
    );
  }
  
  const getStatusBadge = (listingType: string) => {
    const badges = {
      sale: { bg: 'bg-green-100', text: 'text-green-800', label: 'FOR SALE' },
      lease: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'FOR LEASE' },
      sold: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'SOLD' },
      leased: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'LEASED' }
    };
    return badges[listingType as keyof typeof badges];
  };
  
  const badge = getStatusBadge(type);
  
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {listings.map((listing: any) => (
        <motion.div
          key={listing.id}
          className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
          whileHover={{ y: -5 }}
        >
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="text-2xl font-bold text-gray-800">
                {type === 'lease' || type === 'leased' 
                  ? `${formatPrice(listing.price)}/mo`
                  : formatPrice(listing.price)
                }
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
            </div>
            
            <div className="mb-4">
              <div className="text-lg font-semibold text-gray-700 mb-2">
                Unit {listing.unit_number || 'TBD'}
              </div>
              <div className="text-sm text-gray-600 grid grid-cols-2 gap-4">
                <span>{listing.beds} bed • {listing.baths} bath</span>
                {listing.sqft && <span>{listing.sqft.toLocaleString()} sqft</span>}
              </div>
            </div>
            
            {listing.description && (
              <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                {listing.description.substring(0, 150)}...
              </p>
            )}
            
            <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
              <span>MLS: {listing.mls_number}</span>
              {listing.days_on_market && (
                <span>{listing.days_on_market} days on market</span>
              )}
            </div>
            
            {(type === 'sold' || type === 'leased') && listing.sold_date && (
              <div className="text-xs text-gray-400 mb-4">
                {type === 'sold' ? 'Sold' : 'Leased'}: {formatDate(listing.sold_date)}
              </div>
            )}
            
            <button className={`w-full py-2 px-4 rounded-lg text-white font-semibold transition-colors ${
              type === 'sale' || type === 'lease' 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-600 hover:bg-gray-700'
            }`}>
              {type === 'sale' || type === 'lease' ? 'Request Showing' : 'Similar Properties'}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}