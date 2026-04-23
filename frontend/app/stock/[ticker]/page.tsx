import { notFound } from "next/navigation";
import Link from "next/link";
import { getProfile, getQuote, getHistory, getMetrics, getCompanyNews } from "@/lib/api";
import { StockHeader } from "@/components/stock/StockHeader";
import { AdvancedPriceChart } from "@/components/stock/AdvancedPriceChart";
import { KeyMetricsCard } from "@/components/stock/KeyMetricsCard";
import { NewsCard } from "@/components/stock/NewsCard";
import { BackButton } from "@/components/common/BackButton";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { ticker } = await params;
  try {
    const profile = await getProfile(ticker.toUpperCase());
    return {
      title: `${profile.name} (${ticker.toUpperCase()}) - StockWise`,
      description: profile.description?.slice(0, 160),
    };
  } catch {
    return { title: `${ticker.toUpperCase()} - StockWise` };
  }
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const [profile, quote, history, metrics, news] = await Promise.allSettled([
    getProfile(upperTicker),
    getQuote(upperTicker),
    getHistory(upperTicker, "1y"),
    getMetrics(upperTicker),
    getCompanyNews(upperTicker),
  ]);

  if (profile.status === "rejected" || quote.status === "rejected") {
    notFound();
  }

  const profileData = (profile as PromiseFulfilledResult<Awaited<ReturnType<typeof getProfile>>>).value;
  const quoteData = (quote as PromiseFulfilledResult<Awaited<ReturnType<typeof getQuote>>>).value;
  const historyData = history.status === "fulfilled" ? history.value.data : [];
  const metricsData = metrics.status === "fulfilled" ? metrics.value : null;
  const newsData = news.status === "fulfilled" ? news.value.articles.slice(0, 5) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <nav className="text-sm text-muted-foreground">
          <Link href="/screener" className="hover:text-foreground">Screener</Link>
          {" / "}
          <span>{upperTicker}</span>
        </nav>
      </div>

      <div className="space-y-6">
        <StockHeader quote={quoteData} profile={profileData} />

        <div className="flex flex-wrap gap-2 border-b pb-2">
          {["Overview", "Financials", "Analyst", "News"].map((tab, i) => {
            const hrefs = ["", "/financials", "/analyst", "/news"];
            return (
              <Link
                key={tab}
                href={`/stock/${upperTicker}${hrefs[i]}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${i === 0 ? "bg-muted" : ""}`}
              >
                {tab}
              </Link>
            );
          })}
        </div>

        <AdvancedPriceChart ticker={upperTicker} initialData={historyData} />

        {metricsData && <KeyMetricsCard metrics={metricsData} />}

        {profileData.description && (
          <div className="rounded-lg border bg-card p-5">
            <h2 className="mb-2 font-semibold">About {profileData.name}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{profileData.description}</p>
            {profileData.employees && (
              <p className="mt-2 text-sm text-muted-foreground">
                Employees: <span className="font-medium text-foreground">{profileData.employees.toLocaleString()}</span>
              </p>
            )}
          </div>
        )}

        {newsData.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Latest News</h2>
              <Link href={`/stock/${upperTicker}/news`} className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {newsData.map((article, i) => (
                <NewsCard key={i} article={article} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
