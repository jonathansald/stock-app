import Link from "next/link";
import { getAnalyst, getQuote } from "@/lib/api";
import { AnalystRecommendations } from "@/components/stock/AnalystRecommendations";
import { BackButton } from "@/components/common/BackButton";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function AnalystPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const [analyst, quote] = await Promise.allSettled([getAnalyst(upper), getQuote(upper)]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <nav className="text-sm text-muted-foreground">
          <Link href="/screener" className="hover:text-foreground">Screener</Link>
          {" / "}
          <Link href={`/stock/${upper}`} className="hover:text-foreground">{upper}</Link>
          {" / "}
          <span>Analyst</span>
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2 mb-6">
        {["Overview", "Financials", "Analyst", "News"].map((tab, i) => {
          const hrefs = ["", "/financials", "/analyst", "/news"];
          return (
            <Link
              key={tab}
              href={`/stock/${upper}${hrefs[i]}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${i === 2 ? "bg-muted" : ""}`}
            >
              {tab}
            </Link>
          );
        })}
      </div>

      {analyst.status === "fulfilled" ? (
        <AnalystRecommendations
          analyst={analyst.value}
          currentPrice={quote.status === "fulfilled" ? quote.value.price : undefined}
        />
      ) : (
        <p className="text-muted-foreground">No analyst data available for {upper}.</p>
      )}
    </div>
  );
}
