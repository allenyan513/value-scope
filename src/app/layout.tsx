import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AuthProvider } from "@/components/auth/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "ValuScope — AI-Powered Stock Valuation",
    template: "%s | ValuScope",
  },
  description:
    "Free stock intrinsic value calculator. DCF, Trading Multiples, PEG models with transparent assumptions. Updated daily.",
  keywords: [
    "stock valuation",
    "intrinsic value",
    "DCF model",
    "fair value",
    "stock analysis",
  ],
  openGraph: {
    type: "website",
    siteName: "ValuScope",
    title: "ValuScope — AI-Powered Stock Valuation",
    description: "Free stock intrinsic value calculator with 7 valuation models.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} dark h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
