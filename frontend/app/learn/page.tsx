import Link from "next/link";
import { BeginnerTip } from "@/components/common/BeginnerTip";

const concepts = [
  {
    term: "P/E Ratio (Price-to-Earnings)",
    explanation: `The P/E ratio tells you how many dollars investors pay for every $1 of annual profit a company earns. A P/E of 20 means investors pay $20 for each $1 of earnings. Lower P/E generally means cheaper — but a low P/E can also signal slower growth or problems. Compare P/E ratios within the same sector.`,
    example: "Apple had a P/E of ~28 in 2024, meaning investors paid $28 for every $1 of Apple's earnings."
  },
  {
    term: "Market Capitalization",
    explanation: `Market cap = share price × total shares. It's the total market value of a company. Large cap (>$10B) companies are typically safer and more stable. Small cap (<$2B) companies can grow faster but carry more risk.`,
    example: "Apple's market cap exceeds $3 trillion — that's bigger than the entire GDP of the UK."
  },
  {
    term: "Free Cash Flow",
    explanation: `Free cash flow (FCF) is the actual cash a company generates after paying for its operations and capital expenditures. Unlike accounting profit, FCF can't be manipulated as easily. Companies with high FCF can pay dividends, buy back shares, or reinvest in growth.`,
    example: "A company with $5B revenue but $500M FCF has healthy real earnings power."
  },
  {
    term: "Efficient Frontier",
    explanation: `The Efficient Frontier (from Modern Portfolio Theory) shows all combinations of assets that give the maximum expected return for a given level of risk. Points on the frontier are "optimal" — you can't get more return without taking more risk. Our Portfolio Builder uses this to suggest the mathematically best allocation for your chosen risk tolerance.`,
    example: "Holding BOTH stocks and bonds often lands you ON the frontier — better return per unit of risk than stocks alone."
  },
  {
    term: "Sharpe Ratio",
    explanation: `Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Volatility. It measures how much return you get per unit of risk. A Sharpe above 1.0 is generally good, above 2.0 is excellent. When comparing two portfolios with the same return, choose the one with the higher Sharpe.`,
    example: "If your portfolio earns 12% with 10% volatility, and the risk-free rate is 5%, Sharpe = (12-5)/10 = 0.7."
  },
  {
    term: "DCF Valuation",
    explanation: `Discounted Cash Flow (DCF) estimates what a company is worth today based on all future cash flows it will generate, discounted back to present value (because money today is worth more than money in the future). The WACC (discount rate) represents the opportunity cost of capital. If the DCF intrinsic value > current price, the stock may be undervalued.`,
    example: "Warren Buffett is famous for saying he buys dollar bills for 50 cents — he's essentially doing DCF to find stocks trading below intrinsic value."
  },
  {
    term: "Analyst Recommendations",
    explanation: `Wall Street analysts at investment banks research companies and issue ratings: Strong Buy, Buy, Hold, Sell, Strong Sell. They also publish a 12-month price target. These are opinions, not guarantees. Consensus (the average of all analysts) tends to be more reliable than individual calls.`,
    example: "If 15 out of 20 analysts rate a stock 'Buy' with a target price of $150 and it trades at $120, the implied upside is 25%."
  },
  {
    term: "Beta",
    explanation: `Beta measures a stock's volatility relative to the market. Beta = 1 means it moves with the market. Beta > 1 means more volatile (e.g., tech stocks). Beta < 1 means less volatile (e.g., utilities). In your Portfolio Builder, conservative portfolios favor low-beta stocks.`,
    example: "If the market drops 10% and a stock has beta of 1.5, you'd expect that stock to drop ~15%."
  },
  {
    term: "Diversification",
    explanation: `Diversification means spreading your investments across different assets so that if one performs badly, others can offset the loss. The magic: uncorrelated assets together can have LESS total risk than either alone — without reducing expected returns. This is why the Efficient Frontier works.`,
    example: "Airlines and oil companies often move in opposite directions. Holding both can reduce your portfolio's volatility."
  },
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Beginner's Guide to Investing</h1>
        <p className="mt-2 text-muted-foreground">
          Plain-English explanations of every term we use on StockWise.
        </p>
      </div>

      <BeginnerTip title="Where to start">
        If you're completely new, read about Market Cap, P/E Ratio, and Diversification first. Then try the Stock
        Screener to explore companies, and use the Portfolio Builder when you've found 3-5 you're interested in.
      </BeginnerTip>

      <div className="mt-8 space-y-6">
        {concepts.map((c) => (
          <div key={c.term} className="rounded-lg border p-5">
            <h2 className="text-lg font-semibold">{c.term}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.explanation}</p>
            <div className="mt-3 rounded-md bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Example</p>
              <p className="mt-1 text-sm italic">{c.example}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl bg-primary/5 p-6 text-center">
        <p className="font-semibold">Ready to put it into practice?</p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <Link href="/screener" className="text-sm font-medium text-primary hover:underline">Browse Stocks →</Link>
          <Link href="/portfolio" className="text-sm font-medium text-primary hover:underline">Build Portfolio →</Link>
          <Link href="/dcf" className="text-sm font-medium text-primary hover:underline">Value a Stock →</Link>
        </div>
      </div>
    </div>
  );
}
