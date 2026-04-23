import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { WatchlistProvider } from "@/components/providers/WatchlistProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StockWise — Smart Stock Research & Portfolio Builder",
  description:
    "Screen stocks by sector, build optimized portfolios using the Efficient Frontier, run DCF valuations, and read analyst recommendations — explained in plain English for every investor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <WatchlistProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <footer className="border-t py-6 text-center text-sm text-muted-foreground">
              StockWise — For educational purposes only. Not financial advice.
            </footer>
          </WatchlistProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
