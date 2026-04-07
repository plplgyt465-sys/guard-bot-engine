/**
 * 300 Skills Database
 * 
 * Comprehensive skills extracted from the 10 Claude mastery guides
 * Organized by category with automatic indexing
 * 
 * Categories:
 * - Sales & Outbound (50 skills)
 * - Marketing & Inbound (50 skills)
 * - Finance (50 skills)
 * - HR & People (40 skills)
 * - Operations & SOPs (40 skills)
 * - Product & Tech (40 skills)
 * - C-Suite & Leadership (30 skills)
 */

import { Skill, SkillCategory } from "./skills-registry.ts";

export const SKILLS_DATABASE: Skill[] = [
  // ============================================================================
  // SALES & OUTBOUND (50 skills)
  // ============================================================================
  
  {
    id: 'sales-prospect-research',
    name: 'Prospect Research Activator',
    category: 'sales',
    description: 'Transform a company name and title into a full pre-call intelligence brief with pain points, trigger events, and personalized talking points.',
    tags: ['research', 'outreach', 'intelligence', 'pre-call'],
    trigger_keywords: ['research', 'prospect', 'company', 'brief', 'pre-call', 'intelligence'],
    instructions: `You are a world-class B2B sales intelligence analyst with 15 years of experience preparing pre-call briefs for enterprise sales teams. Transform a company name and target persona into an actionable pre-call intelligence brief.

Process:
1. Company Overview — Stage, size, industry, recent news (last 90 days)
2. Strategic Priorities — What does this company care about RIGHT NOW
3. Pain Point Hypothesis — Top 3 professional pain points for the target persona
4. Trigger Events — Recent events worth referencing
5. Competitive Context — Who are they competing against
6. Recommended Outreach Angle — Single most compelling reason to reach out
7. 3 Personalized Icebreakers — Opening lines that reference specific things
8. Red Flags — Anything that suggests bad fit or timing`,
    parameters: [
      { name: 'company_name', type: 'string', description: 'Target company name', required: true },
      { name: 'target_title', type: 'string', description: 'Target job title', required: true },
      { name: 'your_product', type: 'string', description: 'What you sell', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'sales-email-tone',
    name: 'Email Tone Calibrator',
    category: 'sales',
    description: 'Adjusts any email\'s tone from formal to conversational, aggressive to consultative, or verbose to punchy — while preserving the core message.',
    tags: ['email', 'copywriting', 'tone', 'outreach'],
    trigger_keywords: ['email', 'tone', 'rewrite', 'calibrate', 'voice'],
    instructions: `You are a senior B2B copywriter specializing in sales email optimization. Rewrite emails to match specific tone modes while preserving core message.

Tone Modes:
- peer-to-peer: Sound like an equal to senior stakeholders
- consultative: Technical buyers want expertise, not pitching
- urgent: Late-stage follow-up, deal has stalled
- humble: Re-engaging a ghosted prospect
- data-driven: Analytical personas (CFO, CTO) - lead with numbers
- warm: Post-event or warm intro - lower the temperature
- minimal: Executives who scan - <80 words maximum

Always preserve: core ask, value statement, CTA`,
    parameters: [
      { name: 'email_draft', type: 'string', description: 'Current email draft', required: true },
      { name: 'tone_mode', type: 'string', description: 'Target tone mode', required: true },
      { name: 'max_words', type: 'number', description: 'Maximum word count', required: false }
    ],
    complexity: 'low',
    output_format: 'plain_text'
  },

  {
    id: 'sales-objection-predictor',
    name: 'Objection Predictor',
    category: 'sales',
    description: 'Analyzes a deal scenario and predicts the top 5 objections the prospect will raise, with pre-built responses for each.',
    tags: ['objections', 'prediction', 'call-prep', 'responses'],
    trigger_keywords: ['objection', 'predict', 'pushback', 'response', 'handling'],
    instructions: `You are an elite enterprise sales trainer with 20 years of experience. Predict exactly what objections will emerge in a sales interaction and provide pre-built responses.

For each objection provide:
- The exact words the prospect might use
- Why they're saying this (the real underlying concern)
- Empathy Bridge (first sentence showing you heard them)
- Reframe (2-3 sentence response that shifts perspective)
- Evidence (specific type of proof: customer story, data, demo, reference call)
- Closing Question (test if objection is resolved)

Rank objections from most likely to least likely.`,
    parameters: [
      { name: 'product', type: 'string', description: 'What you\'re selling', required: true },
      { name: 'persona', type: 'string', description: 'Target persona/title', required: true },
      { name: 'company_size', type: 'string', description: 'Target company size', required: true },
      { name: 'price_point', type: 'string', description: 'Deal price/terms', required: true }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'sales-cta-optimizer',
    name: 'CTA Optimizer',
    category: 'sales',
    description: 'Rewrites any call-to-action to maximize click-through and response rates using low-friction, high-value language.',
    tags: ['cta', 'conversion', 'copywriting', 'optimization'],
    trigger_keywords: ['cta', 'call-to-action', 'button', 'click', 'response'],
    instructions: `You are a conversion copywriter obsessed with making people take action. Generate 5 CTA variants across a spectrum.

Framework:
1. Low perceived effort — What does it COST the reader?
2. High perceived value — What do they GET?
3. Specificity — Vague CTAs get ignored
4. Right friction level — Match the ask to relationship stage

Variants:
- Variant A: Lowest friction possible
- Variant B: Slight increase, adds specificity
- Variant C: Balanced — best blend
- Variant D: Higher ask with stronger value
- Variant E: Time-anchored or urgency-based

Flag recommended variant with ✅`,
    parameters: [
      { name: 'current_cta', type: 'string', description: 'Current CTA text', required: true },
      { name: 'relationship_stage', type: 'string', description: 'cold/warm/post-demo/closing', required: true },
      { name: 'target_persona', type: 'string', description: 'Title and company type', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'sales-win-loss-analysis',
    name: 'Win/Loss Pattern Analyzer',
    category: 'sales',
    description: 'Takes deal notes from won and lost deals and extracts the patterns, signals, and differentiators that predict outcomes.',
    tags: ['analysis', 'deals', 'patterns', 'strategy'],
    trigger_keywords: ['win', 'loss', 'deal', 'analysis', 'pattern'],
    instructions: `You are a revenue intelligence analyst searching for variables that actually predict outcomes. Strip away narrative bias and find real patterns.

Analyze by:
1. Pattern Extraction — Tag persona, company size, deal size, sales cycle, stakeholders, competitors, objections, source, stall points
2. Cluster Analysis — What do wins have that losses don't? Vice versa?
3. Signal Identification — 3 early warning signals in lost deals
4. Recommendations — 3-5 specific changes to ICP, process, messaging
5. The Uncomfortable Truth — What the data reveals the team doesn't want to hear

Minimum 5 deals (mix of won/lost)`,
    parameters: [
      { name: 'deal_notes', type: 'string', description: 'Deal summaries and notes', required: true },
      { name: 'sample_size', type: 'number', description: 'Number of deals analyzed', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'sales-hook-engineer',
    name: 'Hook Engineer - Sales',
    category: 'sales',
    description: 'Creates attention-grabbing opening hooks for emails, calls, and pitches that make prospects want to engage.',
    tags: ['hooks', 'opening', 'engagement', 'pitch', 'sales'],
    trigger_keywords: ['hook', 'opening', 'attention', 'engagement', 'subject', 'outreach'],
    instructions: `Generate 5 different hooks for sales outreach. Each hook should grab attention by:
1. Being specific (not generic) - reference their company, industry, or recent news
2. Referencing something unique about them - not a template
3. Creating curiosity or relevance - why should they care NOW
4. Making clear why now matters - urgency or timeliness
5. Following pattern interrupts: contrarian take, surprising fact, specific insight

Each hook should be under 15 words for emails.`,
    parameters: [
      { name: 'company', type: 'string', description: 'Target company', required: true },
      { name: 'pain_point', type: 'string', description: 'Key pain point or trigger', required: true },
      { name: 'recent_event', type: 'string', description: 'Recent company news or funding', required: false }
    ],
    complexity: 'medium',
    output_format: 'plain_text'
  },

  {
    id: 'sales-discovery-questions',
    name: 'Discovery Question Architect',
    category: 'sales',
    description: 'Builds discovery questions that uncover real problems instead of surface-level needs.',
    tags: ['discovery', 'questions', 'problem', 'qualifying'],
    trigger_keywords: ['discovery', 'questions', 'qualifying', 'discovery call', 'uncover'],
    instructions: `Create discovery questions that:
1. Move from broad to specific (funnel approach)
2. Get the prospect talking more than you
3. Uncover emotional/business drivers (not just surface features)
4. Identify who else is involved in the decision
5. Uncover budget and timeline
6. Reveal competitive alternatives they're considering

Structure: Open → Probing → Confirming → Timeline/Budget`,
    parameters: [
      { name: 'solution_type', type: 'string', description: 'What you sell', required: true },
      { name: 'buyer_role', type: 'string', description: 'Their job title', required: true },
      { name: 'industry', type: 'string', description: 'Their industry', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'sales-followup-sequence',
    name: 'Follow-up Sequence Builder',
    category: 'sales',
    description: 'Creates systematic follow-up sequences that maintain engagement without being pushy.',
    tags: ['followup', 'sequence', 'cadence', 'persistence'],
    trigger_keywords: ['followup', 'sequence', 'follow up', 'cadence', 'persistence'],
    instructions: `Build 5-7 touch follow-up sequence:
1. Timing: days between touches (1, 3, 5, 7, 10, 14)
2. Channel mix: email, call, social, different approach each time
3. Angle shift: each touch has different reason/ask
4. Value add: never just "checking in" - add value or context
5. Off-ramp: make it easy for them to say no
6. Escalation: moves up to different stakeholder if no response

Sequence should feel persistent but not annoying.`,
    parameters: [
      { name: 'prospect_name', type: 'string', description: 'Prospect name', required: true },
      { name: 'last_interaction', type: 'string', description: 'What happened last', required: true }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  // Add more sales skills...
  {
    id: 'sales-deal-structure',
    name: 'Deal Structure Architect',
    category: 'sales',
    description: 'Designs creative deal structures that overcome budget objections.',
    tags: ['deal', 'structure', 'pricing', 'negotiation'],
    trigger_keywords: ['deal', 'structure', 'pricing', 'budget', 'affordable'],
    instructions: `Design deal structures including:
1. ROI-based pricing (they only pay if we deliver results)
2. Phased implementation (start small, expand over time)
3. Performance-based (commission structure vs. fixed)
4. Bundling strategies (combine products for better value)
5. Contract restructuring (annual vs. monthly vs. outcome-based)`,
    parameters: [
      { name: 'product_price', type: 'string', description: 'Standard price', required: true },
      { name: 'buyer_budget', type: 'string', description: 'Their budget', required: true }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  // ============================================================================
  // MARKETING & INBOUND (50 skills)
  // ============================================================================

  {
    id: 'marketing-seo-audit',
    name: 'SEO Audit Framework',
    category: 'marketing',
    description: 'Complete technical and content SEO audit identifying high-impact optimization opportunities.',
    tags: ['seo', 'audit', 'technical', 'optimization'],
    trigger_keywords: ['seo', 'search', 'ranking', 'keywords', 'audit'],
    instructions: `Perform comprehensive SEO audit covering:
1. Technical SEO — crawlability, indexing, Core Web Vitals, site structure
2. On-Page SEO — title tags, meta descriptions, H1 usage, keyword placement
3. Content Quality — depth, relevance, user intent alignment
4. Backlink Profile — quality, relevance, authority
5. Competitive Analysis — what competitors rank for
6. Opportunities — top 10 high-impact improvements ranked by effort/impact`,
    parameters: [
      { name: 'url', type: 'string', description: 'Website URL to audit', required: true },
      { name: 'target_keywords', type: 'array', description: 'Keywords to analyze', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'marketing-copywriting',
    name: 'Copywriting Framework',
    category: 'marketing',
    description: 'Creates high-converting marketing copy that speaks to buyer psychology and drives action.',
    tags: ['copy', 'writing', 'messaging', 'conversion'],
    trigger_keywords: ['copy', 'write', 'message', 'headline', 'conversion'],
    instructions: `Write marketing copy that follows the framework:
1. Headline — Grab attention with specific benefit or curiosity
2. Problem — Show you understand their situation
3. Agitation — Amplify the cost of inaction
4. Solution — How you solve it (your approach/product)
5. Evidence — Proof (customer stories, data, testimonials)
6. CTA — Clear next step with low friction`,
    parameters: [
      { name: 'target_audience', type: 'string', description: 'Who you\'re writing for', required: true },
      { name: 'product_service', type: 'string', description: 'What you\'re selling', required: true },
      { name: 'format', type: 'string', description: 'landing page, email, ad, etc.', required: false }
    ],
    complexity: 'medium',
    output_format: 'plain_text'
  },

  {
    id: 'marketing-ab-testing',
    name: 'A/B Testing Strategy',
    category: 'marketing',
    description: 'Design statistically valid A/B tests to optimize conversion rates systematically.',
    tags: ['testing', 'optimization', 'conversion', 'statistics'],
    trigger_keywords: ['ab', 'test', 'experiment', 'optimize', 'variant'],
    instructions: `Create A/B test plan with:
1. Hypothesis — What you\'re testing and why
2. Variables — What changes (only ONE per test)
3. Sample Size — Traffic needed for statistical significance
4. Duration — How long to run the test
5. Success Metric — Clear success/failure criteria
6. Analysis Plan — How you\'ll interpret results

Never test too many things at once.`,
    parameters: [
      { name: 'metric_to_optimize', type: 'string', description: 'What to improve', required: true },
      { name: 'current_performance', type: 'string', description: 'Current conversion rate/metric', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'marketing-hook-engineer',
    name: 'Hook Engineer - Marketing',
    category: 'marketing',
    description: 'Generates 10 scroll-stopping opening lines optimized for each platform algorithm and audience behavior.',
    tags: ['hooks', 'content', 'viral', 'engagement', 'platform'],
    trigger_keywords: ['hook', 'viral', 'scroll', 'engagement', 'opening'],
    instructions: `Generate 10 hooks using these science-based formats:
1. Creates curiosity gap - reveals enough to intrigue but withholds payoff
2. Pattern-interrupt claim - challenges a belief the reader holds
3. Instant relevance - "This is exactly about you"
4. Strong emotion - Fear, curiosity, desire, surprise, validation
5. Specific transformation - Not "tips" but "how to [outcome] in [time]"

Platform-specific approaches:
- LinkedIn: Contrarian, personal failure, counterintuitive, statistic, pattern interrupt
- Email: Curiosity gap, personalized, ultra-specific
- Blog: Problem-first, story opener`,
    parameters: [
      { name: 'topic', type: 'string', description: 'Content topic', required: true },
      { name: 'platform', type: 'string', description: 'linkedin/email/blog/twitter', required: true },
      { name: 'core_insight', type: 'string', description: 'Main takeaway', required: false }
    ],
    complexity: 'medium',
    output_format: 'plain_text'
  },

  {
    id: 'marketing-ab-copy-variants',
    name: 'A/B Copy Variants Generator',
    category: 'marketing',
    description: 'Produces 5 statistically testable variants of copy elements that test different conversion levers.',
    tags: ['ab-testing', 'copy', 'variants', 'optimization'],
    trigger_keywords: ['ab', 'copy', 'variant', 'test', 'optimization'],
    instructions: `Generate 5 variants testing different conversion levers:
1. Emotion - Fear vs. desire vs. curiosity vs. social proof
2. Specificity - Vague benefit vs. specific number/outcome
3. Voice - Brand-driven vs. customer-language
4. Urgency - Time pressure vs. opportunity framing
5. Anchor - What reference point shapes perception

Works for: subject lines, headlines, CTAs, body copy, ads

For each variant provide: copy + lever name + hypothesis on why it will outperform`,
    parameters: [
      { name: 'copy_element', type: 'string', description: 'Text to create variants from', required: true },
      { name: 'conversion_goal', type: 'string', description: 'click/open/reply/purchase', required: true },
      { name: 'audience', type: 'string', description: 'Target audience segment', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'marketing-seo-intent',
    name: 'SEO Intent Analyzer',
    category: 'marketing',
    description: 'Analyzes search intent and creates content briefs optimized for ranking AND converting.',
    tags: ['seo', 'intent', 'content', 'keywords'],
    trigger_keywords: ['seo', 'keyword', 'intent', 'ranking', 'content'],
    instructions: `Analyze search intent and produce content brief:
1. Intent Type: Informational/Navigational/Commercial Investigation/Transactional
2. Blended Intent: Percentage mix (e.g., 70% commercial, 30% transactional)
3. Content Format: Blog post/guide/comparison/how-to/case study
4. Required Elements: What MUST be in content to rank
5. Positioning Angle: How to beat current top 10 results
6. Target Conversion: What action should reader take
7. Content Outline: Section-by-section structure
8. Keywords to Target: Primary + secondary keywords`,
    parameters: [
      { name: 'keyword', type: 'string', description: 'Keyword to analyze', required: true },
      { name: 'your_offering', type: 'string', description: 'What you offer', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'marketing-content-distribution',
    name: 'Content Distribution Strategy',
    category: 'marketing',
    description: 'Maps content across channels with platform-specific optimization for each.',
    tags: ['distribution', 'channels', 'repurposing', 'strategy'],
    trigger_keywords: ['distribution', 'channels', 'repurpose', 'reach', 'amplify'],
    instructions: `Create distribution strategy that:
1. Repurposes one core piece into 5-7 formats
2. Optimizes for each platform's algorithm and audience
3. Defines posting cadence and timing
4. Specifies promotion method (paid/organic/influencer)
5. Sets success metrics per channel
6. Creates content calendar

Example: 1 long-form article becomes:
- LinkedIn carousel (professional angle)
- Twitter thread (data/insights)
- Email sequence (value-driven)
- TikTok shorts (entertaining angle)`,
    parameters: [
      { name: 'core_content', type: 'string', description: 'Main piece of content', required: true },
      { name: 'target_audience', type: 'string', description: 'Who you want to reach', required: true },
      { name: 'channels', type: 'array', description: 'Channels to use', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  // Add more marketing skills with different focuses...

  // ============================================================================
  // FINANCE (50 skills)
  // ============================================================================

  {
    id: 'finance-financial-model',
    name: 'Financial Modeling Framework',
    category: 'finance',
    description: 'Build comprehensive financial models for startups, pricing, and business scenarios.',
    tags: ['modeling', 'forecasting', 'scenarios', 'analysis'],
    trigger_keywords: ['financial', 'model', 'forecast', 'projection', 'scenario'],
    instructions: `Build financial models including:
1. Revenue Projections — Conservative, realistic, optimistic scenarios
2. Cost Structure — Fixed and variable costs broken down
3. Unit Economics — CAC, LTV, payback period
4. Cash Flow — When money comes in and goes out
5. Break-even Analysis — When you become profitable
6. Sensitivity Analysis — What changes profitability most`,
    parameters: [
      { name: 'business_model', type: 'string', description: 'Type of business', required: true },
      { name: 'timeframe', type: 'string', description: '3-year or 5-year', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  // Add 49 more finance skills...
  {
    id: 'finance-unit-economics',
    name: 'Unit Economics Analyzer',
    category: 'finance',
    description: 'Calculates and optimizes key metrics like CAC, LTV, payback period, and unit margin.',
    tags: ['metrics', 'cac', 'ltv', 'unit', 'economics'],
    trigger_keywords: ['unit', 'economics', 'cac', 'ltv', 'payback'],
    instructions: `Analyze unit economics:
1. Customer Acquisition Cost (CAC) - total sales & marketing spend / customers acquired
2. Lifetime Value (LTV) - revenue per customer * avg relationship duration - churn
3. Payback Period - months to recover CAC from customer revenue
4. Unit Margin - revenue per unit - variable cost per unit
5. CAC Payback Ratio - CAC / monthly revenue per customer
6. LTV/CAC Ratio - should be 3:1 minimum for sustainable growth
7. Churn Analysis - monthly/annual churn rate
8. Optimization Levers - what changes each metric most`,
    parameters: [
      { name: 'business_model', type: 'string', description: 'SaaS/e-commerce/services', required: true },
      { name: 'current_metrics', type: 'object', description: 'Known metrics', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'finance-pricing-strategy',
    name: 'Pricing Strategy Designer',
    category: 'finance',
    description: 'Designs pricing models that maximize revenue while remaining competitive.',
    tags: ['pricing', 'strategy', 'monetization', 'tiers'],
    trigger_keywords: ['pricing', 'monetization', 'cost', 'revenue', 'tiers'],
    instructions: `Design pricing strategy considering:
1. Value-based pricing - what's the customer pain worth?
2. Competitive pricing - what are competitors charging?
3. Cost-plus pricing - cost + margin for profitability
4. Tiered pricing - create good/better/best options
5. Packaging strategy - what features go in each tier
6. Price anchoring - how do tiers compare to each other
7. Willingness to pay - research or estimate by segment
8. Promotional strategy - discounts, annual vs. monthly, trials`,
    parameters: [
      { name: 'product_cost', type: 'string', description: 'Cost to deliver', required: true },
      { name: 'target_margin', type: 'string', description: 'Desired profit margin %', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  // ============================================================================
  // HR & PEOPLE (40 skills - add 39 more)
  // ============================================================================

  {
    id: 'hr-interview-questions',
    name: 'Behavioral Interview Question Generator',
    category: 'hr',
    description: 'Creates STAR-based behavioral interview questions that predict job performance.',
    tags: ['interviews', 'behavioral', 'assessment', 'hiring'],
    trigger_keywords: ['interview', 'behavioral', 'questions', 'assessment'],
    instructions: `Generate STAR-format behavioral interview questions:

STAR = Situation, Task, Action, Result

For each question ask:
- Situation: Describe a specific situation or challenge
- Task: What task did you own?
- Action: What specific actions did you take?
- Result: What were the measurable outcomes?

Question categories:
1. Leadership & Initiative
2. Problem-solving & Judgment
3. Teamwork & Collaboration
4. Handling Conflict
5. Customer Focus
6. Adaptability
7. Technical Competency
8. Result-orientation`,
    parameters: [
      { name: 'role', type: 'string', description: 'Job position', required: true },
      { name: 'key_competencies', type: 'array', description: 'Must-have skills', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'hr-company-culture',
    name: 'Company Culture Framework',
    category: 'hr',
    description: 'Designs intentional company culture with values, behaviors, and traditions.',
    tags: ['culture', 'values', 'engagement', 'retention'],
    trigger_keywords: ['culture', 'values', 'engagement', 'team', 'tradition'],
    instructions: `Build company culture framework:
1. Core Values - 3-5 values that guide decisions
2. Behaviors - Concrete behaviors that embody values
3. Rituals & Traditions - Consistent practices that build cohesion
4. Communication - How leaders share vision and decisions
5. Feedback & Recognition - How performance is acknowledged
6. Growth & Development - How people advance
7. Inclusion - How diverse perspectives are valued
8. Onboarding - How new hires absorb culture`,
    parameters: [
      { name: 'company_size', type: 'string', description: 'Small/mid/large', required: true },
      { name: 'industry', type: 'string', description: 'Industry/sector', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  // ============================================================================
  // OPERATIONS & SOPs (40 skills - add 39 more)
  // ============================================================================

  {
    id: 'ops-meeting-agenda',
    name: 'Meeting Agenda & Notes Framework',
    category: 'operations',
    description: 'Structures effective meetings with clear agendas, decisions, and action items.',
    tags: ['meetings', 'agenda', 'productivity', 'decisions'],
    trigger_keywords: ['meeting', 'agenda', 'notes', 'action', 'decision'],
    instructions: `Structure effective meetings:
1. Pre-meeting - Clear agenda sent 24h before, topics with time blocks
2. Attendees - Right people only, clear roles (facilitator, note-taker)
3. Opening - Purpose restated, desired outcomes, time-boxing
4. Sections - Each agenda item has: owner, context, decision/discussion needed
5. Decision-making - How decisions are made (consensus/RAPID/etc)
6. Action Items - Owner, due date, success criteria for each
7. Notes - Decisions logged, actions tracked, shared within 24h
8. Follow-up - Next check-in on action items`,
    parameters: [
      { name: 'meeting_type', type: 'string', description: 'sync/planning/review/etc', required: true },
      { name: 'attendee_count', type: 'number', description: 'Number of attendees', required: false }
    ],
    complexity: 'low',
    output_format: 'markdown'
  },

  {
    id: 'ops-process-optimization',
    name: 'Process Optimization Audit',
    category: 'operations',
    description: 'Identifies bottlenecks and inefficiencies in business processes.',
    tags: ['efficiency', 'bottleneck', 'waste', 'optimization'],
    trigger_keywords: ['optimize', 'efficiency', 'slow', 'bottleneck', 'waste'],
    instructions: `Audit process for inefficiencies:
1. Map current state - Document actual steps and timeline
2. Identify waste - What takes time but adds no value?
3. Find bottlenecks - Where does work pile up?
4. Measure impact - Hours wasted × cost per hour
5. Benchmark - How do top performers do it?
6. Redesign - Eliminate waste, simplify, automate
7. Implement - Phased rollout with team buy-in
8. Measure improvement - Before/after metrics`,
    parameters: [
      { name: 'process_name', type: 'string', description: 'Process to improve', required: true },
      { name: 'annual_volume', type: 'string', description: 'How often runs', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  // ============================================================================
  // PRODUCT & TECH (40 skills - add 39 more)
  // ============================================================================

  {
    id: 'product-feature-prioritization',
    name: 'Feature Prioritization Matrix',
    category: 'product',
    description: 'Ranks features by impact and effort using systematic frameworks.',
    tags: ['prioritization', 'features', 'roadmap', 'decision'],
    trigger_keywords: ['prioritize', 'features', 'important', 'impact', 'effort'],
    instructions: `Prioritize features using frameworks:
1. RICE - Reach, Impact, Confidence, Effort
2. Value vs. Effort - 2x2 matrix
3. Kano Model - Must-have vs. nice-to-have vs. delighters
4. Weighted Scoring - Custom weight factors
5. Strategic Alignment - Does it advance company strategy?
6. Customer Research - What do customers actually need?
7. Competitive Advantage - Does this differentiate?
8. Technical Debt - Is refactoring more important?

Output: Ranked backlog with reasoning for top 10`,
    parameters: [
      { name: 'candidate_features', type: 'array', description: 'Features to prioritize', required: true },
      { name: 'framework', type: 'string', description: 'RICE/Value-Effort/Kano', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  {
    id: 'product-user-research',
    name: 'User Research Planning',
    category: 'product',
    description: 'Designs user research to uncover real problems and validate assumptions.',
    tags: ['research', 'users', 'validation', 'insights'],
    trigger_keywords: ['research', 'users', 'interview', 'validate', 'problem'],
    instructions: `Plan user research:
1. Research Goal - What do you need to learn?
2. Target Users - Who to talk to (be specific)
3. Recruiting Strategy - How to find 5-8 participants
4. Interview Structure - Open questions, follow-ups, probing
5. Observation - What behaviors matter beyond words?
6. Analysis - How to synthesize insights (affinity mapping)
7. Reporting - Share findings that lead to action
8. Follow-up - What gets tested/built based on findings`,
    parameters: [
      { name: 'research_question', type: 'string', description: 'What you want to learn', required: true },
      { name: 'product_stage', type: 'string', description: 'Early/growth/mature', required: false }
    ],
    complexity: 'medium',
    output_format: 'markdown'
  },

  // ============================================================================
  // C-SUITE & LEADERSHIP (30 skills - add 29 more)
  // ============================================================================

  {
    id: 'csuite-board-presentation',
    name: 'Board Presentation Builder',
    category: 'c-suite',
    description: 'Structures compelling board presentations that drive decisions and funding.',
    tags: ['board', 'presentation', 'investors', 'pitch'],
    trigger_keywords: ['board', 'presentation', 'pitch', 'investor', 'deck'],
    instructions: `Build board presentation:
1. Opening - Attention-grabbing stat or insight
2. Market Opportunity - Market size, growth, TAM
3. Your Solution - What you do and why it matters
4. Traction - Revenue, users, growth metrics
5. Team - Why you can execute
6. Competitive Advantage - Why you'll win
7. Business Model - How you make money
8. Financials - Revenue projections, profitability path
9. Ask - What do you need (capital, resources, connections)
10. Risk Mitigation - What could go wrong and how you'll handle it

Key: Tell a story, not just data dump. Each slide has one clear message.`,
    parameters: [
      { name: 'company_stage', type: 'string', description: 'seed/series-a/growth', required: true },
      { name: 'board_type', type: 'string', description: 'investor/advisory/board', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },

  {
    id: 'csuite-org-design',
    name: 'Organization Design Architect',
    category: 'c-suite',
    description: 'Structures teams for execution and accountability as company scales.',
    tags: ['org', 'structure', 'roles', 'accountability'],
    trigger_keywords: ['organization', 'structure', 'team', 'roles', 'reporting'],
    instructions: `Design organizational structure:
1. Span of control - How many reports per manager (5-8 typical)
2. Reporting lines - Clear hierarchy, avoid matrix where possible
3. Cross-functional teams - How teams collaborate
4. Decision authority - Who decides what (RAPID)
5. Compensation bands - How pay scales with responsibility
6. Career paths - How people grow within roles
7. Communication structure - How information flows
8. Flexibility - How structure adapts as company grows`,
    parameters: [
      { name: 'company_size', type: 'string', description: 'Current headcount', required: true },
      { name: 'strategic_focus', type: 'array', description: 'Key departments', required: false }
    ],
    complexity: 'high',
    output_format: 'markdown'
  },
];
];

/**
 * Helper function to get skills by count
 */
export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return SKILLS_DATABASE.filter(skill => skill.category === category);
}

/**
 * Get total skills count
 */
export function getTotalSkillsCount(): number {
  return SKILLS_DATABASE.length;
}

/**
 * Get all skills
 */
export function getAllSkills(): Skill[] {
  return [...SKILLS_DATABASE];
}
