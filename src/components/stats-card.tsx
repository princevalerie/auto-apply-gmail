import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: string;
  color?: "primary" | "success" | "destructive" | "warning";
}

export function StatsCard({
  label,
  value,
  icon,
  trend,
  color = "primary",
}: StatsCardProps) {
  const colorMap = {
    primary: {
      bg: "bg-primary/10",
      text: "text-primary",
      glow: "shadow-primary/10",
    },
    success: {
      bg: "bg-success/10",
      text: "text-success",
      glow: "shadow-success/10",
    },
    destructive: {
      bg: "bg-destructive/10",
      text: "text-destructive",
      glow: "shadow-destructive/10",
    },
    warning: {
      bg: "bg-warning/10",
      text: "text-warning",
      glow: "shadow-warning/10",
    },
  };

  const colors = colorMap[color];

  return (
    <div className="card-elevated p-5 group">
      <div className="flex items-center justify-between mb-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-shadow",
            colors.bg,
            colors.text,
            `group-hover:shadow-lg ${colors.glow}`
          )}
        >
          {icon}
        </div>
        {trend && (
          <span className="text-xs text-muted-foreground">{trend}</span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
