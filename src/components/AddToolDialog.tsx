import { useState, useEffect } from "react";
import { Plus, X, Trash2, Upload, Download, Github, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { type ToolCategory } from "@/lib/security-tools";
import { saveCustomTool, deleteCustomTool, fetchCustomTools, exportTools, importTools, importToolsFromGitHub, type CustomToolDefinition } from "@/lib/custom-tools";
import { useToast } from "@/hooks/use-toast";

interface AddToolDialogProps {
  onToolsChanged: () => void;
}

const defaultTool = {
  name: "",
  name_ar: "",
  icon: "🔧",
  description: "",
  category: "scanning" as ToolCategory,
  args: [{ key: "target", label: "الهدف", placeholder: "example.com", required: true }],
  execution_type: "http_fetch" as CustomToolDefinition["execution_type"],
  execution_config: {} as Record<string, string>,
};

const iconOptions = ["🔧", "⚡", "🛠️", "🔬", "🎯", "💣", "🕸️", "🧰", "📡", "🔮", "🦠", "🧲", "⛏️", "🗡️", "🔋"];

export function AddToolDialog({ onToolsChanged }: AddToolDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"create" | "manage" | "github" | "import-code">("create");
  const [githubUrl, setGithubUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [tool, setTool] = useState(defaultTool);
  const [args, setArgs] = useState(defaultTool.args);
  const [customTools, setCustomTools] = useState<CustomToolDefinition[]>([]);
  const [codeRepoUrl, setCodeRepoUrl] = useState("");
  const [codeFilePath, setCodeFilePath] = useState("");
  const [importingCode, setImportingCode] = useState(false);
  const [codeName, setCodeName] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) loadTools();
  }, [open]);

  const loadTools = async () => {
    try { setCustomTools(await fetchCustomTools()); } catch {}
  };

  const handleSave = async () => {
    if (!tool.name.trim() || !tool.name_ar.trim()) {
      toast({ title: "خطأ", description: "الاسم مطلوب", variant: "destructive" });
      return;
    }
    const tool_id = tool.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    try {
      await saveCustomTool({ ...tool, tool_id, args });
      onToolsChanged();
      toast({ title: "تم", description: `تمت إضافة الأداة: ${tool.name_ar}` });
      setTool(defaultTool);
      setArgs(defaultTool.args);
      await loadTools();
      setTab("manage");
    } catch (e) {
      toast({ title: "خطأ", description: e instanceof Error ? e.message : "فشل الحفظ", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomTool(id);
      onToolsChanged();
      await loadTools();
      toast({ title: "تم", description: "تم حذف الأداة" });
    } catch {}
  };

  const handleExport = () => {
    const data = exportTools(customTools);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "custom-tools.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const count = await importTools(text);
        onToolsChanged();
        await loadTools();
        toast({ title: "تم", description: `تم استيراد ${count} أداة` });
      } catch (err) {
        toast({ title: "خطأ", description: err instanceof Error ? err.message : "فشل الاستيراد", variant: "destructive" });
      }
    };
    input.click();
  };

  const addArg = () => setArgs([...args, { key: "", label: "", placeholder: "", required: false }]);
  const removeArg = (i: number) => setArgs(args.filter((_, idx) => idx !== i));
  const updateArg = (i: number, field: string, value: string | boolean) => setArgs(args.map((a, idx) => idx === i ? { ...a, [field]: value } : a));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-primary/30 text-primary text-xs hover:bg-primary/5 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          إضافة أداة مخصصة
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-display">إدارة الأدوات المخصصة</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
          <button onClick={() => setTab("create")} className={`text-xs py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap ${tab === "create" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            إنشاء
          </button>
          <button onClick={() => setTab("import-code")} className={`text-xs py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap flex items-center gap-1 ${tab === "import-code" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            <Github className="w-3 h-3" /> استيراد كود
          </button>
          <button onClick={() => setTab("github")} className={`text-xs py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap flex items-center gap-1 ${tab === "github" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            <Github className="w-3 h-3" /> JSON
          </button>
          <button onClick={() => setTab("manage")} className={`text-xs py-1.5 px-2 rounded-md font-medium transition-all whitespace-nowrap ${tab === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            الأدوات ({customTools.length})
          </button>
        </div>

        {tab === "import-code" ? (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">استيراد أدوات حقيقية من GitHub وتنفيذها بدقة عالية. يدعم: JavaScript, Python, Bash, Go</p>
            
            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">رابط المستودع (GitHub Repository)</label>
              <input
                type="text"
                value={codeRepoUrl}
                onChange={e => setCodeRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono"
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">مسار الملف</label>
              <input
                type="text"
                value={codeFilePath}
                onChange={e => setCodeFilePath(e.target.value)}
                placeholder="src/tools/my-tool.js"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono"
                dir="ltr"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">اسم الأداة (اختياري)</label>
              <input
                type="text"
                value={codeName}
                onChange={e => setCodeName(e.target.value)}
                placeholder="my-tool"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs"
              />
            </div>

            <div className="p-2 bg-muted/50 rounded-lg space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium">📝 صيغة الملف المدعومة:</p>
              <pre className="text-[9px] text-muted-foreground font-mono overflow-x-auto" dir="ltr">{`/**
 * @description وصف الأداة
 * @param {string} target - الهدف المراد فحصه
 * @param {number} timeout - المهلة الزمنية
 * @returns {object} نتيجة التنفيذ
 * @timeout 30000
 */

// رمز الأداة هنا
const result = { success: true, data: target };
return result;`}</pre>
            </div>

            <button
              onClick={async () => {
                if (!codeRepoUrl.trim() || !codeFilePath.trim()) {
                  toast({ title: "خطأ", description: "أدخل رابط المستودع ومسار الملف", variant: "destructive" });
                  return;
                }
                setImportingCode(true);
                try {
                  const token = localStorage.getItem("supabase_token");
                  const response = await fetch("/api/tools/import-github", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      repoUrl: codeRepoUrl,
                      filePath: codeFilePath,
                      customName: codeName || undefined,
                    }),
                  });

                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "فشل الاستيراد");
                  }

                  const data = await response.json();
                  onToolsChanged();
                  await loadTools();
                  toast({ title: "تم", description: `تم استيراد الأداة: ${data.tool.name}` });
                  setCodeRepoUrl("");
                  setCodeFilePath("");
                  setCodeName("");
                  setTab("manage");
                } catch (err) {
                  toast({ title: "خطأ", description: err instanceof Error ? err.message : "فشل الاستيراد", variant: "destructive" });
                } finally {
                  setImportingCode(false);
                }
              }}
              disabled={importingCode}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
              {importingCode ? "جاري الاستيراد..." : "استيراد من GitHub"}
            </button>
          </div>
        ) : tab === "github" ? (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">أدخل رابط ملف JSON للأدوات من GitHub وسيتم استيرادها تلقائياً.</p>
            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">رابط GitHub</label>
              <input
                type="text"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/user/repo/blob/main/tools.json"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono"
                dir="ltr"
              />
            </div>
            <div className="p-2 bg-muted/50 rounded-lg space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium">📋 صيغة الملف المدعومة:</p>
              <pre className="text-[9px] text-muted-foreground font-mono overflow-x-auto" dir="ltr">{`[{
  "tool_id": "my_tool",
  "name": "My Tool",
  "name_ar": "أداتي",
  "icon": "🔧",
  "category": "scanning",
  "description": "...",
  "args": [{"key":"target","label":"الهدف","placeholder":"example.com","required":true}],
  "execution_type": "http_fetch",
  "execution_config": {"urlTemplate":"https://api.example.com/{target}","method":"GET"}
}]`}</pre>
            </div>
            <button
              onClick={async () => {
                if (!githubUrl.trim()) {
                  toast({ title: "خطأ", description: "أدخل رابط GitHub", variant: "destructive" });
                  return;
                }
                setImporting(true);
                try {
                  const count = await importToolsFromGitHub(githubUrl);
                  onToolsChanged();
                  await loadTools();
                  toast({ title: "تم", description: `تم استيراد ${count} أداة من GitHub` });
                  setGithubUrl("");
                  setTab("manage");
                } catch (err) {
                  toast({ title: "خطأ", description: err instanceof Error ? err.message : "فشل الاستيراد", variant: "destructive" });
                } finally {
                  setImporting(false);
                }
              }}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
              {importing ? "جاري الاستيراد..." : "استيراد من GitHub"}
            </button>
          </div>
        ) : tab === "create" ? (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">الأيقونة</label>
              <div className="flex flex-wrap gap-1">
                {iconOptions.map(icon => (
                  <button key={icon} onClick={() => setTool({ ...tool, icon })}
                    className={`w-8 h-8 rounded-md text-sm flex items-center justify-center transition-all ${tool.icon === icon ? "bg-primary/20 ring-1 ring-primary" : "bg-muted hover:bg-muted/80"}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground mb-0.5 block">الاسم (English)</label>
                <input type="text" value={tool.name} onChange={e => setTool({ ...tool, name: e.target.value })}
                  placeholder="My Scanner" className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs" dir="ltr" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-0.5 block">الاسم (عربي)</label>
                <input type="text" value={tool.name_ar} onChange={e => setTool({ ...tool, name_ar: e.target.value })}
                  placeholder="أداتي المخصصة" className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs" />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">الوصف</label>
              <input type="text" value={tool.description} onChange={e => setTool({ ...tool, description: e.target.value })}
                placeholder="وصف الأداة ووظيفتها" className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs" />
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">التصنيف</label>
              <select value={tool.category} onChange={e => setTool({ ...tool, category: e.target.value as ToolCategory })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs">
                <option value="scanning">🔍 فحص واستطلاع</option>
                <option value="offensive">⚔️ هجومية</option>
                <option value="defensive">🛡️ دفاعية</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground mb-0.5 block">نوع التنفيذ</label>
              <select value={tool.execution_type} onChange={e => setTool({ ...tool, execution_type: e.target.value as CustomToolDefinition["execution_type"] })}
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs">
                <option value="http_fetch">HTTP Fetch - طلب HTTP لرابط</option>
                <option value="dns_query">DNS Query - استعلام DNS</option>
                <option value="tcp_connect">TCP Connect - اتصال TCP</option>
                <option value="custom_script">Custom Script - سكريبت مخصص</option>
              </select>
            </div>

            {tool.execution_type === "http_fetch" && (
              <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
                <label className="text-[10px] text-muted-foreground block">إعدادات HTTP</label>
                <input type="text" placeholder="URL template: https://api.example.com/{target}"
                  value={tool.execution_config.urlTemplate || ""}
                  onChange={e => setTool({ ...tool, execution_config: { ...tool.execution_config, urlTemplate: e.target.value } })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] font-mono" dir="ltr" />
                <select value={tool.execution_config.method || "GET"}
                  onChange={e => setTool({ ...tool, execution_config: { ...tool.execution_config, method: e.target.value } })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="HEAD">HEAD</option>
                </select>
              </div>
            )}

            {tool.execution_type === "custom_script" && (
              <div className="space-y-2 p-2 bg-muted/50 rounded-lg">
                <label className="text-[10px] text-muted-foreground block">سكريبت التنفيذ (JavaScript)</label>
                <textarea placeholder={`// المتغيرات المتاحة: args\nconst resp = await fetch(args.url);\nreturn "تم";`}
                  value={tool.execution_config.script || ""}
                  onChange={e => setTool({ ...tool, execution_config: { ...tool.execution_config, script: e.target.value } })}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] font-mono min-h-[100px]" dir="ltr" />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-muted-foreground">المدخلات (Arguments)</label>
                <button onClick={addArg} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                  <Plus className="w-3 h-3" /> إضافة
                </button>
              </div>
              <div className="space-y-2">
                {args.map((arg, i) => (
                  <div key={i} className="flex gap-1 items-start p-2 bg-muted/30 rounded">
                    <div className="flex-1 grid grid-cols-3 gap-1">
                      <input type="text" placeholder="key" value={arg.key} onChange={e => updateArg(i, "key", e.target.value)}
                        className="bg-background border border-border rounded px-1.5 py-1 text-[10px] font-mono" dir="ltr" />
                      <input type="text" placeholder="التسمية" value={arg.label} onChange={e => updateArg(i, "label", e.target.value)}
                        className="bg-background border border-border rounded px-1.5 py-1 text-[10px]" />
                      <input type="text" placeholder="placeholder" value={arg.placeholder} onChange={e => updateArg(i, "placeholder", e.target.value)}
                        className="bg-background border border-border rounded px-1.5 py-1 text-[10px]" dir="ltr" />
                    </div>
                    <label className="flex items-center gap-0.5 text-[9px] text-muted-foreground whitespace-nowrap">
                      <input type="checkbox" checked={arg.required || false} onChange={e => updateArg(i, "required", e.target.checked)} className="w-3 h-3" />
                      مطلوب
                    </label>
                    <button onClick={() => removeArg(i)} className="text-destructive/60 hover:text-destructive p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSave}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-xs font-medium hover:bg-primary/90 transition-colors">
              حفظ الأداة
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded border border-border text-xs hover:bg-muted transition-colors">
                <Download className="w-3 h-3" /> تصدير
              </button>
              <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded border border-border text-xs hover:bg-muted transition-colors">
                <Upload className="w-3 h-3" /> استيراد
              </button>
            </div>

            {customTools.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">لا توجد أدوات مخصصة بعد</p>
            ) : (
              <div className="space-y-1">
                {customTools.map(t => (
                  <div key={t.tool_id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                    <span>{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{t.name_ar}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{t.name} • {t.category} • {t.execution_type}</p>
                    </div>
                    <button onClick={() => handleDelete(t.tool_id)} className="text-destructive/60 hover:text-destructive p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
