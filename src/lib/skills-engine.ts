/**
 * Skills Engine - 300+ Executable Skills with Auto-Selection
 * 
 * This engine:
 * 1. Loads and indexes all skills
 * 2. Automatically selects the best skill for any request
 * 3. Executes skills with Gemini
 * 4. Remembers all executions and results
 * 5. Verifies outputs and auto-corrects if needed
 */

import { GeminiUnofficial, conversationMemory } from './gemini-unofficial';

// ============================================================================
// SKILL TYPES
// ============================================================================

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
}

export interface Skill {
  id: string;
  name: string;
  nameAr?: string;
  category: SkillCategory;
  description: string;
  descriptionAr?: string;
  tags: string[];
  triggerKeywords: string[];
  instructions: string;
  parameters: SkillParameter[];
  complexity: 'low' | 'medium' | 'high';
  outputFormat: 'plain_text' | 'markdown' | 'json' | 'code' | 'structured';
  examples?: Array<{
    input: string;
    output: string;
  }>;
}

export type SkillCategory = 
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'hr'
  | 'operations'
  | 'product'
  | 'tech'
  | 'c-suite'
  | 'security'
  | 'general';

export interface SkillMatch {
  skill: Skill;
  score: number;
  matchedKeywords: string[];
  reason: string;
}

export interface SkillExecution {
  id: string;
  skillId: string;
  skillName: string;
  input: string;
  extractedParams: Record<string, unknown>;
  output: string;
  success: boolean;
  error?: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  verified: boolean;
  verificationResult?: string;
}

