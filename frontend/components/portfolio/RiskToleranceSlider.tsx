"use client";

import { cn } from "@/lib/utils";
import { Shield, BarChart2, Zap } from "lucide-react";

type RiskProfile = "conservative" | "moderate" | "aggressive";

interface Props {
  value: RiskProfile;
  onChange: (value: RiskProfile) => void;
}

const OPTIONS = [
  {
    value: "conservative" as RiskProfile,
    label: "Conservative",
    tagline: "Preserve capital",
    description: "Minimize volatility. Lower expected returns but the portfolio is more stable.",
    icon: Shield,
    accent: "border-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  {
    value: "moderate" as RiskProfile,
    label: "Moderate",
    tagline: "Best risk/reward",
    description: "Maximize Sharpe ratio — the highest return per unit of risk taken.",
    icon: BarChart2,
    accent: "border-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  {
    value: "aggressive" as RiskProfile,
    label: "Aggressive",
    tagline: "Maximize returns",
    description: "Push for the highest possible expected return. Expect larger swings.",
    icon: Zap,
    accent: "border-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
    text: "text-orange-700 dark:text-orange-300",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
] as const;

export function RiskToleranceSlider({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative rounded-xl border-2 p-4 text-left transition-all focus:outline-none",
              selected
                ? cn(opt.accent, opt.bg)
                : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40"
            )}
          >
            <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", selected ? opt.badge : "bg-muted")}>
              <Icon className={cn("h-4.5 w-4.5", selected ? opt.text : "text-muted-foreground")} strokeWidth={2} />
            </div>
            <p className={cn("font-semibold text-sm", selected ? opt.text : "text-foreground")}>{opt.label}</p>
            <p className={cn("text-xs font-medium mt-0.5", selected ? opt.text : "text-muted-foreground")}>
              {opt.tagline}
            </p>
            <p className="mt-2 text-xs text-muted-foreground leading-snug">{opt.description}</p>
            {selected && (
              <div className={cn("absolute right-3 top-3 h-2 w-2 rounded-full", opt.text.replace("text-", "bg-"))} />
            )}
          </button>
        );
      })}
    </div>
  );
}
