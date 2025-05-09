import type React from "react"
import "@/app/globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Manrope } from "next/font/google"
import { QueryProvider } from "@/components/query-provider"

const inter = Inter({ subsets: ["latin"] })
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-manrope" })

export const metadata: Metadata = {
  title: "Reticular",
  description: "Find Principal Investigators for clinical trials",
  generator: 'v0.dev',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="light">
      <body className={`${inter.className} ${manrope.variable}`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
