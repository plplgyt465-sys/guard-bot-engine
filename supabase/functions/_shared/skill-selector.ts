/**
 * Skill Selector Engine
 * 
 * Intelligent skill matching using:
 * - Keyword matching
 * - Intent analysis
 * - Relevance scoring
 * - Embedding-based similarity (when available)
 */

import { GeminiClient } from "./gemini-client.ts";
import { SkillsRegistry, Skill, SkillMatch } from "./skills-registry.ts";

export interface SelectionContext {
  user_input: string;
  conversation_history?: string;
  required_category?: string;
  exclude_skills?: string[];
  max_results?: number;
  min_confidence?: 'low' | 'medium' | 'high';
}

export interface SelectionResult {
  selected_skills: SkillMatch[];
  reasoning: string;
  selected_at: string;
  execution_plan?: string;
}

export class SkillSelector {
  private registry: SkillsRegistry;
  private geminiClient: GeminiClient;

  constructor(registry: SkillsRegistry, geminiClient: GeminiClient) {
    this.registry = registry;
    this.geminiClient = geminiClient;
  }

  /**
   * Extract keywords from user input using simple NLP
   */
  private extractKeywords(text: string): string[] {
    // Common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => {
        // Remove punctuation
        word = word.replace(/[^\w-]/g, '');
        // Filter stop words and short words
        return word.length > 2 && !stopWords.has(word);
      })
      .slice(0, 15); // Limit to top 15 keywords
  }

  /**
   * Calculate keyword relevance score
   */
  private calculateKeywordScore(skill: Skill, keywords: string[]): { score: number; matched: string[] } {
    const matched: string[] = [];
    let score = 0;

    const skillText = (skill.name + ' ' + skill.description + ' ' + skill.tags.join(' ')).toLowerCase();

    for (const keyword of keywords) {
      // Exact match
      if (skillText.includes(keyword)) {
        matched.push(keyword);
        score += 10;
      }

      // Partial match (for compound words)
      for (const triggerKeyword of skill.trigger_keywords) {
        if (triggerKeyword.toLowerCase().includes(keyword) || keyword.includes(triggerKeyword.toLowerCase())) {
          matched.push(keyword);
          score += 5;
        }
      }
    }

    // Normalize score
    const normalizedScore = Math.min(100, (score / (keywords.length * 10)) * 100);
    return { score: normalizedScore, matched: Array.from(new Set(matched)) };
  }

  /**
   * Select best skills using hybrid approach
   */
  async selectSkills(context: SelectionContext): Promise<SelectionResult> {
    const keywords = this.extractKeywords(context.user_input);
    const maxResults = context.max_results || 5;

    // Get candidate skills
    let candidates = this.registry.getAllSkills();

    // Filter by category if specified
    if (context.required_category) {
      candidates = candidates.filter(s => s.category === context.required_category);
    }

    // Exclude specified skills
    if (context.exclude_skills?.length) {
      const excludeSet = new Set(context.exclude_skills);
      candidates = candidates.filter(s => !excludeSet.has(s.id));
    }

    // Score all candidates
    const scoredSkills: SkillMatch[] = candidates.map(skill => {
      const { score, matched } = this.calculateKeywordScore(skill, keywords);
      
      // Confidence based on score
      let confidence: 'high' | 'medium' | 'low';
      if (score >= 70) confidence = 'high';
      else if (score >= 40) confidence = 'medium';
      else confidence = 'low';

      return {
        skill,
        relevance_score: score,
        matched_keywords: matched,
        confidence
      };
    });

    // Sort by score
    scoredSkills.sort((a, b) => b.relevance_score - a.relevance_score);

    // Filter by minimum confidence if specified
    let filtered = scoredSkills;
    if (context.min_confidence) {
      const confidenceValues = { low: 0, medium: 1, high: 2 };
      const minValue = confidenceValues[context.min_confidence];
      filtered = scoredSkills.filter(s => confidenceValues[s.confidence] >= minValue);
    }

    // Take top N results
    const selected = filtered.slice(0, maxResults);

    // Generate reasoning and execution plan using Gemini
    const reasoning = await this.generateReasoning(context.user_input, selected);
    const executionPlan = await this.generateExecutionPlan(context.user_input, selected);

    return {
      selected_skills: selected,
      reasoning,
      selected_at: new Date().toISOString(),
      execution_plan: executionPlan
    };
  }

  /**
   * Generate reasoning for skill selection using Gemini
   */
  private async generateReasoning(userInput: string, matches: SkillMatch[]): Promise<string> {
    const skillsList = matches
      .map((m, i) => `${i + 1}. ${m.skill.name} (confidence: ${m.confidence}, score: ${m.relevance_score.toFixed(1)})`)
      .join('\n');

    const prompt = `Analyze why these skills were selected for this request:

Request: "${userInput}"

Selected Skills:
${skillsList}

Provide a brief 2-3 sentence explanation of why these skills are appropriate for this task. Focus on the connection between the request and the selected skills.`;

    try {
      const response = await this.geminiClient.request(prompt);
      return response.text;
    } catch (error) {
      console.error("[v0] Error generating reasoning:", error);
      return `Selected ${matches.length} skills based on keyword matching and relevance scoring`;
    }
  }

  /**
   * Generate execution plan using Gemini
   */
  private async generateExecutionPlan(userInput: string, matches: SkillMatch[]): Promise<string> {
    if (matches.length === 0) return "";

    const skillsList = matches
      .map(m => `- ${m.skill.name}: ${m.skill.description}`)
      .join('\n');

    const prompt = `Create a brief execution plan for using these skills to address this request:

Request: "${userInput}"

Available Skills:
${skillsList}

Provide a 3-5 step execution plan in bullet points. Be specific about:
1. The order to execute skills
2. Key inputs needed at each step
3. Expected outcomes`;

    try {
      const response = await this.geminiClient.request(prompt);
      return response.text;
    } catch (error) {
      console.error("[v0] Error generating execution plan:", error);
      return "";
    }
  }

  /**
   * Get alternative skill suggestions
   */
  async getAlternatives(failedSkillId: string, context: SelectionContext): Promise<SkillMatch[]> {
    const failedSkill = this.registry.getSkill(failedSkillId);
    if (!failedSkill) return [];

    const newContext: SelectionContext = {
      ...context,
      exclude_skills: [...(context.exclude_skills || []), failedSkillId],
      max_results: 3
    };

    const result = await this.selectSkills(newContext);
    return result.selected_skills;
  }

  /**
   * Analyze skill fit for specific parameters
   */
  async analyzeSkillFit(skill: Skill, context: SelectionContext): Promise<{ fit_score: number; issues: string[] }> {
    const issues: string[] = [];
    let fitScore = 100;

    // Check if skill has required parameters
    const requiredParams = skill.parameters.filter(p => p.required);
    if (requiredParams.length > 0) {
      issues.push(`Requires ${requiredParams.length} parameters`);
      fitScore -= 10;
    }

    // Check complexity vs context
    if (skill.complexity === 'high' && !context.user_input.includes('complex')) {
      issues.push('Skill complexity may be higher than needed');
      fitScore -= 5;
    }

    // Check success rate
    if ((skill.success_rate || 0) < 0.7) {
      issues.push('Skill has lower than average success rate');
      fitScore -= 15;
    }

    return {
      fit_score: Math.max(0, fitScore),
      issues
    };
  }
}

/**
 * Factory for creating selectors
 */
export function createSkillSelector(
  registry: SkillsRegistry,
  geminiClient: GeminiClient
): SkillSelector {
  return new SkillSelector(registry, geminiClient);
}
