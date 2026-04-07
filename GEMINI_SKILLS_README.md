# Guard Bot Engine - Gemini + 300 Skills System

**Version**: 2.0 (Autonomous with Gemini & Full Skill Suite)

## Overview

This is a complete rewrite of the guard-bot-engine featuring:

✅ **Unofficial Gemini API** - No auth required, unlimited requests
✅ **300+ Executable Skills** - Organized by category, auto-selected
✅ **Full Conversation Memory** - Every interaction stored and preserved
✅ **Autonomous Execution** - Multi-phase pipeline with zero manual approval gates
✅ **Smart Skill Selection** - AI-powered matching using keyword + relevance scoring

---

## Architecture

### 1. **Gemini Client** (`gemini-client.ts`)
- Unofficial API integration (no tokens/cookies needed)
- Streaming response support
- Rate limiting (20 requests/minute)
- Automatic retry with exponential backoff
- Conversation history management
- Context compression for long conversations

### 2. **Skills Registry** (`skills-registry.ts`)
- 300+ skills indexed by category, keywords, tags
- Auto-organization and discovery
- Usage tracking and success rate metrics
- Full-text search support
- Statistics and reporting

### 3. **Skill Selector** (`skill-selector.ts`)
- Keyword extraction from user input
- Relevance scoring (0-100)
- Confidence levels (high/medium/low)
- Alternative suggestions if skill fails
- Reasoning generation via Gemini

### 4. **Conversation Memory** (`conversation-memory.ts`)
- Full history of all interactions
- Entry types: messages, responses, skill executions, tool calls, decisions, phase transitions
- Token counting and compression
- Automatic database persistence
- Search and filtering

### 5. **Skillful Agent** (`skillful-agent.ts`)
- Unified orchestrator
- 5-phase autonomous pipeline:
  1. **PLANNING** - Skill selection and validation
  2. **EXECUTING** - Skill execution sequentially
  3. **VERIFYING** - Result validation
  4. **REPORTING** - Summary generation
  5. **DONE** - Completion and logging
- Auto-retry on failures
- Statistics and monitoring

---

## Core Components

### Gemini Client Usage

```typescript
import { getGeminiClient } from "./gemini-client.ts";

const gemini = getGeminiClient();

// Single request
const response = await gemini.request("Your prompt here");
console.log(response.text);

// With retry and rate limiting (built-in)
const response2 = await gemini.request("Another prompt", 3); // 3 retries max

// Get history
const history = gemini.getHistory();

// Compress if getting long
if (gemini.getContextUsage().approximateTokens > 100000) {
  gemini.compressHistory(20); // Keep last 20 messages in full
}
```

### Skills Registry

```typescript
import { getSkillsRegistry } from "./skills-registry.ts";
import { SKILLS_DATABASE } from "./skills-database.ts";

const registry = getSkillsRegistry();

// Register skills
registry.registerSkills(SKILLS_DATABASE);

// Find skills
const salesSkills = registry.getByCategory('sales');
const searchResults = registry.search('email');
const highValue = registry.getHighestSuccessRate(10);

// Update stats
registry.updateUsageStats(skillId, true); // true = success

// Get metrics
const stats = registry.getStats();
```

### Skill Selection

```typescript
import { createSkillSelector } from "./skill-selector.ts";

const selector = createSkillSelector(registry, geminiClient);

const result = await selector.selectSkills({
  user_input: "Help me write a sales email",
  max_results: 5,
  min_confidence: 'medium'
});

console.log(result.selected_skills); // Array of SkillMatch
console.log(result.reasoning);       // Why these skills
console.log(result.execution_plan);  // How to execute them
```

### Conversation Memory

```typescript
import { createConversationMemory } from "./conversation-memory.ts";

const memory = createConversationMemory(supabase, conversationId, sessionId);

// Add entries
await memory.addUserMessage("User query here");
await memory.addAIResponse("AI response here");

// Log events
await memory.logSkillSelection("query", [skills], "reasoning");
await memory.logSkillExecution("skillId", "skillName", input, output, true, 250);
await memory.logPhaseTransition("old", "new", "reason");

// Retrieve history
const full = memory.getFullHistory();
const recent = memory.getRecentHistory(20);
const summary = await memory.getConversationSummary();

// Search
const results = memory.searchHistory("keyword");

// Get stats
const snapshot = await memory.getMemorySnapshot();
```

### Skillful Agent (Complete Example)

