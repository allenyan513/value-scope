import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ValuScope — AI-Powered Stock Valuation",
    template: "%s | ValuScope",
  },
  description:
    "Free stock intrinsic value calculator. DCF, Trading Multiples, Peter Lynch models with transparent assumptions. Updated daily.",
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
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
