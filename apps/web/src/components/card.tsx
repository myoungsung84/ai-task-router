import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Card({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-[#232c38] bg-[#121821] p-4", className)}>
      {title ? <div className="mb-3 text-sm font-medium text-[#c8d1db]">{title}</div> : null}
      {children}
    </div>
  );
}
