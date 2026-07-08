import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import ConditionalLayout from "@/components/ConditionalLayout"
import TenantHeader from "@/components/TenantHeader";
import { AuthProvider } from "@/components/auth/AuthContext";
import { CreditSessionProvider } from "@/components/credits/CreditSessionContext";
import { getCurrentTenantId, getCurrentTenantWordmarkStyle } from "@/lib/utils/tenant-resolver";
import { getTenantByHost } from "@/lib/utils/tenant-brand";
import { createClient } from "@/lib/supabase/server";
// C-UNIT-1 (2026-07-08): per-tenant GA4 mount. Reads
// tenant.google_analytics_id via the same resolver metadata uses.
// NULL → the component renders null (fail-closed: no script, no cookies).
import TenantAnalytics from "@/components/analytics/TenantAnalytics";

const inter = Inter({ subsets: ["latin"] });

// C7/D10 -- root metadata is now per-tenant. Reads host at request time,
// resolves tenant config, builds metadata. Falls back to generic when host
// has no matching tenant (build-time SSG safety).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const host = headers().get('host')
    const supabase = createClient()
    const tenant = await getTenantByHost(supabase, host)

    if (!tenant) {
      return {
        title: "AI Real Estate Assistant",
        description: "AI-powered real estate platform.",
      }
    }

    const url = `https://${tenant.domain}`
    const ogImageUrl = `${url}/og`
    const title = `${tenant.name} - AI Real Estate Assistant`
    const description = `Browse properties, get a personalized AI buyer or seller plan, and connect with a local expert. Powered by ${tenant.name} AI.`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url,
        siteName: tenant.name,
        type: "website",
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    }
  } catch {
    return {
      title: "AI Real Estate Assistant",
      description: "AI-powered real estate platform.",
    }
  }
}

// C7/D10 -- static metadata block excised; replaced by generateMetadata above
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantId = await getCurrentTenantId();
  const wordmarkStyle = await getCurrentTenantWordmarkStyle();

  // C-UNIT-1 (2026-07-08): resolve tenant.google_analytics_id per request.
  // Uses getTenantByHost — same helper the metadata / SEO gate use, so the
  // GA mount aligns byte-exact with the tenant already identified for
  // canonical / og:url / structured data. NULL → TenantAnalytics fails
  // closed (renders null). No hardcoded G-XXXX literal anywhere in this
  // layout; every mount reads the ID from the DB row.
  let _gaMeasurementId: string | null = null;
  try {
    const _host = headers().get("host");
    const _tenantForGa = await getTenantByHost(createClient(), _host);
    _gaMeasurementId = _tenantForGa?.googleAnalyticsId || null;
  } catch {
    _gaMeasurementId = null;
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
      </head>
      <body className={inter.className} data-tenant-id={tenantId || ""} data-tenant-wordmark-style={wordmarkStyle || ""}>
        <TenantAnalytics measurementId={_gaMeasurementId} />
        <AuthProvider>
          <CreditSessionProvider>
            <TenantHeader />
            <ConditionalLayout>
              {children}
            </ConditionalLayout>
          </CreditSessionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
