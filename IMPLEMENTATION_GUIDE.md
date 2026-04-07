# Implementation Guide: Gemini + 300 Skills Agent

## Quick Start (5 Minutes)

### 1. Deploy Database Tables

```bash
# Run the migration
supabase db execute scripts/001-add-conversation-memory.sql

# Or push via CLI
supabase functions deploy
```

### 2. Deploy Example Function

```bash
# Deploy the example function
supabase functions deploy skillful-agent-example
```

### 3. Test the Agent

```bash
curl -X POST http://localhost:54321/functions/v1/skillful-agent-example \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a prospect research brief for Acme Corp VP of Sales",
    "category": "sales",
    "parameters": {
      "company": "Acme Corp",
      "target_title": "VP of Sales"
    }
  }'
```

---

## Step-by-Step Implementation

### Step 1: Initialize Agent

```typescript
import { createSkillfulAgent } from "./skillful-agent.ts";

const agent = await createSkillfulAgent({
  supabase: supabaseClient,      // Your Supabase client
  conversationId: "conv_123",    // Unique ID for this conversation
  sessionId: "session_456",      // Unique ID for this session
  autoExecute: true,             // Run skills automatically
  maxSkillsPerRequest: 5,        // Max skills to run per request
  minConfidenceLevel: 'medium'   // Minimum confidence threshold
});
```

### Step 2: Process Requests

```typescript
const response = await agent.process({
  query: "Your user request here",
  category: 'sales',              // Optional: filter to category
  parameters: {                   // Optional: skill-specific params
    company: 'Acme Corp',
    budget: '100,000'
  }
});

console.log(response.message);  // Human-readable response
console.log(response.selected_skills);  // Which skills were used
console.log(response.execution_results);  // Results for each skill
```

### Step 3: Access Memory

```typescript
const memory = agent.getMemory();

// Get full history
const history = memory.getFullHistory();

// Search for specific interactions
const searches = memory.searchHistory("budget");

// Get summary
const snapshot = await memory.getMemorySnapshot();

// Export for analysis
const exported = memory.export();
```

### Step 4: Monitor Performance

```typescript
const stats = agent.getStats();

console.log(stats.total_skills_available);  // 300+
console.log(stats.skills_registry_stats);   // By category
console.log(stats.gemini_context_usage);    // Token usage
console.log(stats.last_executions);         // Recent skill runs
```

---

## Request Types & Examples

### Sales Requests

```typescript
// Prospect Research
await agent.process({
  query: "Research Acme Corp for outreach to their VP of Sales",
  category: 'sales',
  parameters: {
    company: 'Acme Corp',
    target_title: 'VP of Sales'
  }
});

// Email Improvement
await agent.process({
  query: "Improve this email for tone",
  category: 'sales',
  parameters: {
    email_draft: "Hi,\n\nI wanted to reach out...",
    tone_mode: 'warm'
  }
});

// Discovery Questions
await agent.process({
  query: "Create discovery questions for a sales call",
  category: 'sales',
  parameters: {
    solution_type: 'CRM software',
    buyer_role: 'VP Sales'
  }
});
```

### Marketing Requests

```typescript
// Content Hooks
await agent.process({
  query: "Create hooks for a LinkedIn post about productivity",
  category: 'marketing',
  parameters: {
    topic: 'productivity tips for teams',
    platform: 'linkedin',
    core_insight: 'Less meetings = more output'
  }
});

// SEO Content Planning
await agent.process({
  query: "Plan content for ranking",
  category: 'marketing',
  parameters: {
    keyword: 'best CRM for startups',
    your_offering: 'CRM software'
  }
});

// A/B Test Variants
await agent.process({
  query: "Create email subject line variants",
  category: 'marketing',
  parameters: {
    copy_element: "Complete Your Profile",
    conversion_goal: 'click',
    audience: 'SaaS users'
  }
});
```

### Finance Requests

```typescript
// Financial Model
await agent.process({
  query: "Build a 3-year financial projection",
  category: 'finance',
  parameters: {
    business_model: 'saas',
    timeframe: '3-year'
  }
});

// Pricing Strategy
await agent.process({
  query: "Design pricing for our SaaS product",
  category: 'finance',
  parameters: {
    product_cost: '$50/month',
    target_margin: '60%'
  }
});

// Unit Economics
await agent.process({
  query: "Analyze our unit economics",
  category: 'finance',
  parameters: {
    business_model: 'saas',
    current_metrics: {
      cac: 500,
      ltv: 5000
    }
  }
});
```

### HR Requests

