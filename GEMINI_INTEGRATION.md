# Gemini AI Integration

## 📋 ملخص التعديلات

تم تكوين مشروع Guard Bot Engine ليستخدم **Gemini** كمزود الذكاء الاصطناعي **الوحيد والحصري**. تم حذف جميع المزودين الآخرين (OpenAI, Anthropic, DeepSeek, xAI, Groq) من النظام.

---

## 🔧 الملفات المعدلة

### 1. **src/lib/ai-providers.ts** ✅
**التغيير:** تم استبدال قائمة المزودين بـ Gemini فقط

```typescript
export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "gemini",
    name: "Gemini",
    nameAr: "جيميني",
    baseUrl: "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    ],
  },
];
```

### 2. **src/components/AgentSettingsDialog.tsx** ✅
**التغييرات:**
- تعيين `selectedProvider` إلى "gemini" بشكل افتراضي
- تعيين `selectedModel` إلى "gemini-2.5-pro"
- تعطيل `providerEnabled` = true تلقائياً
- إزالة واجهة اختيار المزودين
- عرض رسالة توضح أن Gemini هو المزود الوحيد
- تحديث رسائل المعلومات

### 3. **supabase/functions/cyber-chat/index.ts** ✅
**التغييرات:**
- إضافة Gemini إلى `PROVIDER_CONFIGS`
- إضافة Gemini إلى `DEFAULT_MODELS` مع "gemini-2.5-pro"

### 4. **supabase/functions/check-api-balance/index.ts** ✅
**التغيير:** إضافة دعم Gemini في فحص صحة المفتاح

```typescript
else if (providerId === "google" || providerId === "gemini") {
  // Test with models list
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  // ...
}
```

---

## 📁 الملفات الجديدة

### 1. **src/utils/gemini-client.ts** ✨
ملف عميل Gemini يوفر الوظائف الأساسية:
- `buildPayload()` - بناء payload للطلب
- `parseResponse()` - معالجة الاستجابة
- `askGemini()` - الدالة الرئيسية للاتصال بـ Gemini

### 2. **src/utils/gemini-test.ts** ✨
ملف اختبار يتضمن:
- `testGemini()` - اختبار بسيط للتحقق من توصيل Gemini
- `exampleGeminiUsage()` - مثال على الاستخدام

### 3. **GEMINI_SETUP.md** 📚
دليل شامل يشرح:
- كيفية الحصول على مفتاح API
- كيفية إضافة المفتاح في الإعدادات
- نماذج Gemini المتاحة
- معالجة الأخطاء الشائعة

---

## 🚀 البدء السريع

1. **احصل على API Key:**
   - اذهب إلى [Google AI Studio](https://aistudio.google.com/apikey)
   - انقر على "Create API Key"

2. **أضفه في الإعدادات:**
   - افتح التطبيق
   - انقر على "إعدادات" → "🤖 مزود الذكاء"
   - الصق المفتاح في حقل Gemini
   - انقر على "حفظ الإعدادات"

3. **ابدأ الاستخدام:**
   - Gemini جاهز للاستخدام مباشرة!

---

## 🔑 إدارة مفاتيح Gemini

### إضافة عدة مفاتيح
يمكنك إضافة عدة مفاتيح API لـ Gemini في الإعدادات:
- عند فشل مفتاح، يتم تجربة التالي تلقائياً
- كل مفتاح يمكن أن يكون له تسمية مخصصة
- يمكن فحص صحة كل مفتاح بشكل منفصل

### التحقق من صحة المفاتيح
الضغط على أيقونة التحديث أو "فحص الكل" لمعرفة:
- ✅ مفتاح صالح
- ❌ مفتاح غير صالح
- ⚠️ لا رصيد

---

## 🛠️ المتطلبات التقنية

### البيئات المدعومة
- Node.js 18+
- TypeScript 4.5+
- React 18+
- Deno (للـ Supabase Functions)

### المكتبات المستخدمة
- `fetch` API - للاتصال بـ Gemini
- Supabase Client SDK
- UI Components (shadcn/ui)

---

## 📊 معايير الاستخدام

### الحدود المجانية
- محدودة لكن كافية للاختبار والتطوير

### خطط مدفوعة
- حدود أعلى للطلبات
- ميزات إضافية متقدمة

تحقق من [Google AI Studio Pricing](https://ai.google.dev/pricing)

---

## ⚠️ ملاحظات مهمة

1. **Gemini هو الوحيد:** جميع طلبات AI يتم معالجتها عبر Gemini حصراً
2. **التوافقية:** النظام متوافق تماماً مع Gemini API الحالي
3. **الأداء:** Gemini 2.5 Pro يوفر أفضل أداء وسرعة
4. **الأمان:** المفاتيح محفوظة بشكل آمن في قاعدة البيانات

---

## 🔗 الموارد الإضافية

- [Google AI Studio](https://aistudio.google.com)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Google Cloud Console](https://console.cloud.google.com)
- [Gemini Cookbook](https://github.com/google-gemini/cookbook)

---

## 📝 سجل التغييرات

- ✅ استبدال جميع المزودين بـ Gemini
- ✅ تبسيط واجهة الإعدادات
- ✅ إضافة ملفات عميل Gemini
- ✅ تحديث معالجة الأخطاء والفحوصات
- ✅ إضافة التوثيق الشامل

