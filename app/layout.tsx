export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <title>CondoLeads - Toronto Condo Specialists</title>
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
