import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeginnerTipProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function BeginnerTip({ title, children, className }: BeginnerTipProps) {
  return (
    <div className={cn("rounded-lg border border-blue-200 bg-blue-50 p-4", className)}>
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div>
          <p className="text-sm font-semibold text-blue-800">{title}</p>
          <p className="mt-1 text-sm text-blue-700">{children}</p>
        </div>
      </div>
    </div>
  );
}
