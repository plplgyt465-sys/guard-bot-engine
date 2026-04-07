import { useState, useEffect } from "react";
import { Settings, Cpu, CheckCircle, XCircle, Sparkles, Brain, Zap } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AI_PROVIDERS, GEMINI_MODELS, getAIProviderSettings, saveAIProviderSettings, clearAIProviderSettings } from "@/lib/ai-providers";
import { testGeminiConnection, getSkillCount, getAvailableSkills } from "@/lib/chat-stream";

const STORAGE_KEY = "cyberguard-agent-settings";

export function getAgentCustomPrompt(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function AgentSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash-exp");
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'testing' | 'connected' | 'error'>('unknown');
  const [skillCount, setSkillCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPrompt(getAgentCustomPrompt());
      const settings = getAIProviderSettings();
      setSelectedModel(settings.modelId || "gemini-2.0-flash-exp");
      setSkillCount(getSkillCount());
    }
  }, [open]);

  const testConnection = async () => {
    setConnectionStatus('testing');
    try {
      const result = await testGeminiConnection();
      setConnectionStatus(result.success ? 'connected' : 'error');
      if (result.success) {
        toast({ title: "متصل!", description: `Gemini ${result.model} يعمل بشكل صحيح` });
      } else {
        toast({ title: "خطأ في الاتصال", description: result.error || "فشل الاتصال", variant: "destructive" });
      }
    } catch (e) {
      setConnectionStatus('error');
      toast({ title: "خطأ", description: "فشل اختبار الاتصال", variant: "destructive" });
    }
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, prompt);
    saveAIProviderSettings({
      providerId: 'gemini-unofficial',
      modelId: selectedModel,
      enabled: true
    });
    toast({ title: "تم الحفظ", description: "تم حفظ جميع الإعدادات بنجاح" });
    setOpen(false);
  };

  const handleReset = () => {
    setPrompt("");
    setSelectedModel("gemini-2.0-flash-exp");
    localStorage.removeItem(STORAGE_KEY);
    clearAIProviderSettings();
    toast({ title: "تم إعادة التعيين", description: "تم إعادة الوكيل للإعدادات الافتراضية" });
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'testing': return <Cpu className="w-4 h-4 animate-spin" />;
      case 'connected': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Cpu className="w-4 h-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10">
          <Settings className="w-3.5 h-3.5" />
          <span>إعدادات</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            إعدادات الوكيل
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="ai" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ai">🤖 Gemini AI</TabsTrigger>
            <TabsTrigger value="skills">⚡ المهارات ({skillCount})</TabsTrigger>
            <TabsTrigger value="prompt">🧠 شخصية الوكيل</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-4">
            {/* Gemini Status */}
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Gemini Unofficial</h3>
                    <p className="text-xs text-muted-foreground">مجاني بالكامل - لا يحتاج مفاتيح</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={testConnection} disabled={connectionStatus === 'testing'}>
                  {getConnectionIcon()}
                  <span className="mr-2">اختبار الاتصال</span>
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span className="text-muted-foreground">
                  {connectionStatus === 'connected' ? 'متصل ويعمل!' : 
                   connectionStatus === 'error' ? 'خطأ في الاتصال' :
                   connectionStatus === 'testing' ? 'جاري الاختبار...' :
                   'انقر لاختبار الاتصال'}
                </span>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-3">
              <Label className="text-foreground">اختر الموديل</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="اختر موديل..." />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-2">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                لماذا Gemini الغير رسمي؟
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>مجاني 100% - لا حاجة لمفاتيح API</li>
                <li>لا حاجة لملفات cookies أو tokens</li>
                <li>يعمل مباشرة من المتصفح</li>
                <li>يدعم جميع موديلات Gemini الحديثة</li>
                <li>ذاكرة محادثة كاملة ومستمرة</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="skills" className="space-y-4 mt-4">
            {/* Skills Overview */}
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{skillCount}+ مهارة متاحة</h3>
                  <p className="text-xs text-muted-foreground">يختار الوكيل المهارة المناسبة تلقائياً</p>
                </div>
                <div className="text-3xl font-bold text-primary">{skillCount}</div>
              </div>
            </div>

            {/* Skill Categories */}
            <div className="space-y-3">
              <Label className="text-foreground">الفئات المتاحة</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'sales', name: 'المبيعات', icon: '💼', count: 50 },
                  { id: 'marketing', name: 'التسويق', icon: '📈', count: 50 },
                  { id: 'finance', name: 'المالية', icon: '💰', count: 40 },
                  { id: 'hr', name: 'الموارد البشرية', icon: '👥', count: 40 },
                  { id: 'operations', name: 'العمليات', icon: '⚙️', count: 30 },
                  { id: 'product', name: 'المنتج', icon: '📦', count: 30 },
                  { id: 'tech', name: 'التقنية', icon: '💻', count: 30 },
                  { id: 'c-suite', name: 'القيادة', icon: '👔', count: 20 },
                  { id: 'security', name: 'الأمن', icon: '🛡️', count: 30 },
                  { id: 'general', name: 'عام', icon: '✨', count: 40 },
                ].map(cat => (
                  <div key={cat.id} className="p-3 rounded-lg border border-border bg-card flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{cat.count} مهارة</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-2">
              <h4 className="font-medium text-foreground">كيف يعمل؟</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>تكتب طلبك بشكل طبيعي</li>
                <li>الوكيل يحلل الطلب ويحدد المهارة المناسبة</li>
                <li>يستخرج المعلومات المطلوبة من طلبك</li>
                <li>ينفذ المهارة ويقدم النتيجة</li>
                <li>يتحقق من جودة النتيجة ويصححها إذا لزم</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="prompt" className="space-y-3 mt-4">
            <Label htmlFor="agent-prompt" className="text-foreground">
              تعريف الوكيل وشخصيته وقواعده
            </Label>
            <p className="text-xs text-muted-foreground">
              اكتب هنا التعليمات المخصصة التي تريد أن يتبعها الوكيل.
            </p>
            <Textarea 
              id="agent-prompt" 
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`مثال:\nأنت خبير أعمال محترف اسمك "المساعد الذكي".\nتتحدث بالعربية الفصحى فقط.\nتقدم تحليلات مفصلة مع توصيات عملية.`}
              className="min-h-[200px] text-sm font-mono bg-background text-foreground" 
              dir="rtl" 
            />
            <p className="text-[11px] text-muted-foreground">
              {prompt.length > 0 ? `${prompt.length} حرف` : "لا توجد تعليمات مخصصة - سيستخدم الوكيل المهارات مباشرة"}
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset} className="text-destructive hover:text-destructive">
            إعادة تعيين
          </Button>
          <Button onClick={handleSave}>حفظ الإعدادات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