```typescript
// Interview Questions
await agent.process({
  query: "Create behavioral interview questions",
  category: 'hr',
  parameters: {
    role: 'Senior Engineer',
    key_competencies: ['Leadership', 'Problem-solving', 'Teamwork']
  }
});

// Company Culture
await agent.process({
  query: "Design company culture framework",
  category: 'hr',
  parameters: {
    company_size: 'small',
    industry: 'SaaS'
  }
});
```

### Operations Requests

```typescript
// Meeting Framework
await agent.process({
  query: "Create meeting agenda structure",
  category: 'operations',
  parameters: {
    meeting_type: 'weekly sync',
    attendee_count: 8
  }
});

// SOP Documentation
await agent.process({
  query: "Document our customer onboarding process",
  category: 'operations',
  parameters: {
    process_name: 'customer onboarding',
    complexity: 'moderate'
  }
});
```

### Product Requests

```typescript
// Feature Prioritization
await agent.process({
  query: "Prioritize our feature backlog",
  category: 'product',
  parameters: {
    candidate_features: [
      'Dark mode',
      'Mobile app',
      'API access',
      'Advanced analytics'
    ],
    framework: 'RICE'
  }
});

// User Research
await agent.process({
  query: "Plan user research for our new feature",
  category: 'product',
  parameters: {
    research_question: 'Why do users abandon the onboarding?',
    product_stage: 'growth'
  }
});

// Roadmap Planning
await agent.process({
  query: "Build a product roadmap",
  category: 'product',
  parameters: {
    product_name: 'Analytics Platform',
    time_horizon: '1-year'
  }
});
```

### C-Suite Requests

```typescript
// Board Presentation
await agent.process({
  query: "Build board presentation",
  category: 'c-suite',
  parameters: {
    company_stage: 'series-a',
    board_type: 'investor'
  }
});

// Organization Design
await agent.process({
  query: "Design organizational structure",
  category: 'c-suite',
  parameters: {
    company_size: 50,
    strategic_focus: ['product', 'sales', 'operations']
  }
});

// Business Strategy
await agent.process({
  query: "Develop business strategy",
  category: 'c-suite',
  parameters: {
    company_name: 'Acme Corp',
    industry: 'SaaS'
  }
});
```

---

## Advanced Configuration

### Custom Skill Selection

```typescript
// Get registry
const registry = agent.getRegistry();

// Search skills
const salesSkills = registry.getByCategory('sales');
const searchResults = registry.search('pricing');

// Filter by complexity
const easySkills = registry.getByComplexity('low');
const hardSkills = registry.getByComplexity('high');

// Get most used/successful
const popular = registry.getMostUsed(10);
const effective = registry.getHighestSuccessRate(10);
```

### Manual Skill Execution

```typescript
const skill = registry.getSkill('sales-prospect-research');

if (skill) {
  // Build prompt with skill instructions
  const prompt = `${skill.instructions}
  
Company: Acme Corp
Title: VP of Sales`;

  // Execute with Gemini
  const gemini = agent.getGemini();
  const result = await gemini.request(prompt);
  
  console.log(result.text);
}
```

### Memory Management

```typescript
const memory = agent.getMemory();

// Add custom entries
await memory.addUserMessage("Custom message");
await memory.addAIResponse("Custom response");

// Log specific events
await memory.logDecision(
  'selected_sales_skills',
  ['research', 'email', 'discovery'],
  'Based on keyword matching'
);

// Check memory usage
const usage = memory.getConversationSummary();
console.log(usage);

// Compress if needed
if (memory.getContextUsage().approximateTokens > 100000) {
  memory.compressHistory(30);  // Keep last 30 messages
}
```

### Performance Tuning

```typescript
// Adjust for speed vs quality
const fastAgent = await createSkillfulAgent({
  // Fast configuration
  maxSkillsPerRequest: 2,       // Fewer skills
  minConfidenceLevel: 'high'    // Only high confidence
});

const thoroughAgent = await createSkillfulAgent({
  // Thorough configuration
  maxSkillsPerRequest: 10,      // More skills
  minConfidenceLevel: 'low'     // Include low confidence
});

// Get execution stats
const stats = agent.getStats();
console.log('Average execution time:', stats.last_executions
  .reduce((sum, ex) => sum + ex.duration_ms, 0) 
  / stats.last_executions.length);
```

---

## Error Handling

### Handling Skill Failures

```typescript
const response = await agent.process({ query: "..." });

if (response.status === 'error') {
  // All skills failed
  console.error("Error:", response.message);
  console.error("Errors:", response.errors);
}

if (response.status === 'partial') {
  // Some skills succeeded, some failed
  const failed = response.execution_results
    .filter(r => !r.success);
  
  console.warn(`${failed.length} skills failed`);
  failed.forEach(r => console.warn(r.skill_name, r.error));
}

// All succeeded
if (response.status === 'success') {
  console.log("Success!");
}
```

