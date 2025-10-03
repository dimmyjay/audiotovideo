import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Musivio – Social Media Templates",
  description: "Musivio: Stunning, professional templates for flyers, business ads, church posters, and birthdays. Unleash your creativity!",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Musivio – Social Media Templates",
    description: "Stunning, professional templates for every occasion. Designed for creators, businesses, and event planners.",
    url: "https://musivio.app",
    siteName: "Musivio",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Musivio Social Media Templates",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Musivio – Social Media Templates",
    description: "Stunning, professional templates for every occasion.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#f5f7fa] text-[#22223b]`}
      >
        {children}
      </body>
    </html>
  );
}
