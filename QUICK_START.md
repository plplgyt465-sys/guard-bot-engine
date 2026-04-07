# Quick Start - Gemini + 300 Skills Agent

**Get up and running in 10 minutes**

## What You Have

A production-ready autonomous AI agent that:
- Uses unofficial Gemini API (no keys needed)
- Has 300+ business skills (auto-selected)
- Remembers every conversation (full history)
- Executes autonomously (no approvals)
- Costs zero API dollars (Gemini is free)

## 1-Minute Setup

### Option A: Cloud Deployment

```bash
# 1. Deploy database tables
supabase db execute scripts/001-add-conversation-memory.sql

# 2. Deploy functions
supabase functions deploy

# 3. That's it!
```

### Option B: Local Testing

```typescript
// 1. Import the agent
import { createSkillfulAgent } from "./supabase/functions/_shared/skillful-agent.ts";

// 2. Create it
const agent = await createSkillfulAgent({
  supabase: yourClient,
  conversationId: "test_123",
  sessionId: "session_456"
});

// 3. Use it
const response = await agent.process({
  query: "Research Acme Corp for sales outreach"
});

console.log(response.message);
```

## 5-Minute Test

```bash
# Test the example function
curl -X POST http://localhost:54321/functions/v1/skillful-agent-example \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create 5 LinkedIn hooks about productivity",
    "category": "marketing"
  }'

# Expected: 
# {
#   "status": "success",
#   "message": "...",
#   "selected_skills": [
#     { "name": "Hook Engineer - Marketing", ... }
#   ],
#   "execution_results": [...]
# }
```

## What Each Skill Does

### Sales (50 skills)
- Prospect research briefs
- Email tone adjustment
- Objection prediction
- CTA optimization
- Discovery questions
- Follow-up sequences

### Marketing (50 skills)
- Content hooks
- SEO planning
- A/B copy variants
- Distribution strategy
- Content calendar creation

### Finance (50 skills)
- Financial modeling
- Unit economics
- Pricing strategy
- Revenue projections
- Cash flow analysis

### HR (40 skills)
- Interview questions
- Company culture
- Hiring frameworks
- Onboarding process

### Operations (40 skills)
- SOP documentation
- Meeting agendas
- Process optimization
- Workflow design

### Product (40 skills)
- Feature prioritization
- User research planning
- Roadmap creation
- Technical specs

### C-Suite (30 skills)
- Business strategy
- Board presentations
- Organization design
- M&A frameworks

## 5 Example Requests

### 1. Sales Prospect Research
```typescript
await agent.process({
  query: "Research TechCorp for outreach to their VP of Sales",
  category: 'sales',
  parameters: {
    company: 'TechCorp',
    target_title: 'VP of Sales'
  }
});
```
**Returns**: Pre-call intelligence brief with pain points and talking points

### 2. Marketing Content Hooks
```typescript
await agent.process({
  query: "Create LinkedIn hooks about SaaS pricing",
  category: 'marketing',
  parameters: {
    platform: 'linkedin',
    topic: 'SaaS pricing strategy'
  }
});
```
**Returns**: 10 scroll-stopping opening lines

### 3. Financial Projections
```typescript
await agent.process({
  query: "Build 3-year financial model for SaaS startup",
  category: 'finance',
  parameters: {
    mrr: 50000,
    burn_rate: 150000
  }
});
```
**Returns**: Pro forma financials with break-even analysis

### 4. Interview Questions
```typescript
await agent.process({
  query: "Create behavioral interview questions",
  category: 'hr',
  parameters: {
    role: 'Senior Engineer',
    key_competencies: ['Leadership', 'Problem-solving']
  }
});
```
**Returns**: STAR-based interview questions

### 5. Feature Prioritization
```typescript
await agent.process({
  query: "Prioritize product features",
  category: 'product',
  parameters: {
    candidate_features: [
      'Dark mode',
      'Mobile app',
      'API access'
    ]
  }
});
```
**Returns**: Ranked features using RICE framework

## How It Works (30 seconds)

1. **You send query**: "Research competitor pricing"
2. **Agent selects skills**: Finds best 3-5 matching skills
3. **Agent executes**: Runs each skill with Gemini
4. **Agent verifies**: Checks if results make sense
5. **Agent reports**: Summarizes and returns answer
6. **Agent remembers**: Stores everything for context

All in 2-10 seconds. No human approval needed.

## Access Results

```typescript
const response = await agent.process({ query: "..." });

// What skills were used?
response.selected_skills.map(s => s.skill.name);
// => ["Prospect Research Activator", "Email Tone Calibrator"]

// What were the results?
response.execution_results.map(r => ({
  skill: r.skill_name,
  success: r.success,
  output: r.output
}));

// How did it decide?
console.log(response.reasoning);

// What was the final answer?
console.log(response.message);
```

## Monitor Performance

```typescript
// Get statistics
const stats = agent.getStats();
console.log(stats.total_skills_available);     // 300+
console.log(stats.gemini_context_usage);       // Token usage
console.log(stats.last_executions);            // Recent runs

// Get memory
const memory = agent.getMemory();
const snapshot = await memory.getMemorySnapshot();
console.log(snapshot);
// {
//   total_entries: 23,
//   total_tokens: 8450,
//   last_phase: "reporting"
// }
```

## Common Issues & Fixes

### "No skills found"
- Lower `minConfidenceLevel` to 'low'
- Increase `maxSkillsPerRequest` to 10
- Make query more specific

### "Agent taking too long"
- Gemini might be rate limited (20/minute)
- Wait 30 seconds, then retry
- Or check `gemini.getContextUsage()`

### "Memory growing too large"
- Automatic compression kicks in at 100K tokens
- Or manually: `memory.compressHistory(20)`
- Or archive old conversations in DB

## Files to Know

- `skillful-agent.ts` - Main agent (411 lines)
- `gemini-client.ts` - Gemini API integration (283 lines)
- `skills-registry.ts` - Skill management (279 lines)
- `skill-selector.ts` - Skill selection engine (275 lines)
- `conversation-memory.ts` - Memory management (382 lines)
- `skills-database.ts` - Skill definitions (690 lines)

## What to Do Next

1. ✅ Deploy to Supabase
2. ✅ Test with 5 sample requests
3. ✅ Integrate with your app
4. ✅ Add more skills (there are 250+ templates ready)
5. ✅ Monitor performance
6. ✅ Customize for your use case

## Documentation

- **Full Reference**: See `GEMINI_SKILLS_README.md`
- **How to Deploy**: See `IMPLEMENTATION_GUIDE.md`
- **What Was Built**: See `BUILDOUT_SUMMARY.md`
- **Original Plan**: See `v0_plans/efficient-path.md`

---

**You now have a 300-skill autonomous AI agent. Go build something amazing.**
