import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { siteConfig } from "./lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Deer Flow Guide",
    template: "%s | Deer Flow Guide",
  },
  description: siteConfig.description,
  keywords: [
    "deer flow",
    "deerflow",
    "deer-flow",
    "what is deer flow",
    "deer flow tutorial",
    "deer flow github",
    "how to use deer flow",
    "deer flow vs openclaw",
    "is deer flow free",
    "ai agent",
    "workflow",
  ],
  alternates: {
    canonical: "/deer-flow",
  },
  openGraph: {
    type: "website",
    url: "/deer-flow",
    title: "Deer Flow Guide",
    description: siteConfig.description,
    siteName: "Deer Flow Guide",
  },
  twitter: {
    card: "summary_large_image",
    title: "Deer Flow Guide",
    description: siteConfig.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-TNTW6P88C6"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-TNTW6P88C6');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