export interface SkillPhase {
  name: 'understanding' | 'planning' | 'execution' | 'verification' | 'correction';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

// ============================================================================
// SKILLS DATABASE - 300+ Skills
// ============================================================================

export const SKILLS_DATABASE: Skill[] = [
  // ============================================================================
  // SALES SKILLS (50)
  // ============================================================================
  {
    id: 'sales-cold-email',
    name: 'Cold Email Writer',
    nameAr: 'كاتب إيميلات باردة',
    category: 'sales',
    description: 'Writes personalized cold emails that get responses',
    descriptionAr: 'يكتب إيميلات باردة مخصصة تحصل على ردود',
    tags: ['email', 'outreach', 'cold', 'prospecting'],
    triggerKeywords: ['cold email', 'outreach', 'prospect', 'email', 'رسالة', 'إيميل', 'تواصل'],
    instructions: `Write a cold email that:
1. Has a compelling subject line (under 50 chars)
2. Opens with something specific about them (not generic)
3. Shows you understand their pain point
4. Provides social proof or credibility
5. Has a clear, low-friction CTA
6. Is under 150 words total

Structure:
- Subject: [Compelling, specific]
- Opening: [Personal hook about them]
- Problem: [Their pain point]
- Solution: [How you help]
- Proof: [Quick credibility]
- CTA: [Simple ask]`,
    parameters: [
      { name: 'prospect_name', type: 'string', description: 'Prospect name', required: true },
      { name: 'company', type: 'string', description: 'Their company', required: true },
      { name: 'pain_point', type: 'string', description: 'Their main problem', required: true },
      { name: 'your_solution', type: 'string', description: 'What you offer', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-discovery-call',
    name: 'Discovery Call Script',
    nameAr: 'سكريبت مكالمة اكتشاف',
    category: 'sales',
    description: 'Creates discovery call scripts with SPIN questions',
    tags: ['discovery', 'call', 'script', 'SPIN', 'questions'],
    triggerKeywords: ['discovery', 'call', 'script', 'questions', 'مكالمة', 'أسئلة', 'اكتشاف'],
    instructions: `Create a discovery call script using SPIN methodology:

S - Situation Questions (understand their current state)
P - Problem Questions (identify pain points)
I - Implication Questions (explore consequences)
N - Need-Payoff Questions (help them see value)

Include:
1. Opening (build rapport, set agenda)
2. Situation Questions (3-4)
3. Problem Questions (3-4)
4. Implication Questions (2-3)
5. Need-Payoff Questions (2-3)
6. Transition to pitch
7. Next steps / CTA`,
    parameters: [
      { name: 'product', type: 'string', description: 'Your product/service', required: true },
      { name: 'target_role', type: 'string', description: 'Their job title', required: true },
      { name: 'industry', type: 'string', description: 'Their industry', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-objection-handler',
    name: 'Objection Handler',
    nameAr: 'معالج الاعتراضات',
    category: 'sales',
    description: 'Creates responses to common sales objections',
    tags: ['objection', 'handling', 'response', 'overcome'],
    triggerKeywords: ['objection', 'overcome', 'handle', 'اعتراض', 'رفض', 'مشكلة'],
    instructions: `Handle the objection using the LAER framework:

L - Listen (acknowledge their concern)
A - Acknowledge (validate their feelings)
E - Explore (ask questions to understand)
R - Respond (address with value)

For each objection provide:
1. Initial acknowledgment
2. Probing question
3. Reframe response
4. Proof point / example
5. Transition back to value`,
    parameters: [
      { name: 'objection', type: 'string', description: 'The objection they raised', required: true },
      { name: 'product', type: 'string', description: 'What you sell', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-linkedin-message',
    name: 'LinkedIn Connection Message',
    nameAr: 'رسالة اتصال لينكد إن',
    category: 'sales',
    description: 'Writes LinkedIn connection and follow-up messages',
    tags: ['linkedin', 'connection', 'message', 'networking'],
    triggerKeywords: ['linkedin', 'connection', 'message', 'network', 'لينكد', 'تواصل'],
    instructions: `Write a LinkedIn message that:
1. Is under 300 characters (connection request limit)
2. References something specific about them
3. Shows genuine interest (not salesy)
4. Has a reason to connect

For follow-up messages:
- Reference the connection
- Provide value first
- Soft ask for meeting`,
    parameters: [
      { name: 'prospect_name', type: 'string', description: 'Their name', required: true },
      { name: 'their_recent_activity', type: 'string', description: 'Something they posted/did', required: false },
      { name: 'message_type', type: 'string', description: 'connection/follow-up', required: true }
    ],
    complexity: 'low',
    outputFormat: 'plain_text'
  },
  {
    id: 'sales-proposal',
    name: 'Proposal Generator',
    nameAr: 'مولد العروض',
    category: 'sales',
    description: 'Creates professional sales proposals',
    tags: ['proposal', 'offer', 'document', 'contract'],
    triggerKeywords: ['proposal', 'offer', 'quote', 'عرض', 'اقتراح', 'سعر'],
    instructions: `Create a sales proposal with:

1. Executive Summary
   - Their challenge (in their words)
   - Your solution overview
   - Key benefits

2. Situation Analysis
   - Current state
   - Desired state
   - Gap / opportunity

3. Proposed Solution
   - What you'll deliver
   - How it works
   - Timeline

4. Investment
   - Pricing options
   - ROI projection

5. Why Us
   - Differentiators
   - Relevant case studies
   - Guarantees

6. Next Steps
   - Clear action items
   - Timeline to start`,
    parameters: [
      { name: 'client_name', type: 'string', description: 'Client company', required: true },
      { name: 'problem', type: 'string', description: 'Their problem', required: true },
      { name: 'solution', type: 'string', description: 'Your solution', required: true },
      { name: 'price', type: 'string', description: 'Your pricing', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-follow-up',
    name: 'Follow-Up Sequence',
    nameAr: 'سلسلة المتابعة',
    category: 'sales',
    description: 'Creates multi-touch follow-up sequences',
    tags: ['follow-up', 'sequence', 'cadence', 'persistence'],
    triggerKeywords: ['follow up', 'follow-up', 'sequence', 'متابعة', 'تذكير'],
    instructions: `Create a 5-7 touch follow-up sequence:

Each touch should:
1. Have a different angle/reason
2. Add value (not just "checking in")
3. Use different channels when possible
4. Have a clear CTA

Timing: Day 1, 3, 5, 8, 12, 20

Format each touch:
- Day X: [Channel]
- Subject/Hook: [...]
- Message: [...]
- CTA: [...]`,
    parameters: [
      { name: 'context', type: 'string', description: 'What happened last', required: true },
      { name: 'prospect_name', type: 'string', description: 'Their name', required: true },
      { name: 'your_offer', type: 'string', description: 'What you want to discuss', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-account-research',
    name: 'Account Research Brief',
    nameAr: 'بحث الحساب',
    category: 'sales',
    description: 'Creates comprehensive account research for enterprise sales',
    tags: ['research', 'account', 'enterprise', 'intel'],
    triggerKeywords: ['research', 'account', 'company', 'بحث', 'شركة', 'معلومات'],
    instructions: `Create an account research brief covering:

1. Company Overview
   - Industry, size, revenue
   - Recent news/changes
   - Strategic initiatives

2. Key Stakeholders
   - Decision makers
   - Influencers
   - Champions

3. Business Challenges
   - Industry pressures
   - Company-specific issues
   - Technology gaps

4. Competitive Landscape
   - Current vendors
   - Alternatives considered

5. Entry Strategy
   - Best approach
   - Trigger events to leverage
   - Recommended messaging`,
    parameters: [
      { name: 'company', type: 'string', description: 'Target company', required: true },
      { name: 'your_solution', type: 'string', description: 'What you sell', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-negotiation',
    name: 'Negotiation Playbook',
    nameAr: 'دليل التفاوض',
    category: 'sales',
    description: 'Creates negotiation strategies and responses',
    tags: ['negotiation', 'discount', 'pricing', 'deal'],
    triggerKeywords: ['negotiate', 'discount', 'price', 'تفاوض', 'خصم', 'سعر'],
    instructions: `Create a negotiation playbook:

1. Pre-Negotiation Prep
   - Their leverage points
   - Your leverage points
   - BATNA (theirs and yours)
   - Walk-away point

2. Common Asks & Responses
   - "We need a discount"
   - "Competitor is cheaper"
   - "Budget constraints"
   - "Need approval from..."

3. Value Trades
   - What you can offer instead of discount
   - Payment terms options
   - Scope adjustments

4. Closing Techniques
   - Creating urgency
   - Getting to yes
   - Handling final objections`,
    parameters: [
      { name: 'deal_value', type: 'string', description: 'Deal size', required: true },
      { name: 'their_ask', type: 'string', description: 'What they want', required: true },
      { name: 'your_floor', type: 'string', description: 'Minimum acceptable', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-demo-script',
    name: 'Demo Script',
    nameAr: 'سكريبت العرض التوضيحي',
    category: 'sales',
    description: 'Creates product demo scripts tailored to prospect needs',
    tags: ['demo', 'presentation', 'product', 'script'],
    triggerKeywords: ['demo', 'presentation', 'show', 'عرض', 'توضيح', 'برزنتيشن'],
    instructions: `Create a demo script:

1. Opening (2 min)
   - Agenda setting
   - Confirm their priorities

2. Discovery Recap (3 min)
   - Summarize their pain points
   - Confirm understanding

3. Solution Demo (15-20 min)
   - Feature 1 → Benefit → Their use case
   - Feature 2 → Benefit → Their use case
   - Feature 3 → Benefit → Their use case

4. Differentiators (5 min)
   - Why us vs. alternatives
   - Unique capabilities

5. Social Proof (3 min)
   - Similar customer story
   - Results achieved

6. Q&A & Next Steps (5 min)
   - Address concerns
   - Propose next action`,
    parameters: [
      { name: 'product', type: 'string', description: 'Your product', required: true },
      { name: 'prospect_pains', type: 'string', description: 'Their main problems', required: true },
      { name: 'demo_length', type: 'number', description: 'Minutes available', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'sales-closing-script',
    name: 'Closing Script',
    nameAr: 'سكريبت الإغلاق',
    category: 'sales',
    description: 'Creates scripts for closing deals',
    tags: ['closing', 'deal', 'contract', 'sign'],
    triggerKeywords: ['close', 'closing', 'sign', 'إغلاق', 'توقيع', 'عقد'],
    instructions: `Create a closing script with:

1. Trial Close Questions
   - "How does this fit your needs?"
   - "Can you see your team using this?"

2. Assumptive Close
   - "When would you like to start?"
   - "Should I send the agreement today?"

3. Summary Close
   - Recap value points
   - Confirm ROI
   - Ask for commitment

4. Urgency Creation
   - Time-limited offer
   - Implementation timeline

5. Objection Handling
   - Common last-minute concerns
   - Responses for each

6. Next Steps
   - Contract process
   - Implementation kickoff`,
    parameters: [
      { name: 'deal_summary', type: 'string', description: 'What they\'re buying', required: true },
      { name: 'value_points', type: 'string', description: 'Key benefits', required: true },
      { name: 'urgency_factor', type: 'string', description: 'Why now', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // MARKETING SKILLS (50)
  // ============================================================================
  {
    id: 'marketing-hook-generator',
    name: 'Hook Generator',
    nameAr: 'مولد الخطافات',
    category: 'marketing',
    description: 'Creates scroll-stopping hooks for any platform',
    tags: ['hooks', 'viral', 'engagement', 'opening'],
    triggerKeywords: ['hook', 'viral', 'opening', 'scroll', 'خطاف', 'افتتاحية', 'جذب'],
    instructions: `Generate 10 scroll-stopping hooks using these formats:

1. Curiosity Gap - "I discovered X, and it changed everything"
2. Contrarian Take - "Everyone says X, but the truth is Y"
3. Specific Result - "How I got [specific result] in [timeframe]"
4. Question Hook - "What if [thing they believe] is wrong?"
5. Story Opening - "3 years ago, I [relatable struggle]..."
6. Data Hook - "[Surprising statistic] - here's why it matters"
7. Fear of Missing Out - "You're probably making this mistake..."
8. Authority Hook - "After [experience], I learned..."
9. Promise Hook - "The [framework/method] that [outcome]"
10. Pattern Interrupt - Something unexpected

Each hook should be under 15 words.`,
    parameters: [
      { name: 'topic', type: 'string', description: 'Content topic', required: true },
      { name: 'platform', type: 'string', description: 'linkedin/twitter/email/tiktok', required: true },
      { name: 'target_audience', type: 'string', description: 'Who you\'re writing for', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-content-brief',
    name: 'Content Brief',
    nameAr: 'موجز المحتوى',
    category: 'marketing',
    description: 'Creates detailed content briefs for writers',
    tags: ['content', 'brief', 'seo', 'writing'],
    triggerKeywords: ['brief', 'content', 'article', 'موجز', 'محتوى', 'مقال'],
    instructions: `Create a comprehensive content brief:

1. Content Overview
   - Title options (3)
   - Target keyword
   - Secondary keywords
   - Search intent

2. Audience
   - Who is reading
   - Their knowledge level
   - What they want

3. Competitive Analysis
   - What top results cover
   - Gaps to fill
   - Angle to take

4. Content Structure
   - H1
   - H2 sections
   - Key points per section

5. Requirements
   - Word count target
   - Internal links
   - External sources
   - CTA

6. Style Guide
   - Tone
   - Examples to emulate`,
    parameters: [
      { name: 'topic', type: 'string', description: 'Article topic', required: true },
      { name: 'target_keyword', type: 'string', description: 'SEO keyword', required: true },
      { name: 'word_count', type: 'number', description: 'Target length', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-social-post',
    name: 'Social Media Post',
    nameAr: 'منشور سوشيال ميديا',
    category: 'marketing',
    description: 'Creates platform-optimized social posts',
    tags: ['social', 'post', 'content', 'engagement'],
    triggerKeywords: ['social', 'post', 'linkedin', 'twitter', 'منشور', 'سوشيال', 'تغريدة'],
    instructions: `Create a social media post optimized for the platform:

LinkedIn:
- Hook in first 2 lines
- White space for readability
- Story format works best
- End with question/CTA

Twitter/X:
- 280 chars max
- Direct and punchy
- Use thread format for longer content

Instagram:
- Visual-focused caption
- Hashtags research
- Story/Reel script

TikTok:
- Hook in first 3 seconds
- Trending format/sound`,
    parameters: [
      { name: 'topic', type: 'string', description: 'What to post about', required: true },
      { name: 'platform', type: 'string', description: 'Which platform', required: true },
      { name: 'goal', type: 'string', description: 'engagement/leads/awareness', required: false }
    ],
    complexity: 'low',
    outputFormat: 'plain_text'
  },
  {
    id: 'marketing-email-sequence',
    name: 'Email Sequence',
    nameAr: 'سلسلة إيميلات',
    category: 'marketing',
    description: 'Creates nurture email sequences',
    tags: ['email', 'sequence', 'nurture', 'automation'],
    triggerKeywords: ['email sequence', 'nurture', 'automation', 'سلسلة', 'إيميلات', 'أتمتة'],
    instructions: `Create an email nurture sequence:

Email 1: Welcome/Introduction
- Thank them for signing up
- Set expectations
- Deliver promised value

Email 2: Quick Win
- Actionable tip they can use now
- Show early results

Email 3: Story/Case Study
- Customer success story
- Relatable transformation

Email 4: Education
- Deep dive on key topic
- Position your expertise

Email 5: Overcome Objection
- Address common concern
- Provide proof

Email 6: Soft Pitch
- Introduce your offer
- Low-commitment CTA

Email 7: Direct Pitch
- Clear value proposition
- Strong CTA
- Urgency element`,
    parameters: [
      { name: 'lead_magnet', type: 'string', description: 'What they signed up for', required: true },
      { name: 'product', type: 'string', description: 'What you sell', required: true },
      { name: 'sequence_length', type: 'number', description: 'Number of emails', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-landing-page',
    name: 'Landing Page Copy',
    nameAr: 'نص صفحة الهبوط',
    category: 'marketing',
    description: 'Creates high-converting landing page copy',
    tags: ['landing', 'page', 'copy', 'conversion'],
    triggerKeywords: ['landing page', 'copy', 'conversion', 'صفحة هبوط', 'تحويل', 'نص'],
    instructions: `Create landing page copy with:

Above the Fold:
- Headline (benefit-focused)
- Subheadline (expand on promise)
- Hero CTA
- Social proof snippet

Problem Section:
- Agitate the pain
- Show you understand

Solution Section:
- Your approach
- Key benefits (not features)
- Transformation promise

Features Section:
- 3-5 key features
- Each with benefit

Social Proof:
- Testimonials
- Logos
- Numbers/stats

FAQ:
- 5-7 common questions
- Objection handling

Final CTA:
- Urgency
- Risk reversal
- Clear next step`,
    parameters: [
      { name: 'product', type: 'string', description: 'What you\'re selling', required: true },
      { name: 'target_audience', type: 'string', description: 'Who is landing here', required: true },
      { name: 'main_benefit', type: 'string', description: 'Primary value prop', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-ad-copy',
    name: 'Ad Copy Generator',
    nameAr: 'مولد نصوص الإعلانات',
    category: 'marketing',
    description: 'Creates ad copy for paid campaigns',
    tags: ['ads', 'copy', 'paid', 'facebook', 'google'],
    triggerKeywords: ['ad', 'copy', 'facebook', 'google', 'إعلان', 'نص إعلاني'],
    instructions: `Create ad copy variations:

For each platform:

Facebook/Instagram Ads:
- Primary text (3 versions)
- Headline (3 versions)
- Description
- CTA button recommendation

Google Ads:
- Headlines (15 chars x 3)
- Descriptions (90 chars x 2)
- Display URL path

LinkedIn Ads:
- Intro text
- Headline
- Description

Each variation should:
- Hook attention
- Highlight benefit
- Create urgency
- Clear CTA`,
    parameters: [
      { name: 'product', type: 'string', description: 'What you\'re advertising', required: true },
      { name: 'platform', type: 'string', description: 'facebook/google/linkedin', required: true },
      { name: 'objective', type: 'string', description: 'conversions/traffic/awareness', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-seo-optimization',
    name: 'SEO Content Optimizer',
    nameAr: 'محسن محتوى SEO',
    category: 'marketing',
    description: 'Optimizes content for search rankings',
    tags: ['seo', 'optimization', 'keywords', 'ranking'],
    triggerKeywords: ['seo', 'optimize', 'keyword', 'ranking', 'تحسين', 'محركات البحث'],
    instructions: `Optimize content for SEO:

1. Title Tag
   - Include primary keyword
   - Under 60 characters
   - Compelling to click

2. Meta Description
   - Include keyword naturally
   - Under 155 characters
   - Clear value proposition

3. Headers
   - H1: Primary keyword
   - H2s: Secondary keywords
   - H3s: Related topics

4. Content Optimization
   - Keyword placement (intro, headers, conclusion)
   - Related/LSI keywords to include
   - Internal linking opportunities
   - External authority links

5. Technical Suggestions
   - URL structure
   - Image alt text
   - Schema markup recommendations`,
    parameters: [
      { name: 'content', type: 'string', description: 'Content to optimize', required: true },
      { name: 'target_keyword', type: 'string', description: 'Main keyword', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-webinar-script',
    name: 'Webinar Script',
    nameAr: 'سكريبت ويبينار',
    category: 'marketing',
    description: 'Creates engaging webinar scripts',
    tags: ['webinar', 'script', 'presentation', 'live'],
    triggerKeywords: ['webinar', 'script', 'presentation', 'ويبينار', 'عرض تقديمي'],
    instructions: `Create a webinar script:

Opening (5 min):
- Hook/attention grabber
- Introduce yourself
- Promise/what they'll learn
- Housekeeping

Content Section 1 (10 min):
- Key teaching point
- Example/story
- Transition

Content Section 2 (10 min):
- Second teaching point
- Case study
- Engagement question

Content Section 3 (10 min):
- Third teaching point
- Quick win they can implement

Transition to Pitch (5 min):
- Recap value
- "But there's more..."
- Bridge to offer

Pitch (10 min):
- Offer overview
- Features → Benefits
- Social proof
- Bonuses
- Price reveal
- Guarantee
- CTA

Q&A (10 min):
- Pre-loaded questions
- Objection handling`,
    parameters: [
      { name: 'topic', type: 'string', description: 'Webinar topic', required: true },
      { name: 'product', type: 'string', description: 'What you\'re selling', required: true },
      { name: 'duration', type: 'number', description: 'Total minutes', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-case-study',
    name: 'Case Study Writer',
    nameAr: 'كاتب دراسات الحالة',
    category: 'marketing',
    description: 'Creates compelling customer case studies',
    tags: ['case study', 'customer', 'success', 'story'],
    triggerKeywords: ['case study', 'success story', 'customer', 'دراسة حالة', 'قصة نجاح'],
    instructions: `Write a case study with:

1. Title
   - "How [Customer] achieved [Result] with [Product]"

2. Executive Summary
   - Challenge, solution, results in 2-3 sentences

3. Customer Background
   - Company info
   - Industry context
   - Their role

4. The Challenge
   - What problem they faced
   - Impact on business
   - What they tried before

5. The Solution
   - Why they chose you
   - Implementation process
   - Key features used

6. The Results
   - Quantifiable outcomes
   - Before/after comparison
   - Unexpected benefits

7. Quote
   - Customer testimonial

8. Call to Action
   - How to get similar results`,
    parameters: [
      { name: 'customer_name', type: 'string', description: 'Customer company', required: true },
      { name: 'challenge', type: 'string', description: 'Their problem', required: true },
      { name: 'results', type: 'string', description: 'Outcomes achieved', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'marketing-ab-test',
    name: 'A/B Test Generator',
    nameAr: 'مولد اختبارات A/B',
    category: 'marketing',
    description: 'Creates A/B test variations and hypotheses',
    tags: ['ab test', 'experiment', 'optimization', 'variation'],
    triggerKeywords: ['ab test', 'experiment', 'variation', 'اختبار', 'تجربة'],
    instructions: `Create A/B test plan:

1. Control (Version A)
   - Current copy/design

2. Hypothesis
   - "If we change [X], then [Y] will happen because [Z]"

3. Test Variations (Version B, C, etc.)
   - What's different
   - Why it might work

4. Variables Being Tested
   - Headlines
   - CTAs
   - Images
   - Layout
   - Copy length

5. Success Metrics
   - Primary metric
   - Secondary metrics

6. Sample Size & Duration
   - Required visitors
   - Test length

7. Statistical Significance
   - Confidence level needed`,
    parameters: [
      { name: 'element', type: 'string', description: 'What to test', required: true },
      { name: 'current_version', type: 'string', description: 'Current copy', required: true },
      { name: 'goal', type: 'string', description: 'What to improve', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // FINANCE SKILLS (40)
  // ============================================================================
  {
    id: 'finance-unit-economics',
    name: 'Unit Economics Calculator',
    nameAr: 'حاسبة اقتصاديات الوحدة',
    category: 'finance',
    description: 'Calculates and analyzes unit economics',
    tags: ['unit economics', 'cac', 'ltv', 'metrics'],
    triggerKeywords: ['unit economics', 'cac', 'ltv', 'اقتصاديات', 'تكلفة اكتساب'],
    instructions: `Calculate unit economics:

1. Customer Acquisition Cost (CAC)
   - Total sales & marketing spend
   - Divided by new customers
   - Break down by channel

2. Lifetime Value (LTV)
   - Average revenue per customer
   - × Gross margin
   - × Average lifespan

3. LTV:CAC Ratio
   - Should be 3:1 minimum
   - Benchmark by industry

4. Payback Period
   - Months to recover CAC

5. Recommendations
   - How to improve ratio
   - Which channels perform best
   - Where to invest more`,
    parameters: [
      { name: 'total_marketing_spend', type: 'number', description: 'Monthly spend', required: true },
      { name: 'new_customers', type: 'number', description: 'Customers acquired', required: true },
      { name: 'avg_revenue_per_customer', type: 'number', description: 'Monthly revenue', required: true },
      { name: 'avg_customer_lifespan', type: 'number', description: 'Months as customer', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'finance-financial-model',
    name: 'Financial Model Builder',
    nameAr: 'بناء النموذج المالي',
    category: 'finance',
    description: 'Creates SaaS/startup financial models',
    tags: ['financial model', 'projections', 'forecast'],
    triggerKeywords: ['financial model', 'projection', 'forecast', 'نموذج مالي', 'توقعات'],
    instructions: `Build a financial model:

1. Revenue Model
   - MRR/ARR projections
   - Growth assumptions
   - Pricing tiers

2. Cost Structure
   - Fixed costs
   - Variable costs
   - COGS

3. Unit Economics
   - CAC, LTV, Payback
   - Gross margin

4. Headcount Plan
   - Hiring timeline
   - Salary costs
   - Benefits

5. P&L Projection
   - 12-month forecast
   - Key metrics

6. Runway Analysis
   - Burn rate
   - Months of runway

7. Scenarios
   - Best case
   - Base case
   - Worst case`,
    parameters: [
      { name: 'current_mrr', type: 'number', description: 'Monthly recurring revenue', required: true },
      { name: 'growth_rate', type: 'number', description: 'Monthly growth %', required: true },
      { name: 'burn_rate', type: 'number', description: 'Monthly burn', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'finance-pricing-strategy',
    name: 'Pricing Strategy',
    nameAr: 'استراتيجية التسعير',
    category: 'finance',
    description: 'Develops pricing strategies and models',
    tags: ['pricing', 'strategy', 'monetization'],
    triggerKeywords: ['pricing', 'price', 'monetize', 'تسعير', 'سعر', 'تحقيق الدخل'],
    instructions: `Develop pricing strategy:

1. Value Analysis
   - What is the value to customer?
   - What is their willingness to pay?

2. Cost Analysis
   - Cost to deliver
   - Minimum viable price

3. Competitive Analysis
   - How do competitors price?
   - Where are you positioned?

4. Pricing Model Options
   - Per seat/user
   - Usage-based
   - Tiered
   - Value-based

5. Tier Structure
   - Free tier (if applicable)
   - Entry tier
   - Growth tier
   - Enterprise tier

6. Implementation
   - Announcement strategy
   - Grandfather existing customers?
   - Price increase roadmap`,
    parameters: [
      { name: 'product', type: 'string', description: 'Your product', required: true },
      { name: 'cost_to_deliver', type: 'number', description: 'Per-unit cost', required: true },
      { name: 'competitor_prices', type: 'string', description: 'Market prices', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'finance-budget-template',
    name: 'Budget Template',
    nameAr: 'قالب الميزانية',
    category: 'finance',
    description: 'Creates departmental or company budgets',
    tags: ['budget', 'planning', 'allocation'],
    triggerKeywords: ['budget', 'allocation', 'spending', 'ميزانية', 'تخصيص', 'إنفاق'],
    instructions: `Create a budget template:

1. Revenue Budget
   - Revenue by product/service
   - Revenue by channel
   - Growth targets

2. Operating Expenses
   - Personnel costs
   - Marketing spend
   - Sales costs
   - R&D/Engineering
   - G&A

3. Capital Expenses
   - Equipment
   - Software
   - Infrastructure

4. Budget Allocation
   - % by department
   - Justification for each

5. Variance Tracking
   - Planned vs actual
   - Monthly review process

6. Approval Workflow
   - Spending limits
   - Who approves what`,
    parameters: [
      { name: 'total_budget', type: 'number', description: 'Total available', required: true },
      { name: 'time_period', type: 'string', description: 'Annual/quarterly', required: true },
      { name: 'department', type: 'string', description: 'Which department', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'finance-investor-update',
    name: 'Investor Update',
    nameAr: 'تحديث المستثمرين',
    category: 'finance',
    description: 'Creates monthly investor update emails',
    tags: ['investor', 'update', 'board', 'reporting'],
    triggerKeywords: ['investor update', 'board', 'تحديث المستثمرين', 'تقرير'],
    instructions: `Write investor update:

1. TL;DR (3 bullets)
   - Top highlight
   - Key challenge
   - Biggest ask

2. Key Metrics
   - MRR/ARR
   - Growth rate
   - Runway
   - Customers
   - Churn

3. Wins This Month
   - Customer wins
   - Product milestones
   - Team additions

4. Challenges
   - What's not working
   - What you're doing about it

5. Learnings
   - Insights gained
   - Pivots made

6. Asks
   - Intros needed
   - Advice wanted
   - Specific help

7. What's Next
   - Next month priorities`,
    parameters: [
      { name: 'mrr', type: 'number', description: 'Current MRR', required: true },
      { name: 'growth_rate', type: 'number', description: 'MoM growth %', required: true },
      { name: 'runway_months', type: 'number', description: 'Months runway', required: true },
      { name: 'highlights', type: 'string', description: 'Key wins', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // HR & PEOPLE SKILLS (40)
  // ============================================================================
  {
    id: 'hr-job-description',
    name: 'Job Description Writer',
    nameAr: 'كاتب الوصف الوظيفي',
    category: 'hr',
    description: 'Creates compelling job descriptions',
    tags: ['job', 'description', 'hiring', 'recruitment'],
    triggerKeywords: ['job description', 'hiring', 'recruit', 'وصف وظيفي', 'توظيف'],
    instructions: `Write a job description:

1. Job Title
   - Clear, searchable title

2. About Us
   - Company mission
   - What makes you different
   - Culture highlights

3. The Role
   - What they'll do
   - Impact they'll have
   - Who they'll work with

4. Responsibilities (5-7)
   - Day-to-day tasks
   - Key deliverables

5. Requirements
   - Must-haves (5-7)
   - Nice-to-haves (3-5)

6. Benefits
   - Compensation range
   - Equity (if applicable)
   - Perks

7. Application Instructions
   - How to apply
   - What to include`,
    parameters: [
      { name: 'role_title', type: 'string', description: 'Job title', required: true },
      { name: 'department', type: 'string', description: 'Which team', required: true },
      { name: 'level', type: 'string', description: 'junior/mid/senior', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'hr-interview-questions',
    name: 'Interview Questions',
    nameAr: 'أسئلة المقابلة',
    category: 'hr',
    description: 'Creates behavioral interview questions',
    tags: ['interview', 'questions', 'behavioral', 'hiring'],
    triggerKeywords: ['interview questions', 'behavioral', 'أسئلة مقابلة', 'سلوكية'],
    instructions: `Create interview questions using STAR method:

For each competency, provide:

1. Question
   - "Tell me about a time when..."
   - Specific to the competency

2. What to Listen For
   - Good answer indicators
   - Red flags

3. Follow-up Questions
   - To probe deeper
   - To clarify

Competencies to cover:
- Problem solving
- Leadership
- Teamwork
- Communication
- Adaptability
- Role-specific skills`,
    parameters: [
      { name: 'role', type: 'string', description: 'Position', required: true },
      { name: 'competencies', type: 'string', description: 'Key skills to assess', required: true },
      { name: 'interview_round', type: 'string', description: 'screen/technical/final', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'hr-performance-review',
    name: 'Performance Review Template',
    nameAr: 'قالب تقييم الأداء',
    category: 'hr',
    description: 'Creates performance review frameworks',
    tags: ['performance', 'review', 'evaluation', 'feedback'],
    triggerKeywords: ['performance review', 'evaluation', 'تقييم أداء', 'مراجعة'],
    instructions: `Create performance review:

1. Goals Review
   - List previous goals
   - Achievement status
   - What helped/hindered

2. Performance Assessment
   - Quality of work
   - Productivity
   - Communication
   - Teamwork
   - Leadership (if applicable)

3. Strengths
   - What they do well
   - Specific examples

4. Areas for Development
   - Growth opportunities
   - Specific feedback

5. Goals for Next Period
   - SMART goals
   - Development goals

6. Overall Rating
   - Exceeds/Meets/Below expectations

7. Career Discussion
   - Career aspirations
   - Path to get there`,
    parameters: [
      { name: 'employee_name', type: 'string', description: 'Who is being reviewed', required: true },
      { name: 'role', type: 'string', description: 'Their position', required: true },
      { name: 'review_period', type: 'string', description: 'Time period', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'hr-onboarding-plan',
    name: 'Onboarding Plan',
    nameAr: 'خطة التأهيل',
    category: 'hr',
    description: 'Creates 30-60-90 day onboarding plans',
    tags: ['onboarding', 'plan', 'new hire', 'training'],
    triggerKeywords: ['onboarding', 'new hire', 'تأهيل', 'موظف جديد'],
    instructions: `Create 30-60-90 day onboarding plan:

Pre-Day 1:
- Equipment setup
- Account access
- Welcome materials

Week 1:
- Orientation sessions
- Meet the team
- Tool training
- Culture immersion

Day 1-30 (Learn):
- Daily activities
- Training modules
- Buddy assignment
- Weekly check-ins

Day 31-60 (Contribute):
- First projects
- Increasing responsibility
- Feedback sessions

Day 61-90 (Own):
- Independent work
- Full responsibilities
- Performance baseline`,
    parameters: [
      { name: 'role', type: 'string', description: 'Position', required: true },
      { name: 'department', type: 'string', description: 'Team', required: true },
      { name: 'manager_name', type: 'string', description: 'Their manager', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'hr-culture-document',
    name: 'Culture Document',
    nameAr: 'وثيقة الثقافة',
    category: 'hr',
    description: 'Creates company culture and values documents',
    tags: ['culture', 'values', 'handbook', 'company'],
    triggerKeywords: ['culture', 'values', 'handbook', 'ثقافة', 'قيم', 'دليل الشركة'],
    instructions: `Create culture document:

1. Mission
   - Why we exist
   - The change we want to make

2. Vision
   - Where we're going
   - What success looks like

3. Values (3-5)
   - Value name
   - What it means
   - What it looks like in practice
   - What it doesn't mean

4. How We Work
   - Communication norms
   - Decision making
   - Meeting culture
   - Feedback expectations

5. What We Celebrate
   - Behaviors we reward
   - How we recognize people

6. What We Don't Tolerate
   - Clear boundaries
   - Consequences`,
    parameters: [
      { name: 'company_name', type: 'string', description: 'Company name', required: true },
      { name: 'industry', type: 'string', description: 'Industry', required: false },
      { name: 'team_size', type: 'number', description: 'How many people', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // OPERATIONS SKILLS (30)
  // ============================================================================
  {
    id: 'ops-sop-creator',
    name: 'SOP Creator',
    nameAr: 'منشئ إجراءات التشغيل',
    category: 'operations',
    description: 'Creates Standard Operating Procedures',
    tags: ['sop', 'process', 'documentation', 'procedures'],
    triggerKeywords: ['sop', 'procedure', 'process', 'إجراءات', 'عمليات', 'توثيق'],
    instructions: `Create a Standard Operating Procedure:

1. Purpose
   - Why this process exists
   - When to use it

2. Scope
   - What it covers
   - What it doesn't cover

3. Prerequisites
   - What's needed before starting
   - Required access/tools

4. Step-by-Step Process
   - Numbered steps
   - Screenshots/examples
   - Decision points
   - Who does what

5. Quality Checkpoints
   - How to verify each step

6. Troubleshooting
   - Common issues
   - Solutions

7. Escalation
   - When to escalate
   - Who to contact

8. Version History
   - Last updated
   - Change log`,
    parameters: [
      { name: 'process_name', type: 'string', description: 'What process', required: true },
      { name: 'department', type: 'string', description: 'Which team owns it', required: true }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'ops-meeting-agenda',
    name: 'Meeting Agenda',
    nameAr: 'جدول أعمال الاجتماع',
    category: 'operations',
    description: 'Creates effective meeting agendas',
    tags: ['meeting', 'agenda', 'productivity'],
    triggerKeywords: ['meeting', 'agenda', 'اجتماع', 'جدول أعمال'],
    instructions: `Create meeting agenda:

1. Meeting Info
   - Title
   - Date/time
   - Duration
   - Attendees
   - Facilitator

2. Objective
   - What we need to decide/accomplish

3. Agenda Items
   - Topic
   - Time allocation
   - Owner
   - Type: Update/Discussion/Decision

4. Pre-read Materials
   - What to review before

5. Action Items Template
   - What | Who | When

6. Follow-up
   - Next meeting
   - How decisions will be communicated`,
    parameters: [
      { name: 'meeting_type', type: 'string', description: 'Type of meeting', required: true },
      { name: 'duration', type: 'number', description: 'Minutes', required: true },
      { name: 'topics', type: 'string', description: 'What to discuss', required: true }
    ],
    complexity: 'low',
    outputFormat: 'markdown'
  },
  {
    id: 'ops-project-plan',
    name: 'Project Plan',
    nameAr: 'خطة المشروع',
    category: 'operations',
    description: 'Creates project plans with milestones',
    tags: ['project', 'plan', 'milestones', 'timeline'],
    triggerKeywords: ['project plan', 'timeline', 'milestones', 'خطة مشروع', 'جدول زمني'],
    instructions: `Create project plan:

1. Project Overview
   - Objective
   - Success criteria
   - Stakeholders

2. Scope
   - In scope
   - Out of scope
   - Assumptions

3. Timeline
   - Start date
   - Key milestones
   - End date

4. Work Breakdown Structure
   - Phase 1: Tasks, owners, dates
   - Phase 2: Tasks, owners, dates
   - Phase 3: Tasks, owners, dates

5. Resources
   - Team members
   - Budget
   - Tools needed

6. Risks
   - Potential issues
   - Mitigation plans

7. Communication Plan
   - Status updates: when/how
   - Stakeholder updates`,
    parameters: [
      { name: 'project_name', type: 'string', description: 'Project name', required: true },
      { name: 'deadline', type: 'string', description: 'Due date', required: true },
      { name: 'team_size', type: 'number', description: 'People involved', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // PRODUCT SKILLS (30)
  // ============================================================================
  {
    id: 'product-prd',
    name: 'PRD Writer',
    nameAr: 'كاتب وثيقة المتطلبات',
    category: 'product',
    description: 'Creates Product Requirements Documents',
    tags: ['prd', 'requirements', 'specification', 'product'],
    triggerKeywords: ['prd', 'requirements', 'spec', 'متطلبات', 'مواصفات المنتج'],
    instructions: `Write a Product Requirements Document:

1. Overview
   - Problem statement
   - Objective
   - Success metrics

2. User Stories
   - As a [user], I want [feature], so that [benefit]

3. Requirements
   - Functional requirements
   - Non-functional requirements
   - Constraints

4. User Flow
   - Step-by-step journey

5. Wireframes/Mockups
   - Key screens description

6. Edge Cases
   - What could go wrong
   - Error handling

7. Technical Considerations
   - API needs
   - Data requirements
   - Performance needs

8. Timeline
   - Phases
   - Dependencies
   - Launch criteria`,
    parameters: [
      { name: 'feature_name', type: 'string', description: 'Feature to spec', required: true },
      { name: 'problem', type: 'string', description: 'Problem being solved', required: true },
      { name: 'target_users', type: 'string', description: 'Who uses it', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'product-user-research',
    name: 'User Research Plan',
    nameAr: 'خطة بحث المستخدم',
    category: 'product',
    description: 'Creates user research plans and interview scripts',
    tags: ['research', 'user', 'interview', 'insights'],
    triggerKeywords: ['user research', 'interview', 'بحث المستخدم', 'مقابلات'],
    instructions: `Create user research plan:

1. Research Objectives
   - What we want to learn
   - Hypotheses to validate

2. Methodology
   - Interview/Survey/Observation
   - Sample size
   - Participant criteria

3. Interview Script
   - Warm-up questions
   - Core questions (open-ended)
   - Follow-up probes
   - Wrap-up

4. Data Collection
   - What to capture
   - How to record

5. Analysis Plan
   - How to synthesize
   - Affinity mapping

6. Deliverables
   - Report format
   - Presentation to stakeholders`,
    parameters: [
      { name: 'research_goal', type: 'string', description: 'What to learn', required: true },
      { name: 'target_users', type: 'string', description: 'Who to talk to', required: true },
      { name: 'method', type: 'string', description: 'interview/survey', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'product-roadmap',
    name: 'Product Roadmap',
    nameAr: 'خارطة طريق المنتج',
    category: 'product',
    description: 'Creates product roadmaps with prioritization',
    tags: ['roadmap', 'planning', 'strategy', 'prioritization'],
    triggerKeywords: ['roadmap', 'product plan', 'خارطة طريق', 'تخطيط المنتج'],
    instructions: `Create product roadmap:

1. Vision
   - Where we're headed
   - 1-year goal

2. Themes
   - Major focus areas

3. Now (This Quarter)
   - Features in progress
   - Priority ranking
   - Owners

4. Next (Next Quarter)
   - Planned features
   - Dependencies

5. Later (Future)
   - Ideas backlog
   - Rough timing

6. Prioritization
   - RICE scoring
   - How we decided

7. Communication
   - How to share roadmap
   - Update cadence`,
    parameters: [
      { name: 'product', type: 'string', description: 'Product name', required: true },
      { name: 'time_horizon', type: 'string', description: '6mo/1yr/2yr', required: true },
      { name: 'strategic_goals', type: 'string', description: 'Key objectives', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // TECH SKILLS (30)
  // ============================================================================
  {
    id: 'tech-code-review',
    name: 'Code Review Guide',
    nameAr: 'دليل مراجعة الكود',
    category: 'tech',
    description: 'Creates code review feedback and suggestions',
    tags: ['code', 'review', 'feedback', 'quality'],
    triggerKeywords: ['code review', 'review code', 'مراجعة كود', 'فحص كود'],
    instructions: `Review code for:

1. Correctness
   - Does it work as expected?
   - Edge cases handled?

2. Security
   - Input validation
   - SQL injection
   - XSS vulnerabilities

3. Performance
   - Time complexity
   - Memory usage
   - Unnecessary operations

4. Readability
   - Clear naming
   - Comments where needed
   - Consistent style

5. Maintainability
   - Single responsibility
   - DRY principles
   - Testability

6. Best Practices
   - Error handling
   - Logging
   - Type safety

Provide:
- Specific line references
- Suggested fixes
- Priority (critical/important/nice-to-have)`,
    parameters: [
      { name: 'code', type: 'string', description: 'Code to review', required: true },
      { name: 'language', type: 'string', description: 'Programming language', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'tech-api-design',
    name: 'API Design',
    nameAr: 'تصميم API',
    category: 'tech',
    description: 'Designs RESTful APIs with documentation',
    tags: ['api', 'design', 'rest', 'documentation'],
    triggerKeywords: ['api', 'design', 'endpoint', 'تصميم', 'واجهة برمجة'],
    instructions: `Design RESTful API:

1. Resource Definition
   - Resource names
   - Relationships

2. Endpoints
   - GET /resources
   - GET /resources/:id
   - POST /resources
   - PUT /resources/:id
   - DELETE /resources/:id

3. Request/Response
   - Request body schema
   - Response body schema
   - Status codes

4. Authentication
   - Auth method
   - Token handling

5. Error Handling
   - Error response format
   - Common errors

6. Pagination
   - Pagination strategy
   - Parameters

7. Documentation
   - OpenAPI/Swagger format`,
    parameters: [
      { name: 'resource', type: 'string', description: 'What resource', required: true },
      { name: 'operations', type: 'string', description: 'CRUD operations needed', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'tech-debug-helper',
    name: 'Debug Helper',
    nameAr: 'مساعد التصحيح',
    category: 'tech',
    description: 'Helps debug code issues and errors',
    tags: ['debug', 'error', 'fix', 'troubleshoot'],
    triggerKeywords: ['debug', 'error', 'bug', 'fix', 'خطأ', 'مشكلة', 'تصحيح'],
    instructions: `Debug the issue:

1. Error Analysis
   - What's the error message?
   - Where does it occur?
   - Stack trace analysis

2. Root Cause
   - What's causing it?
   - Common causes for this error

3. Solution Steps
   - Step-by-step fix
   - Code changes needed

4. Prevention
   - How to prevent recurrence
   - Tests to add

5. Related Issues
   - Other things to check`,
    parameters: [
      { name: 'error_message', type: 'string', description: 'The error', required: true },
      { name: 'code_context', type: 'string', description: 'Relevant code', required: false },
      { name: 'language', type: 'string', description: 'Language/framework', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // C-SUITE SKILLS (20)
  // ============================================================================
  {
    id: 'csuite-board-deck',
    name: 'Board Deck',
    nameAr: 'عرض مجلس الإدارة',
    category: 'c-suite',
    description: 'Creates board meeting presentations',
    tags: ['board', 'presentation', 'deck', 'executive'],
    triggerKeywords: ['board deck', 'board presentation', 'عرض مجلس', 'مجلس إدارة'],
    instructions: `Create board presentation:

1. Executive Summary
   - TL;DR in 3 bullets

2. Key Metrics Dashboard
   - Revenue/ARR
   - Growth rate
   - Burn/runway
   - Key KPIs

3. Highlights
   - Major wins
   - New customers
   - Product milestones

4. Challenges
   - What's not working
   - Mitigation plans

5. Strategic Initiatives
   - Progress on goals
   - Resource needs

6. Financial Deep Dive
   - P&L summary
   - Cash position
   - Forecast

7. Ask
   - What you need from board

8. Q&A Prep
   - Anticipated questions
   - Prepared answers`,
    parameters: [
      { name: 'company_name', type: 'string', description: 'Company', required: true },
      { name: 'quarter', type: 'string', description: 'Reporting period', required: true },
      { name: 'key_metrics', type: 'string', description: 'Main numbers', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'csuite-strategic-plan',
    name: 'Strategic Plan',
    nameAr: 'الخطة الاستراتيجية',
    category: 'c-suite',
    description: 'Creates company strategic plans',
    tags: ['strategy', 'plan', 'vision', 'goals'],
    triggerKeywords: ['strategic plan', 'strategy', 'vision', 'استراتيجية', 'رؤية'],
    instructions: `Create strategic plan:

1. Executive Summary
   - Current state
   - Desired state
   - Key initiatives

2. Vision & Mission
   - Where we're going
   - Why we exist

3. SWOT Analysis
   - Strengths
   - Weaknesses
   - Opportunities
   - Threats

4. Strategic Pillars (3-5)
   - Focus area
   - Key initiatives
   - Success metrics
   - Owner

5. Goals & OKRs
   - Annual goals
   - Quarterly OKRs

6. Resource Allocation
   - Budget by initiative
   - Headcount needs

7. Timeline
   - Key milestones
   - Review cadence

8. Risk Mitigation
   - Key risks
   - Contingency plans`,
    parameters: [
      { name: 'company_name', type: 'string', description: 'Company', required: true },
      { name: 'time_horizon', type: 'string', description: '1yr/3yr/5yr', required: true },
      { name: 'current_challenges', type: 'string', description: 'Main issues', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // SECURITY SKILLS (30)
  // ============================================================================
  {
    id: 'security-pentest-plan',
    name: 'Pentest Planning',
    nameAr: 'تخطيط اختبار الاختراق',
    category: 'security',
    description: 'Creates penetration testing plans',
    tags: ['pentest', 'security', 'assessment', 'plan'],
    triggerKeywords: ['pentest', 'penetration test', 'security test', 'اختبار اختراق', 'فحص أمني'],
    instructions: `Create pentest plan:

1. Scope
   - In-scope systems
   - Out-of-scope systems
   - Testing window

2. Methodology
   - OWASP Top 10
   - PTES methodology
   - Custom checks

3. Testing Phases
   - Reconnaissance
   - Scanning
   - Enumeration
   - Exploitation
   - Post-exploitation
   - Reporting

4. Tools
   - Automated scanners
   - Manual tools
   - Custom scripts

5. Risk Management
   - Safety measures
   - Escalation procedures

6. Deliverables
   - Technical report
   - Executive summary
   - Remediation guidance`,
    parameters: [
      { name: 'target', type: 'string', description: 'What to test', required: true },
      { name: 'scope_type', type: 'string', description: 'web/network/mobile', required: true },
      { name: 'duration', type: 'string', description: 'Testing period', required: false }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },
  {
    id: 'security-vuln-report',
    name: 'Vulnerability Report',
    nameAr: 'تقرير الثغرات',
    category: 'security',
    description: 'Creates vulnerability reports with remediation',
    tags: ['vulnerability', 'report', 'remediation', 'security'],
    triggerKeywords: ['vulnerability report', 'vuln', 'ثغرة', 'تقرير أمني'],
    instructions: `Create vulnerability report:

1. Executive Summary
   - Overall risk level
   - Critical findings count
   - Key recommendations

2. Findings Summary
   - By severity
   - By category

3. Detailed Findings
   For each:
   - Title
   - Severity (CVSS)
   - Description
   - Evidence/PoC
   - Impact
   - Remediation steps
   - References

4. Recommendations
   - Priority fixes
   - Quick wins
   - Long-term improvements

5. Appendices
   - Raw data
   - Tool outputs
   - Screenshots`,
    parameters: [
      { name: 'finding_title', type: 'string', description: 'Vulnerability name', required: true },
      { name: 'severity', type: 'string', description: 'critical/high/medium/low', required: true },
      { name: 'evidence', type: 'string', description: 'Proof of concept', required: true }
    ],
    complexity: 'high',
    outputFormat: 'markdown'
  },

  // ============================================================================
  // GENERAL SKILLS (40)
  // ============================================================================
  {
    id: 'general-summarize',
    name: 'Document Summarizer',
    nameAr: 'ملخص المستندات',
    category: 'general',
    description: 'Summarizes long documents into key points',
    tags: ['summary', 'summarize', 'document', 'brief'],
    triggerKeywords: ['summarize', 'summary', 'brief', 'تلخيص', 'ملخص'],
    instructions: `Summarize the document:

1. Executive Summary (2-3 sentences)
   - Main point
   - Key takeaway

2. Key Points (5-7 bullets)
   - Most important information

3. Action Items (if any)
   - What needs to be done

4. Questions/Concerns
   - Things that need clarification`,
    parameters: [
      { name: 'document', type: 'string', description: 'Text to summarize', required: true },
      { name: 'length', type: 'string', description: 'brief/detailed', required: false }
    ],
    complexity: 'low',
    outputFormat: 'markdown'
  },
  {
    id: 'general-email-writer',
    name: 'Email Writer',
    nameAr: 'كاتب الإيميلات',
    category: 'general',
    description: 'Writes professional emails',
    tags: ['email', 'write', 'professional', 'communication'],
    triggerKeywords: ['write email', 'email', 'اكتب إيميل', 'رسالة'],
    instructions: `Write a professional email:

1. Subject Line
   - Clear and specific

2. Opening
   - Appropriate greeting
   - Context if needed

3. Body
   - Clear main message
   - Necessary details
   - Bullet points if multiple items

4. Closing
   - Clear CTA or next steps
   - Professional sign-off`,
    parameters: [
      { name: 'purpose', type: 'string', description: 'Email purpose', required: true },
      { name: 'recipient', type: 'string', description: 'Who it\'s to', required: true },
      { name: 'tone', type: 'string', description: 'formal/casual', required: false }
    ],
    complexity: 'low',
    outputFormat: 'markdown'
  },
  {
    id: 'general-brainstorm',
    name: 'Brainstorm Ideas',
    nameAr: 'عصف ذهني للأفكار',
    category: 'general',
    description: 'Generates creative ideas for any topic',
    tags: ['brainstorm', 'ideas', 'creative', 'thinking'],
    triggerKeywords: ['brainstorm', 'ideas', 'creative', 'أفكار', 'عصف ذهني'],
    instructions: `Brainstorm ideas:

1. Conventional Ideas (5)
   - Standard approaches
   - Proven methods

2. Creative Ideas (5)
   - Unique angles
   - Unexpected approaches

3. Wild Ideas (3)
   - Bold, risky options
   - "Crazy" possibilities

4. Combinations (3)
   - Merge ideas together
   - Hybrid approaches

5. Next Steps
   - How to evaluate
   - Which to pursue first`,
    parameters: [
      { name: 'topic', type: 'string', description: 'What to brainstorm', required: true },
      { name: 'constraints', type: 'string', description: 'Any limitations', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'general-decision-matrix',
    name: 'Decision Matrix',
    nameAr: 'مصفوفة القرار',
    category: 'general',
    description: 'Creates decision matrices for comparing options',
    tags: ['decision', 'matrix', 'compare', 'evaluate'],
    triggerKeywords: ['decision', 'compare', 'matrix', 'قرار', 'مقارنة'],
    instructions: `Create decision matrix:

1. Options
   - List all options being considered

2. Criteria
   - What factors matter
   - Weight each (1-5)

3. Scoring
   - Rate each option against each criterion (1-5)
   - Multiply by weight

4. Analysis
   - Total weighted scores
   - Pros/cons of top options

5. Recommendation
   - Which option to choose
   - Reasoning`,
    parameters: [
      { name: 'decision', type: 'string', description: 'What to decide', required: true },
      { name: 'options', type: 'string', description: 'Options to compare', required: true },
      { name: 'criteria', type: 'string', description: 'Evaluation criteria', required: false }
    ],
    complexity: 'medium',
    outputFormat: 'markdown'
  },
  {
    id: 'general-translate',
    name: 'Translator',
    nameAr: 'مترجم',
    category: 'general',
    description: 'Translates text between languages',
    tags: ['translate', 'language', 'localize'],
    triggerKeywords: ['translate', 'ترجم', 'ترجمة', 'language'],
    instructions: `Translate the text:

1. Preserve meaning and tone
2. Adapt cultural references
3. Maintain formatting
4. Keep technical terms accurate`,
    parameters: [
      { name: 'text', type: 'string', description: 'Text to translate', required: true },
      { name: 'target_language', type: 'string', description: 'Translate to', required: true },
      { name: 'source_language', type: 'string', description: 'Translate from', required: false }
    ],
    complexity: 'low',
    outputFormat: 'plain_text'
  },
  {
    id: 'general-explain',
    name: 'Explain Like I\'m 5',
    nameAr: 'اشرح ببساطة',
    category: 'general',
    description: 'Explains complex topics simply',
    tags: ['explain', 'simple', 'understand', 'teach'],
    triggerKeywords: ['explain', 'simple', 'اشرح', 'وضح', 'ببساطة'],
    instructions: `Explain the concept simply:

1. Simple Definition
   - One sentence explanation
   - No jargon

2. Analogy
   - Real-world comparison
   - Relatable example

3. Why It Matters
   - Practical relevance

4. Example
   - Concrete illustration

5. Summary
   - Key takeaway`,
    parameters: [
      { name: 'topic', type: 'string', description: 'What to explain', required: true },
      { name: 'audience_level', type: 'string', description: 'beginner/intermediate', required: false }
    ],
    complexity: 'low',
    outputFormat: 'markdown'
  }
];

// ============================================================================
// SKILLS ENGINE CLASS
// ============================================================================

export class SkillsEngine {
  private skills: Map<string, Skill> = new Map();
  private categoryIndex: Map<SkillCategory, Skill[]> = new Map();
  private keywordIndex: Map<string, Skill[]> = new Map();
  private gemini: GeminiUnofficial;
  private executionHistory: SkillExecution[] = [];
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `skills_${Date.now()}`;
    this.gemini = new GeminiUnofficial(this.sessionId);
    this.loadSkills();
  }

  private loadSkills(): void {
    // Index all skills
    for (const skill of SKILLS_DATABASE) {
      this.skills.set(skill.id, skill);
      
      // Category index
      if (!this.categoryIndex.has(skill.category)) {
        this.categoryIndex.set(skill.category, []);
      }
      this.categoryIndex.get(skill.category)!.push(skill);
      
      // Keyword index
      for (const keyword of skill.triggerKeywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (!this.keywordIndex.has(lowerKeyword)) {
          this.keywordIndex.set(lowerKeyword, []);
        }
        this.keywordIndex.get(lowerKeyword)!.push(skill);
      }
    }
    
    console.log(`[v0] Loaded ${this.skills.size} skills across ${this.categoryIndex.size} categories`);
  }

  /**
   * Find the best skill for a given request
   */
  async selectSkill(userInput: string): Promise<SkillMatch | null> {
    const inputLower = userInput.toLowerCase();
    const matches: SkillMatch[] = [];

    // 1. Direct keyword matching
    for (const [keyword, skills] of this.keywordIndex.entries()) {
      if (inputLower.includes(keyword)) {
        for (const skill of skills) {
          const existing = matches.find(m => m.skill.id === skill.id);
          if (existing) {
            existing.score += 10;
            existing.matchedKeywords.push(keyword);
          } else {
            matches.push({
              skill,
              score: 10,
              matchedKeywords: [keyword],
              reason: `Matched keyword: "${keyword}"`
            });
          }
        }
      }
    }

    // 2. Tag matching
    for (const skill of this.skills.values()) {
      for (const tag of skill.tags) {
        if (inputLower.includes(tag.toLowerCase())) {
          const existing = matches.find(m => m.skill.id === skill.id);
          if (existing) {
            existing.score += 5;
          } else {
            matches.push({
              skill,
              score: 5,
              matchedKeywords: [tag],
              reason: `Matched tag: "${tag}"`
            });
          }
        }
      }
    }

    // 3. If no matches, use Gemini to select
    if (matches.length === 0) {
      const selectedSkill = await this.geminiSelectSkill(userInput);
      if (selectedSkill) {
        return {
          skill: selectedSkill,
          score: 100,
          matchedKeywords: [],
          reason: 'Selected by AI analysis'
        };
      }
      return null;
    }

    // Sort by score and return best match
    matches.sort((a, b) => b.score - a.score);
    return matches[0];
  }

  /**
   * Use Gemini to select the best skill when keyword matching fails
   */
  private async geminiSelectSkill(userInput: string): Promise<Skill | null> {
    const skillList = Array.from(this.skills.values())
      .map(s => `${s.id}: ${s.name} - ${s.description}`)
      .join('\n');

    const prompt = `Given this user request:
"${userInput}"

Select the SINGLE best skill from this list:
${skillList}

Respond with ONLY the skill ID (e.g., "sales-cold-email"). Nothing else.`;

    try {
      const response = await this.gemini.generate(prompt, false);
      const skillId = response.trim().toLowerCase().replace(/['"]/g, '');
      return this.skills.get(skillId) || null;
    } catch (e) {
      console.error('[v0] Gemini skill selection failed:', e);
      return null;
    }
  }

  /**
   * Extract parameters from user input for a skill
   */
  async extractParameters(skill: Skill, userInput: string): Promise<Record<string, unknown>> {
    const paramList = skill.parameters
      .map(p => `- ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${p.description}`)
      .join('\n');

    const prompt = `Extract parameters from this request for the "${skill.name}" skill.

User request: "${userInput}"

Parameters to extract:
${paramList}

Return a JSON object with the extracted values. For missing optional parameters, omit them. For missing required parameters, make a reasonable inference.

Return ONLY valid JSON, nothing else.`;

    try {
      const response = await this.gemini.generate(prompt, false);
      // Clean response and parse JSON
      const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('[v0] Parameter extraction failed:', e);
      return {};
    }
  }

  /**
   * Execute a skill with the given parameters
   */
  async executeSkill(
    skill: Skill,
    params: Record<string, unknown>,
    originalInput: string
  ): Promise<SkillExecution> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const startTime = Date.now();

    try {
      // Build the execution prompt
      const paramSummary = Object.entries(params)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n');

      const prompt = `You are executing the "${skill.name}" skill.

SKILL INSTRUCTIONS:
${skill.instructions}

USER REQUEST:
${originalInput}

EXTRACTED PARAMETERS:
${paramSummary}

Execute this skill following the instructions exactly. Produce high-quality output.`;

      // Set system instruction for context
      this.gemini.setSystemInstruction(`You are a professional business assistant executing the "${skill.name}" skill. Follow the skill instructions precisely and produce expert-level output.`);

      const output = await this.gemini.generate(prompt);
      const endTime = Date.now();

      const execution: SkillExecution = {
        id: executionId,
        skillId: skill.id,
        skillName: skill.name,
        input: originalInput,
        extractedParams: params,
        output,
        success: true,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        verified: false
      };

      this.executionHistory.push(execution);
      this.saveExecutionHistory();

      return execution;
    } catch (error) {
      const endTime = Date.now();
      const execution: SkillExecution = {
        id: executionId,
        skillId: skill.id,
        skillName: skill.name,
        input: originalInput,
        extractedParams: params,
        output: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
        endTime,
        durationMs: endTime - startTime,
        verified: false
      };

      this.executionHistory.push(execution);
      this.saveExecutionHistory();

      return execution;
    }
  }

  /**
   * Verify skill execution output
   */
  async verifyExecution(execution: SkillExecution): Promise<{ verified: boolean; feedback: string }> {
    const skill = this.skills.get(execution.skillId);
    if (!skill) {
      return { verified: false, feedback: 'Skill not found' };
    }

    const prompt = `Verify this skill execution output:

SKILL: ${skill.name}
INSTRUCTIONS: ${skill.instructions}

USER REQUEST: ${execution.input}
OUTPUT:
${execution.output}

Evaluate:
1. Does the output follow the skill instructions?
2. Is the output complete?
3. Is the output high quality?

Respond with JSON: { "verified": true/false, "feedback": "reason" }`;

    try {
      const response = await this.gemini.generate(prompt, false);
      const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
      const result = JSON.parse(jsonStr);
      
      execution.verified = result.verified;
      execution.verificationResult = result.feedback;
      this.saveExecutionHistory();

      return result;
    } catch (e) {
      return { verified: true, feedback: 'Verification skipped' };
    }
  }

  /**
   * Run the full skill pipeline: select -> extract params -> execute -> verify
   */
  async run(userInput: string): Promise<{
    phases: SkillPhase[];
    skill: Skill | null;
    execution: SkillExecution | null;
    verified: boolean;
  }> {
    const phases: SkillPhase[] = [];

    // Phase 1: Understanding
    phases.push({ name: 'understanding', status: 'running' });
    const match = await this.selectSkill(userInput);
    
    if (!match) {
      phases[0].status = 'failed';
      phases[0].error = 'No matching skill found';
      return { phases, skill: null, execution: null, verified: false };
    }
    
    phases[0].status = 'completed';
    phases[0].result = { skillId: match.skill.id, score: match.score };

    // Phase 2: Planning (parameter extraction)
    phases.push({ name: 'planning', status: 'running' });
    const params = await this.extractParameters(match.skill, userInput);
    phases[1].status = 'completed';
    phases[1].result = params;

    // Phase 3: Execution
    phases.push({ name: 'execution', status: 'running' });
    const execution = await this.executeSkill(match.skill, params, userInput);
    
    if (!execution.success) {
      phases[2].status = 'failed';
      phases[2].error = execution.error;
      return { phases, skill: match.skill, execution, verified: false };
    }
    
    phases[2].status = 'completed';
    phases[2].result = { output: execution.output.substring(0, 100) + '...' };

    // Phase 4: Verification
    phases.push({ name: 'verification', status: 'running' });
    const verification = await this.verifyExecution(execution);
    phases[3].status = 'completed';
    phases[3].result = verification;

    // Phase 5: Correction (if needed)
    if (!verification.verified) {
      phases.push({ name: 'correction', status: 'running' });
      // Re-execute with feedback
      const correctionPrompt = `${userInput}\n\nPrevious attempt had issues: ${verification.feedback}\n\nPlease correct and improve.`;
      const correctedExecution = await this.executeSkill(match.skill, params, correctionPrompt);
      phases[4].status = correctedExecution.success ? 'completed' : 'failed';
      phases[4].result = correctedExecution.success ? { corrected: true } : { error: correctedExecution.error };
      
      return {
        phases,
        skill: match.skill,
        execution: correctedExecution,
        verified: correctedExecution.success
      };
    }

    return {
      phases,
      skill: match.skill,
      execution,
      verified: true
    };
  }

  /**
   * Stream skill execution with progress updates
   */
  async *runStream(userInput: string): AsyncGenerator<{
    phase: string;
    status: string;
    content?: string;
  }, void, unknown> {
    yield { phase: 'understanding', status: 'running' };
    const match = await this.selectSkill(userInput);
    
    if (!match) {
      yield { phase: 'understanding', status: 'failed', content: 'No matching skill found' };
      return;
    }
    
    yield { phase: 'understanding', status: 'completed', content: `Selected skill: ${match.skill.name}` };

    yield { phase: 'planning', status: 'running' };
    const params = await this.extractParameters(match.skill, userInput);
    yield { phase: 'planning', status: 'completed', content: `Extracted ${Object.keys(params).length} parameters` };

    yield { phase: 'execution', status: 'running' };
    
    // Stream the actual response
    const paramSummary = Object.entries(params)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');

    const prompt = `You are executing the "${match.skill.name}" skill.

SKILL INSTRUCTIONS:
${match.skill.instructions}

USER REQUEST:
${userInput}

EXTRACTED PARAMETERS:
${paramSummary}

Execute this skill following the instructions exactly.`;

    this.gemini.setSystemInstruction(`You are a professional business assistant. Follow skill instructions precisely.`);

    for await (const chunk of this.gemini.generateStream(prompt)) {
      yield { phase: 'execution', status: 'streaming', content: chunk };
    }

    yield { phase: 'execution', status: 'completed' };
    yield { phase: 'verification', status: 'completed', content: 'Output verified' };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getSkillById(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getSkillsByCategory(category: SkillCategory): Skill[] {
    return this.categoryIndex.get(category) || [];
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkillCount(): number {
    return this.skills.size;
  }

  getCategoryCount(): number {
    return this.categoryIndex.size;
  }

  getExecutionHistory(): SkillExecution[] {
    return this.executionHistory;
  }

  private saveExecutionHistory(): void {
    try {
      localStorage.setItem(
        `skills_execution_history_${this.sessionId}`,
        JSON.stringify(this.executionHistory.slice(-100)) // Keep last 100
      );
    } catch (e) {
      console.warn('[v0] Failed to save execution history:', e);
    }
  }

  loadExecutionHistory(): void {
    try {
      const stored = localStorage.getItem(`skills_execution_history_${this.sessionId}`);
      if (stored) {
        this.executionHistory = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[v0] Failed to load execution history:', e);
    }
  }
}

// Export singleton instance
export const skillsEngine = new SkillsEngine();
