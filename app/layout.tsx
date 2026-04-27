import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout"
import TenantHeader from "@/components/TenantHeader";
import { AuthProvider } from "@/components/auth/AuthContext";
import { getWalliamTenantId } from "@/lib/utils/is-walliam";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WALLiam — AI Real Estate Assistant",
  description: "Browse GTA properties, get a personalized AI buyer or seller plan, and connect with a local expert.",
  openGraph: {
    title: "WALLiam — AI Real Estate Assistant",
    description: "Browse → Get an AI plan → Lead Captured. Powered by WALLiam AI.",
    url: "https://walliam.ca",
    siteName: "WALLiam",
    type: "website",
    images: [{ url: "https://walliam.ca/og-walliam.png", width: 1200, height: 630 }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantId = await getWalliamTenantId();

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
      </head>
      <body className={inter.className} data-tenant-id={tenantId || ""}>
        <AuthProvider>
          <TenantHeader />
          <ConditionalLayout>
            {children}
          </ConditionalLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
