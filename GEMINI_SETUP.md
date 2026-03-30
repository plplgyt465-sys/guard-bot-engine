# إعدادات Gemini AI

## نظرة عامة

تم تكوين المشروع ليستخدم **Gemini** كمزود الذكاء الاصطناعي **الوحيد والحصري**. جميع المزودين الآخرين (OpenAI, Anthropic, DeepSeek, xAI, Groq) تم حذفهم.

---

## ملفات التكوين

### 1. `/src/lib/ai-providers.ts`
- يحتوي على إعدادات Gemini فقط
- تم حذف جميع المزودين الآخرين
- Gemini هو الخيار الوحيد المتاح

### 2. `/src/components/AgentSettingsDialog.tsx`
- تم تبسيط واجهة المستخدم
- لا يوجد اختيار مزود (Gemini مفعل بشكل افتراضي)
- يمكنك إضافة عدة مفاتيح API لـ Gemini
- عند فشل مفتاح، يتم محاولة المفتاح التالي تلقائياً

### 3. `/supabase/functions/cyber-chat/index.ts`
- يحتوي على معالجة لـ Gemini API
- استخدام Gemini في الاتصال بـ Google Generative AI API

### 4. `/supabase/functions/check-api-balance/index.ts`
- تم إضافة دعم لفحص صحة مفاتيح Gemini
- يستخدم Google AI API للتحقق

### 5. `/src/utils/gemini-client.ts` (جديد)
- ملف مخصص يحتوي على وظائف Gemini
- يمكن استخدامه للاتصال المباشر بـ Gemini

---

## كيفية الاستخدام

### خطوة 1: الحصول على مفتاح API من Google

1. اذهب إلى [Google AI Studio](https://aistudio.google.com/apikey)
2. انقر على "Create API Key"
3. اختر المشروع أو أنشئ واحداً جديداً
4. انسخ المفتاح

### خطوة 2: إضافة المفتاح في الإعدادات

1. افتح تطبيق Guard Bot Engine
2. انقر على "إعدادات" في الزاوية العلوية اليسرى
3. اذهب إلى تبويب "🤖 مزود الذكاء"
4. الصق المفتاح في حقل Gemini
5. انقر على "فحص الكل" للتحقق من صحة المفتاح
6. انقر على "حفظ الإعدادات"

### خطوة 3: البدء في الاستخدام

بعد إضافة المفتاح، سيتم استخدام Gemini تلقائياً لجميع طلبات الذكاء الاصطناعي.

---

## نماذج Gemini المتاحة

- **Gemini 2.5 Pro** (موصى به) - نموذج قوي جداً
- **Gemini 2.5 Flash** - سريع وفعال
- **Gemini 2.0 Flash** - إصدار سابق
- **Gemini 1.5 Pro** - نموذج قوي من الجيل السابق
- **Gemini 1.5 Flash** - إصدار سريع من الجيل السابق

---

## معالجة الأخطاء

إذا حصلت على رسالة خطأ:

### خطأ: "Invalid API Key"
- تأكد من أن المفتاح صحيح ولم يتم نسخه بشكل خاطئ
- قد يحتاج المفتاح عدة دقائق للتفعيل بعد الإنشاء

### خطأ: "Quota Exceeded"
- تحقق من حد الرصيد في [Google Cloud Console](https://console.cloud.google.com)
- قد تحتاج إلى ترقية الحساب

### لا توجد استجابة
- تأكد من اتصال الإنترنت
- جرب مفتاح API آخر إذا كان متاحاً

---

## ملفات Gemini الرئيسية

```
src/
├── lib/
│   └── ai-providers.ts          # تعريف Gemini (وحيد)
├── utils/
│   ├── gemini-client.ts         # عميل Gemini
│   └── gemini-test.ts           # اختبار Gemini
└── components/
    └── AgentSettingsDialog.tsx  # واجهة الإعدادات

supabase/
└── functions/
    ├── cyber-chat/
    │   └── index.ts             # معالجة Gemini
    └── check-api-balance/
        └── index.ts             # فحص المفتاح
```

---

## مستويات الاستخدام والحدود

يعتمد على خطتك في Google Cloud:

- **خطة مجانية**: محدود لكن كافي للاختبار
- **خطة مدفوعة**: حدود أعلى مع خيارات متقدمة

تحقق من [Google AI Studio Pricing](https://ai.google.dev/pricing) للمزيد من التفاصيل.

---

## الدعم والتوثيق

- [Google AI Studio](https://aistudio.google.com)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Google Cloud Console](https://console.cloud.google.com)

