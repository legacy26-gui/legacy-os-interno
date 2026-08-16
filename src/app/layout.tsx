import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeScript } from "@/components/theme-script";
import { PwaSetup } from "@/components/pwa-setup";
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
  title: "Legacy OS",
  description: "Sistema interno da Legacy Digital",
  applicationName: "Legacy OS",
  appleWebApp: {
    capable: true,
    title: "Legacy OS",
    // Barra de status escura combinando com o tema do app no iPhone.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111114",
  // Evita zoom involuntário ao focar campos no celular e respeita o notch.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
        {/* O Next emite só o nome padronizado (mobile-web-app-capable); iPhones
            mais antigos ainda dependem do prefixo apple- pra abrir em tela cheia. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <PwaSetup />
      </body>
    </html>
  );
}
