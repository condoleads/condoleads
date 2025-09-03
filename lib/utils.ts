import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function extractSubdomain(host: string): string | null {
  if (host.includes('localhost') || host.includes('vercel.app')) {
    return 'demo'; // Default for development
  }
  
  const parts = host.split('.');
  if (parts.length >= 3) {
    return parts[0]; // Return first part (subdomain)
  }
  
  return null;
}