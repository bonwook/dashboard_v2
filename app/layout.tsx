import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'FLONICS',
  description: 'FLONICS 4D Flow MRI Analysis Dashboard',
  icons: {
    icon: [
      {
        url: '/LOGO.png',
      },
    ],
    apple: '/LOGO.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const suppressStorageRejection = `window.addEventListener('unhandledrejection',function(e){var m=(e&&e.reason&&(e.reason.message||e.reason))||'';if(String(m).toLowerCase().indexOf('storage')!==-1){e.preventDefault();e.stopPropagation();}},true);`

  const themeScript = `(function(){var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t;}})();`

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Script id="suppress-storage-rejection" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: suppressStorageRejection }} />
        <ThemeProvider defaultTheme="dark" attribute="class">
          <div className="fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
          {children}
          {process.env.VERCEL === '1' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