```typescript
import { createSkillfulAgent } from "./skillful-agent.ts";

const agent = await createSkillfulAgent({
  supabase: supabaseClient,
  conversationId: "conv_123",
  sessionId: "session_456",
  autoExecute: true,
  maxSkillsPerRequest: 5,
  minConfidenceLevel: 'medium'
});

// Process a request
const response = await agent.process({
  query: "Create a prospect research brief for Acme Corp",
  category: 'sales',
  parameters: {
    company: 'Acme Corp',
    target_title: 'VP Sales'
  }
});

console.log(response.status);              // 'success' | 'partial' | 'error'
console.log(response.message);             // Summary of what happened
console.log(response.selected_skills);     // Which skills were selected
console.log(response.execution_results);   // Results for each skill
console.log(response.reasoning);           // Why these skills

// Get stats
const stats = agent.getStats();
console.log(stats.total_skills_available); // 300+
console.log(stats.gemini_context_usage);   // Token usage
```

---

## The 300 Skills

### Categories (50 each unless noted)

1. **Sales & Outbound (50)** - Prospect research, email calibration, objection handling, CTA optimization, etc.
2. **Marketing & Inbound (50)** - SEO, copywriting, A/B testing, campaign strategy, etc.
3. **Finance (50)** - Financial modeling, budgeting, P&L analysis, valuation, etc.
4. **HR & People (40)** - Hiring, onboarding, performance management, culture, etc.
5. **Operations & SOPs (40)** - Process documentation, meeting agendas, productivity workflows, etc.
6. **Product & Tech (40)** - Roadmapping, technical architecture, product strategy, etc.
7. **C-Suite & Leadership (30)** - Business strategy, board prep, M&A, org structure, etc.

### Skill Structure

Each skill has:
- **ID**: Unique identifier for tracking
- **Name**: Human-readable name
- **Category**: One of 9 categories
- **Description**: 1-2 sentence summary
- **Tags**: Keywords for discovery
- **Trigger Keywords**: Words that trigger automatic selection
- **Instructions**: Full prompt/methodology
- **Parameters**: Required and optional inputs
- **Complexity**: low/medium/high for execution planning
- **Output Format**: markdown, plain_text, json, etc.

---

## Database Schema

### Core Tables

1. **conversation_history** - Every interaction
   - type: user_message | ai_response | skill_execution | etc.
   - content: JSONB with full details
   - tokens_used: For tracking usage
   - timestamp: When it happened

2. **skills_executions** - Track skill runs
   - skill_id, skill_name, skill_category
   - input, output, error_message
   - success, duration_ms
   - Enables performance analysis

3. **phase_transitions** - Track autonomous flow
   - from_phase → to_phase
   - reason: Why the transition
   - Helps debug agent behavior

4. **skills_registry** - Master skill list
   - All 300+ skills with metadata
   - usage_count, success_rate
   - Auto-updated with each execution

5. **memory_snapshots** - Periodic backups
   - Snapshot of full agent state
   - For resumption and recovery

6. **skill_selections** - ML training data
   - user_query → selected_skills
   - execution_successful: true/false
   - user_feedback: For improvement

---

## Autonomous Execution Flow

```
User Request
    ↓
[PLANNING] Select Best Skills
    ├─ Extract keywords from query
    ├─ Score all 300+ skills
    ├─ Select top 5 (configurable)
    ↓
[EXECUTING] Run Skills Sequentially
    ├─ Build skill-specific prompt
    ├─ Execute with Gemini
    ├─ Log result
    ├─ Update skill metrics
    ↓ (repeat for each skill)
[VERIFYING] Validate Results
    ├─ Check success rates
    ├─ Identify failures
    ↓
[REPORTING] Generate Summary
    ├─ Synthesize all outputs
    ├─ Gemini creates final response
    ↓
[DONE] Log to Memory
    ├─ Store full interaction
    ├─ Update statistics
    ├─ Compress if needed
    ↓
Response to User
```

No human approval gates - fully autonomous.

---

## Configuration

### Skill Agent Config

```typescript
interface SkillAgentConfig {
  supabase: SupabaseClient;              // Supabase client
  conversationId: string;                // Unique conversation ID
  sessionId: string;                     // Unique session ID
  autoExecute?: boolean;                 // Default: true
  maxSkillsPerRequest?: number;          // Default: 5
  minConfidenceLevel?: 'low' | 'medium' | 'high'; // Default: 'medium'
}
```

### Request Config

```typescript
interface AgentRequest {
  query: string;                         // User query
  category?: string;                     // Optional category filter
  requireApproval?: boolean;             // Not used if autoExecute=true
  parameters?: Record<string, any>;      // Skill parameters
}
```

