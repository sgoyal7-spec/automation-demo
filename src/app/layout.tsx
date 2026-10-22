import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = { title: 'Outreach Automation Demo', description: 'LinkedIn reply → AI qualification → Slack → CRM' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <span className="brand">Outreach Automation</span>
          <span className="demo">DEMO · simulated data</span>
          <Link href="/">LinkedIn inbox</Link>
          <Link href="/crm">CRM</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}
