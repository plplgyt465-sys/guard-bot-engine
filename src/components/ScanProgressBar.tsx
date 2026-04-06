import { Zap, Activity } from "lucide-react";

interface ScanProgressBarProps {
  currentStep: number;
  toolsExecuted: string[];
  currentPhase?: string;
}

export function ScanProgressBar({ currentStep, toolsExecuted, currentPhase }: ScanProgressBarProps) {
  return (
    <div className="p-3 rounded-xl bg-card border border-primary/20 my-3 animate-matrix-fade">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-semibold text-foreground">تنفيذ مستقل جارٍ...</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Activity className="w-3 h-3 text-primary animate-pulse" />
          <span>الخطوة {currentStep}</span>
        </div>
      </div>

      {currentPhase && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            {currentPhase}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>يعمل حتى اكتمال الهدف</span>
        <span>{toolsExecuted.length} أداة</span>
      </div>

      {toolsExecuted.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {toolsExecuted.slice(-10).map((tool, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20">
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