---

## Integration with Existing Agent-Core

The new system works **alongside** the existing agent-core:

- `ExploitIntelligence` and `ExploitBrain` continue to work
- New `SkillfulAgent` adds business skills on top
- Memory systems now comprehensive (both exploit logs + business context)
- Gemini replaces Claude for speed and cost efficiency

```typescript
// Use both in parallel
const legacyAgent = new EnhancedDecisionEngine(...);
const skillfulAgent = await createSkillfulAgent(...);

// Legacy agent handles security tasks
const exploitResult = await legacyAgent.makeDecision(...);

// Skillful agent handles business tasks
const businessResult = await skillfulAgent.process({
  query: "Create sales strategy for this target"
});
```

---

## Performance Considerations

### Gemini API
- Rate limit: 20 requests/minute (configurable)
- Context window: ~30,000 tokens
- Auto-compression at 100,000 tokens
- Retry with exponential backoff (1s, 2s, 4s max)

### Skills Execution
- Sequential (not parallel) to avoid rate limits
- ~1-5 seconds per skill average
- Total response time: 5-30 seconds depending on skills

### Memory
- Full history stored in DB
- In-memory cache for current session
- Automatic compression when large
- ~1000 entries ≈ 2-5MB storage

---

## Examples

### Example 1: Sales Prospect Research

```typescript
const response = await agent.process({
  query: "Research Acme Corp for outreach to their VP of Sales",
  category: 'sales'
});

// Selected skills:
// - Prospect Research Activator
// - Competitive Context Analyzer
// - Personalization Strategy

// Output includes pre-call brief with:
// - Company overview
// - Strategic priorities
// - Pain points
// - Trigger events
// - Recommended angles
```

### Example 2: Marketing Campaign

```typescript
const response = await agent.process({
  query: "Create 5 different subject lines for a tech SaaS product email",
  category: 'marketing',
  parameters: {
    target_persona: 'VP Engineering',
    pain_point: 'API complexity'
  }
});

// Selected skills:
// - Copywriting Framework
// - A/B Testing Strategy  
// - Hook Engineer

// Output: 5 subject line variants with reasoning
```

### Example 3: Financial Planning

```typescript
const response = await agent.process({
  query: "Build a 3-year financial projection for a SaaS startup",
  parameters: {
    initial_funding: 2000000,
    burn_rate: 150000,
    mrr: 50000
  }
});

// Selected skills:
// - Financial Modeling Framework
// - Unit Economics Analyzer
// - Cash Flow Projector

// Output: Pro forma financials, break-even analysis, key metrics
```

---

## Deployment

### Prerequisites
- Supabase project with tables created
- Node.js 18+ or Deno runtime
- No API keys needed (Gemini is unofficial)

### Setup

1. **Create database tables:**
   ```bash
   supabase db push scripts/001-add-conversation-memory.sql
   ```

2. **Deploy Supabase functions:**
   ```bash
   supabase functions deploy
   ```

3. **Initialize agent:**
   ```typescript
   const agent = await createSkillfulAgent({...});
   ```

### Environment Variables
None required! Gemini API is unofficial and doesn't need auth.

---

## Troubleshooting

### Gemini Timeouts
- Increase retry count: `gemini.request(prompt, 5)`
- Check rate limits: `gemini.getContextUsage()`
- May need to compress history: `gemini.compressHistory(20)`

### Skill Selection Issues
- Lower `minConfidenceLevel` to 'low' to get more results
- Add more keywords to query
- Check skill trigger_keywords are appropriate

### Memory Growing Too Large
- Auto-compression happens at 100,000 tokens
- Manual: `memory.compressHistory(30)`
- Or: Clear old conversations regularly

### Agent Not Responding
- Check Gemini rate limits (20/min)
- Review execution results for skill failures
- Check database for permissions/RLS issues

---

## Future Enhancements

🔮 **Planned**:
1. Embedding-based skill selection (semantic search)
2. Multi-agent collaboration (multiple agents working together)
3. Skill chaining (output of one skill → input of another)
4. Custom skill upload and registration
5. Feedback loop for continuous learning
6. Performance analytics dashboard
7. Cost tracking and optimization
8. Skill versioning and rollback

---

## License & Attribution

Built as an autonomous upgrade to the guard-bot-engine.
- Gemini integration: Unofficial API
- Skills: Derived from Claude mastery guides
- Architecture: Custom autonomous agent framework

---

**Questions?** Check the implementation files or review the examples above.
