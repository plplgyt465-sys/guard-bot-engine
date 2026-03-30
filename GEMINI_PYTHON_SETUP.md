# Gemini Python Direct Connection Setup

## Overview

الروبوت الآن مُعدّل للتواصل حصراً مع **Gemini** عبر سكريبت Python الذي يتصل مباشرة بخوادم Google بدون الحاجة لأي API keys.

The bot is now configured to communicate exclusively with **Gemini** through a Python script that connects directly to Google's servers without requiring any API keys.

## Files Used

- **`src/utils/gemini.py`** - السكريبت الأصلي Python الذي يتواصل مع Gemini
- **`src/lib/gemini-wrapper.ts`** - وحدة TypeScript تقوم بتنفيذ السكريبت
- **`src/lib/chat-stream.ts`** - معدّل ليستخدم Gemini Python بدلاً من المزودين الآخرين

## How It Works

1. المستخدم يكتب رسالة في الدردشة
2. `chat-stream.ts` يستدعي `callGeminiPython()` من `gemini-wrapper.ts`
3. `gemini-wrapper.ts` ينفذ السكريبت Python
4. السكريبت Python يتصل مباشرة بـ Gemini ويحصل على الرد
5. الرد يُعرض للمستخدم بدون تأخير

## Features

✅ **بدون API Keys** - لا حاجة لمفاتيح أو توكنات  
✅ **غير محدود** - لا حدود على عدد الطلبات  
✅ **مباشر** - الاتصال الفوري مع خوادم Gemini  
✅ **سريع** - استجابة فورية وبدون تأخير  
✅ **آمن** - السكريبت يُعمل في بيئة معزولة  

## Configuration

The bot is automatically configured with:
- Provider: **Gemini (Python Direct)**
- Model: **gemini-direct**
- No API Key Required

Simply start chatting - the Python script handles everything!

## Troubleshooting

If you get errors:
1. Ensure Python 3 is installed: `python3 --version`
2. Check that `src/utils/gemini.py` exists
3. Ensure the internet connection is stable
4. Check network for any proxies or firewalls

## Technical Details

The Python script uses:
- `requests` library for HTTP calls
- Direct connection to: `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
- Custom payload encoding and response parsing
- No authentication tokens or cookies required

## Notes

- The Python script is original and unmodified
- All other AI providers have been removed
- Communication is exclusively through the Python script
- Timeout is set to 60 seconds per request
