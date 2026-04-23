import Link from "next/link";
import { getMarketNews } from "@/lib/api";
import { NewsCard } from "@/components/stock/NewsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, BarChart2, Calculator, BookOpen, Activity } from "lucide-react";

export default async function HomePage() {
  const news = await getMarketNews().catch(() => ({ articles: [] }));

  const features = [
    {
      icon: <Activity className="h-6 w-6 text-blue-500" />,
      title: "Live Markets",
      description: "Track indexes, commodities, rates, crypto, and forex with AI market brief.",
      href: "/markets",
      cta: "View Markets",
    },
    {
      icon: <BarChart2 className="h-6 w-6 text-primary" />,
      title: "Stock Screener",
      description: "Filter thousands of stocks by sector, market cap, valuation ratios, and more.",
      href: "/screener",
      cta: "Screen Stocks",
    },
    {
      icon: <TrendingUp className="h-6 w-6 text-green-600" />,
      title: "Portfolio Optimizer",
      description: "Build a mathematically optimized portfolio using the Efficient Frontier.",
      href: "/portfolio",
      cta: "Build Portfolio",
    },
    {
      icon: <Calculator className="h-6 w-6 text-orange-500" />,
      title: "Valuation Suite",
      description: "DCF intrinsic value + peer comparables / relative valuation for any stock.",
      href: "/dcf",
      cta: "Value a Stock",
    },
    {
      icon: <BookOpen className="h-6 w-6 text-purple-500" />,
      title: "Learn Investing",
      description: "Understand P/E ratios, balance sheets, the Efficient Frontier, and more.",
      href: "/learn",
      cta: "Start Learning",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Invest with confidence.
          <span className="text-primary"> Know where to put your money.</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          StockWise gives you professional-grade tools to screen stocks, build an optimized portfolio,
          value companies, and stay informed — all in one place, explained in plain English.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/screener">Browse Stocks</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/portfolio">Build My Portfolio</Link>
          </Button>
        </div>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {features.map((f) => (
          <Card key={f.href} className="transition-shadow hover:shadow-md">
            <CardContent className="pt-6">
              <div className="mb-3">{f.icon}</div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
              <Button className="mt-4 w-full" variant="outline" size="sm" asChild>
                <Link href={f.href}>{f.cta} →</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {news.articles.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-4 text-xl font-bold">Market News</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {news.articles.slice(0, 6).map((article, i) => (
              <NewsCard key={i} article={article} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-16 rounded-2xl bg-primary/5 p-8 text-center">
        <h2 className="text-2xl font-bold">New to investing?</h2>
        <p className="mt-2 text-muted-foreground">
          We explain every metric in plain language so you can make confident decisions.
        </p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/learn">Read the Beginner&apos;s Guide →</Link>
        </Button>
      </div>
    </div>
  );
}