### Retry Logic

```typescript
async function requestWithRetry(agent, query, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await agent.process({ query });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
}

// Use it
const response = await requestWithRetry(agent, 
  "Research Acme Corp for sales outreach"
);
```

### Rate Limiting

```typescript
// Gemini has built-in rate limiting (20/minute)
// But you can throttle requests
const REQUESTS_PER_SECOND = 2;
let lastRequestTime = 0;

async function throttledRequest(agent, query) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const minTimeBetweenRequests = 1000 / REQUESTS_PER_SECOND;
  
  if (timeSinceLastRequest < minTimeBetweenRequests) {
    await new Promise(resolve =>
      setTimeout(resolve, minTimeBetweenRequests - timeSinceLastRequest)
    );
  }
  
  lastRequestTime = Date.now();
  return await agent.process({ query });
}
```

---

## Monitoring & Analytics

### Track Skill Performance

```typescript
const registry = agent.getRegistry();

// Get metrics
const stats = registry.getStats();

console.log('Total skills:', stats.total_skills);
console.log('By category:', stats.by_category);
console.log('Average success rate:', stats.average_success_rate);
console.log('Average usage:', stats.average_usage);

// Find problem skills
registry.getAllSkills()
  .filter(s => (s.success_rate || 0) < 0.5)
  .forEach(s => console.log(`⚠️ ${s.name}: ${s.success_rate || 0}`));
```

### Analyze Conversations

```typescript
const memory = agent.getMemory();

// Get conversation summary
const entries = memory.getFullHistory();

const summary = {
  total_messages: entries.filter(e => e.type === 'user_message').length,
  total_responses: entries.filter(e => e.type === 'ai_response').length,
  skills_used: entries.filter(e => e.type === 'skill_execution').length,
  total_time: new Date(entries[entries.length - 1]?.timestamp || Date.now())
    .getTime() - new Date(entries[0]?.timestamp || Date.now()).getTime()
};

console.log('Conversation summary:', summary);
```

### Export for Analysis

```typescript
// Export full conversation
const exported = memory.export();
const json = JSON.parse(exported);

// Analyze patterns
const skillExecutions = json.entries.filter(e => 
  e.type === 'skill_execution'
);

const successRate = skillExecutions
  .filter(e => e.content.success).length / skillExecutions.length;

console.log(`Success rate: ${(successRate * 100).toFixed(1)}%`);
```

---

## Production Deployment

### Environment Setup

```bash
# Supabase environment variables (auto-set)
SUPABASE_URL=your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# No Gemini API key needed (unofficial API)
# Just make sure you have internet access
```

### Database Backups

```bash
# Regular backups of conversation history
supabase db backup

# Or export conversations
SELECT * FROM conversation_history 
ORDER BY created_at DESC 
LIMIT 1000;
```

### Monitoring

```typescript
// Track agent health
setInterval(async () => {
  const stats = agent.getStats();
  
  console.log({
    timestamp: new Date(),
    skills_available: stats.total_skills_available,
    current_phase: stats.current_phase,
    context_usage: stats.gemini_context_usage.approximateTokens,
    last_execution_success: stats.last_executions[0]?.success
  });
}, 60000);  // Every minute
```

---

## Troubleshooting

### Agent Not Responding

**Check**: Gemini rate limits
```typescript
const usage = agent.getGemini().getContextUsage();
console.log('Messages:', usage.messages);
console.log('Tokens:', usage.approximateTokens);
```

**Fix**: Compress history if too large
```typescript
agent.getGemini().compressHistory(20);
```

### Skills Not Being Selected

**Check**: Confidence levels
```typescript
// Try lowering minimum confidence
maxSkillsPerRequest: 10,
minConfidenceLevel: 'low'  // was 'medium'
```

**Check**: Keyword matching
```typescript
const registry = agent.getRegistry();
const results = registry.search("your keyword");
console.log('Found skills:', results);
```

### Memory Growing Too Large

**Check**: Token usage
```typescript
const snapshot = await agent.getMemory().getMemorySnapshot();
console.log('Total tokens:', snapshot.total_tokens);
```

**Fix**: Compress or archive
```typescript
agent.getMemory().compressHistory(30);
// Or clear old conversations from DB
```

---

## Next Steps

1. Deploy the example function
2. Test with sample requests
3. Monitor skill selection accuracy
4. Integrate with your application
5. Add custom skills as needed
6. Set up analytics dashboard

For questions, check `GEMINI_SKILLS_README.md` or review the source code in `supabase/functions/_shared/`.
