import { askGemini } from './gemini-client';

/**
 * اختبار بسيط لـ Gemini API
 * يوضح كيفية استخدام Gemini كمزود AI الوحيد
 */
export async function testGemini(): Promise<void> {
  console.log('🤖 Testing Gemini AI...');
  
  try {
    const testPrompt = 'Hello, what is 2+2?';
    console.log(`📝 Prompt: ${testPrompt}`);
    
    const response = await askGemini(testPrompt);
    console.log(`✅ Response: ${response}`);
    
    if (response.includes('[ERROR') || response.includes('[No response]')) {
      console.warn('⚠️ Warning: Gemini returned an error or no response');
      console.log('💡 Make sure you have configured the proper cookies/authentication');
    } else {
      console.log('🎉 Gemini is working correctly!');
    }
  } catch (error) {
    console.error('❌ Error testing Gemini:', error);
  }
}

/**
 * استخدام Gemini في التطبيق
 * مثال على استخدام askGemini في مكان آخر
 */
export async function exampleGeminiUsage(): Promise<string> {
  const prompt = 'اشرح لي ما هو الأمان السيبراني بشكل مختصر';
  return await askGemini(prompt);
}
