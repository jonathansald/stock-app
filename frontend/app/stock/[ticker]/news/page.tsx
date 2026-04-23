import Link from "next/link";
import { getCompanyNews } from "@/lib/api";
import { NewsCard } from "@/components/stock/NewsCard";
import { BackButton } from "@/components/common/BackButton";

interface Props {
  params: Promise<{ ticker: string }>;
}

const TABS = ["Overview", "Financials", "Analyst", "News"];
const TAB_HREFS = ["", "/financials", "/analyst", "/news"];

export default async function NewsPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const news = await getCompanyNews(upper).catch(() => ({ articles: [] }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <nav className="text-sm text-muted-foreground">
          <Link href="/screener" className="hover:text-foreground">Screener</Link>
          {" / "}
          <Link href={`/stock/${upper}`} className="hover:text-foreground">{upper}</Link>
          {" / "}
          <span>News</span>
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2 mb-6">
        {TABS.map((tab, i) => (
          <Link
            key={tab}
            href={`/stock/${upper}${TAB_HREFS[i]}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${i === 3 ? "bg-muted" : ""}`}
          >
            {tab}
          </Link>
        ))}
      </div>

      <h1 className="mb-4 text-xl font-bold">Latest News — {upper}</h1>

      {news.articles.length > 0 ? (
        <div className="space-y-3">
          {news.articles.map((article, i) => <NewsCard key={i} article={article} />)}
        </div>
      ) : (
        <p className="text-muted-foreground">No recent news found for {upper}.</p>
      )}
    </div>
  );
}
