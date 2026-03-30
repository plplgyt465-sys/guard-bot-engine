import { useState, useEffect } from "react";
import { Settings, Eye, EyeOff, Cpu, Plus, Trash2, RefreshCw, CheckCircle, XCircle, AlertCircle, Shield } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AI_PROVIDERS, SECURITY_API_PROVIDERS, getAIProviderSettings, saveAIProviderSettings, clearAIProviderSettings, type AIProviderSettings, type APIKeyEntry, type ProviderKeysMap } from "@/lib/ai-providers";

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
  const [showKeys, setShowKeys] = useState<Record<string, Record<number, boolean>>>({});
  const { toast } = useToast();

  const [providerEnabled, setProviderEnabled] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState("gemini");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-pro");
  const [providerKeys, setProviderKeys] = useState<ProviderKeysMap>({});
  const [checkingKey, setCheckingKey] = useState<string | null>(null); // "providerId-index"

  useEffect(() => {
    if (open) {
      setPrompt(getAgentCustomPrompt());
      (async () => {
        const settings = await getAIProviderSettings();
        if (settings) {
          setProviderEnabled(settings.enabled);
          setSelectedProvider(settings.providerId);
          setSelectedModel(settings.modelId);
          setProviderKeys(settings.providerKeys || {});
        } else {
          setProviderEnabled(false);
          setSelectedProvider("openai");
          setSelectedModel("");
          setProviderKeys({});
        }
      })();
      setShowKeys({});
    }
  }, [open]);

  const currentProvider = AI_PROVIDERS.find(p => p.id === selectedProvider);

  useEffect(() => {
    if (currentProvider && !currentProvider.models.find(m => m.id === selectedModel)) {
      setSelectedModel(currentProvider.models[0]?.id || "");
    }
  }, [selectedProvider]);

  // Per-provider key helpers
  const getKeysForProvider = (providerId: string): APIKeyEntry[] => providerKeys[providerId] || [];

  const setKeysForProvider = (providerId: string, keys: APIKeyEntry[]) => {
    setProviderKeys(prev => ({ ...prev, [providerId]: keys }));
  };

  const addKey = (providerId: string) => {
    const current = getKeysForProvider(providerId);
    setKeysForProvider(providerId, [...current, { key: "", label: `مفتاح ${current.length + 1}`, status: "unknown" }]);
  };

  const removeKey = (providerId: string, index: number) => {
    setKeysForProvider(providerId, getKeysForProvider(providerId).filter((_, i) => i !== index));
  };

  const updateKey = (providerId: string, index: number, field: keyof APIKeyEntry, value: string) => {
    setKeysForProvider(providerId, getKeysForProvider(providerId).map((k, i) => i === index ? { ...k, [field]: value } : k));
  };

  const checkKeyBalance = async (providerId: string, index: number) => {
    const keys = getKeysForProvider(providerId);
    const entry = keys[index];
    if (!entry?.key.trim()) return;
    const checkId = `${providerId}-${index}`;
    setCheckingKey(checkId);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-api-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ providerId, apiKey: entry.key }),
      });
      const data = await resp.json();
      setKeysForProvider(providerId, keys.map((k, i) => i === index ? { ...k, status: data.status || "unknown", balance: data.balance || "غير متاح", lastChecked: Date.now() } : k));
    } catch {
      setKeysForProvider(providerId, keys.map((k, i) => i === index ? { ...k, status: "invalid", balance: "فشل الفحص" } : k));
    }
    setCheckingKey(null);
  };

  const checkAllKeysForProvider = async (providerId: string) => {
    const keys = getKeysForProvider(providerId);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].key.trim()) await checkKeyBalance(providerId, i);
    }
  };

  const handleSave = async () => {
    localStorage.setItem(STORAGE_KEY, prompt);
    // Clean empty keys from all providers
    const cleanedKeys: ProviderKeysMap = {};
    for (const [pid, keys] of Object.entries(providerKeys)) {
      const valid = keys.filter(k => k.key.trim());
      if (valid.length > 0) cleanedKeys[pid] = valid;
    }
    const activeKeys = cleanedKeys[selectedProvider] || [];
    await saveAIProviderSettings({
      providerId: selectedProvider,
      modelId: selectedModel,
      apiKey: activeKeys[0]?.key || "",
      apiKeys: activeKeys,
      providerKeys: cleanedKeys,
      enabled: providerEnabled,
    });
    toast({ title: "تم الحفظ", description: "تم حفظ جميع الإعدادات بنجاح" });
    setOpen(false);
  };

  const handleReset = async () => {
    setPrompt("");
    setProviderEnabled(false);
    setProviderKeys({});
    localStorage.removeItem(STORAGE_KEY);
    await clearAIProviderSettings();
    toast({ title: "تم إعادة التعيين", description: "تم إعادة الوكيل للإعدادات الافتراضية" });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "valid": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "invalid": return <XCircle className="w-4 h-4 text-red-500" />;
      case "no_balance": return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (entry: APIKeyEntry) => {
    if (!entry.status || entry.status === "unknown") return "لم يُفحص";
    if (entry.status === "valid") return entry.balance || "✓ صالح";
    if (entry.status === "invalid") return "❌ غير صالح";
    if (entry.status === "no_balance") return "⚠️ لا رصيد";
    return "غير معروف";
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "valid": return "text-green-500";
      case "invalid": return "text-red-500";
      case "no_balance": return "text-yellow-500";
      default: return "text-muted-foreground";
    }
  };

  const getProviderKeyCount = (providerId: string) => {
    return (providerKeys[providerId] || []).filter(k => k.key.trim()).length;
  };

  const renderProviderKeys = (providerId: string) => {
    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    const keys = getKeysForProvider(providerId);
    const providerShowKeys = showKeys[providerId] || {};

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-foreground text-xs">مفاتيح {provider?.name}</Label>
          <div className="flex items-center gap-2">
            {provider && (
              <a href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-primary hover:underline flex items-center gap-1">
                🔑 احصل على مفتاح
              </a>
            )}
            {keys.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => checkAllKeysForProvider(providerId)} className="h-6 text-[11px] gap-1">
                <RefreshCw className="w-3 h-3" /> فحص الكل
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {keys.map((entry, index) => (
            <div key={index} className="p-3 rounded-lg border border-border bg-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Input value={entry.label} onChange={(e) => updateKey(providerId, index, "label", e.target.value)}
                  className="h-7 text-xs bg-background w-32" dir="rtl" placeholder="اسم المفتاح" />
                <div className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 text-[10px] ${getStatusColor(entry.status)}`}>
                    {getStatusIcon(entry.status)}
                    <span>{getStatusText(entry)}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => checkKeyBalance(providerId, index)}
                    disabled={checkingKey === `${providerId}-${index}` || !entry.key.trim()} className="h-6 w-6 p-0">
                    <RefreshCw className={`w-3 h-3 ${checkingKey === `${providerId}-${index}` ? "animate-spin" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeKey(providerId, index)}
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Input type={providerShowKeys[index] ? "text" : "password"} value={entry.key}
                  onChange={(e) => updateKey(providerId, index, "key", e.target.value)}
                  placeholder={`أدخل مفتاح ${provider?.name || ""} API...`}
                  className="bg-background pl-10 text-xs" dir="ltr" />
                <button type="button"
                  onClick={() => setShowKeys(prev => ({ ...prev, [providerId]: { ...(prev[providerId] || {}), [index]: !providerShowKeys[index] } }))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {providerShowKeys[index] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={() => addKey(providerId)} className="w-full gap-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" /> إضافة مفتاح جديد
        </Button>
      </div>
    );
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
          <DialogTitle className="text-foreground">إعدادات الوكيل</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="prompt" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="prompt">🧠 شخصية الوكيل</TabsTrigger>
            <TabsTrigger value="ai">🤖 مزود الذكاء</TabsTrigger>
            <TabsTrigger value="security">🛡️ APIs أمنية</TabsTrigger>
          </TabsList>

          <TabsContent value="prompt" className="space-y-3 mt-4">
            <Label htmlFor="agent-prompt" className="text-foreground">
              تعريف الوكيل وشخصيته وقواعده
            </Label>
            <p className="text-xs text-muted-foreground">
              اكت�� هنا التعليمات المخصصة التي تريد أن يتبعها الوكيل.
            </p>
            <Textarea id="agent-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={`مثال:\nأنت خبير أمن سيبراني محترف اسمك "حارس".\nتتحدث بالعربية الفصحى فقط.\nتقدم تحليلات مفصلة مع توصيات عملية.`}
              className="min-h-[200px] text-sm font-mono bg-background text-foreground" dir="rtl" />
            <p className="text-[11px] text-muted-foreground">
              {prompt.length > 0 ? `${prompt.length} حرف` : "لا توجد تعليمات مخصصة"}
            </p>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-primary bg-primary/10">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-medium text-primary">Gemini - مزود الذكاء الحصري</p>
                  <p className="text-[11px] text-muted-foreground">Gemini هو المزود الوحيد المتاح</p>
                </div>
              </div>
              <Switch checked={providerEnabled} disabled />
            </div>

            <div className="space-y-4">
              {/* Gemini Information */}
              <div className="p-3 rounded-lg border border-border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Gemini Python (غير محدود)</p>
                    <p className="text-[10px] text-muted-foreground">اتصال مباشر بخوادم Google بدون الحاجة لمفاتيح API</p>
                  </div>
                  <span className="text-[10px] bg-green-500/20 text-green-700 px-2 py-1 rounded">✓ جاهز</span>
                </div>
              </div>

              {/* Model Selection */}
              {currentProvider && (
                <div className="space-y-2">
                  <Label className="text-foreground">اختر الموديل</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="اختر موديل..." />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProvider.models.map(model => (
                        <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* API Keys - per provider - Optional for Gemini Python */}
              {selectedModel !== "gemini-python" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    كل مزود له مفاتيحه الخاصة — عند فشل مفتاح يتم تجربة المفتاح التالي تلقائياً.
                  </p>
                  {renderProviderKeys(selectedProvider)}
                </div>
              )}
              {selectedModel === "gemini-python" && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-[11px] text-green-700 space-y-1">
                  <p>✓ Gemini Python جاهز للاستخدام بدون مفاتيح API</p>
                  <p>الاتصال يتم مباشرة بخوادم Google Gemini بدون أي متطلبات إضافية</p>
                </div>
              )}



              {/* Info */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
                <p>🤖 Gemini Python هو مزود الذكاء الاصطناعي الحصري في هذا المشروع.</p>
                <p>✅ يعمل بدون الحاجة لمفاتيح API أو معطيات خارجية.</p>
                <p>⚡ الاتصال مباشر بخوادم Google Gemini - غير محدود وسريع.</p>
                <p>∞ لا توجد حدود لعدد الطلبات أو الرموز.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-4">
            <div className="p-3 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-foreground">مفاتيح APIs الأمنية</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                أضف مفاتيح API لخدمات الأمان الخارجية. الوكيل والأدوات ستستخدمها تلقائياً.
              </p>
            </div>

            {SECURITY_API_PROVIDERS.map(provider => (
              <div key={provider.id} className="space-y-3 p-3 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{provider.name}</p>
                    <p className="text-[10px] text-muted-foreground">{provider.description}</p>
                  </div>
                  <a href={provider.apiKeyUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[11px] text-primary hover:underline">🔑 احصل على مفتاح</a>
                </div>
                {renderProviderKeys(provider.id)}
              </div>
            ))}

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1">
              <p>🛡️ مفاتيح VirusTotal تُستخدم تلقائياً في جميع الأدوات المستوردة من GitHub.</p>
              <p>🔄 عند فشل مفتاح، يتم تجربة المفتاح التالي تلقائياً.</p>
              <p>♾️ يمكنك إضافة عدد غير محدود من المفاتيح.</p>
            </div>
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
