import Link from "next/link";
import { getIncome, getBalance, getCashFlow } from "@/lib/api";
import { FinancialTable } from "@/components/stock/FinancialTable";
import { BeginnerTip } from "@/components/common/BeginnerTip";
import { BackButton } from "@/components/common/BackButton";

interface Props {
  params: Promise<{ ticker: string }>;
}

const TABS = ["Overview", "Financials", "Analyst", "News"];
const TAB_HREFS = ["", "/financials", "/analyst", "/news"];

export default async function FinancialsPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const [income, balance, cashflow] = await Promise.allSettled([
    getIncome(upper),
    getBalance(upper),
    getCashFlow(upper),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <BackButton />
        <nav className="text-sm text-muted-foreground">
          <Link href="/screener" className="hover:text-foreground">Screener</Link>
          {" / "}
          <Link href={`/stock/${upper}`} className="hover:text-foreground">{upper}</Link>
          {" / "}
          <span>Financials</span>
        </nav>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2 mb-6">
        {TABS.map((tab, i) => (
          <Link
            key={tab}
            href={`/stock/${upper}${TAB_HREFS[i]}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${i === 1 ? "bg-muted" : ""}`}
          >
            {tab}
          </Link>
        ))}
      </div>

      <BeginnerTip title="How to read financial statements">
        Revenue shows how much money the company made. Net income is what&apos;s left after all costs. Free cash flow is the
        actual cash generated — it&apos;s often more reliable than net income.
      </BeginnerTip>

      <div className="mt-6">
        <FinancialTable
          income={income.status === "fulfilled" ? income.value.data : []}
          balance={balance.status === "fulfilled" ? balance.value.data : []}
          cashflow={cashflow.status === "fulfilled" ? cashflow.value.data : []}
        />
      </div>
    </div>
  );
}
