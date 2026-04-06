import { Shield, ArrowLeft, Wrench } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ToolsPanel } from "@/components/ToolsPanel";
import { useToast } from "@/hooks/use-toast";

const Tools = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleToolResult = (result: string) => {
    toast({ title: "نتيجة الأداة", description: result.slice(0, 100) + (result.length > 100 ? "..." : "") });
    // Navigate back to chat with the result
    navigate("/", { state: { toolResult: result } });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 max-w-2xl mx-auto w-full">
          <Link
            to="/"
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="رجوع للمحادثة"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">الأدوات الأمنية</h1>
            <p className="text-xs text-muted-foreground">أدوات حقيقية تنفذ وتعطي نتائج فعلية</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/terminal"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1.5 rounded-lg hover:bg-primary/10 border border-border"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Terminal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Tools content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <ToolsPanel onResult={handleToolResult} />
        </div>
      </div>
    </div>
  );
};

export default Tools;
