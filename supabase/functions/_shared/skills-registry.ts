/**
 * Skills Registry & Manager
 * 
 * Central repository for all 300 executable skills
 * Organized by category with automatic indexing and retrieval
 */

export type SkillCategory = 
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'hr'
  | 'operations'
  | 'product'
  | 'tech'
  | 'c-suite'
  | 'general';

export type SkillComplexity = 'low' | 'medium' | 'high';

export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  tags: string[];
  trigger_keywords: string[];
  instructions: string;
  parameters: SkillParameter[];
  complexity: SkillComplexity;
  output_format: string;
  created_at?: string;
  updated_at?: string;
  usage_count?: number;
  success_rate?: number;
}

export interface SkillMatch {
  skill: Skill;
  relevance_score: number; // 0-100
  matched_keywords: string[];
  confidence: 'high' | 'medium' | 'low';
}

export class SkillsRegistry {
  private skills: Map<string, Skill> = new Map();
  private categoryIndex: Map<SkillCategory, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();

  constructor(initialSkills?: Skill[]) {
    if (initialSkills) {
      initialSkills.forEach(skill => this.registerSkill(skill));
    }
  }

  /**
   * Register a new skill
   */
  registerSkill(skill: Skill): void {
    // Validate skill
    if (!skill.id || !skill.name || !skill.category) {
      throw new Error("Skill must have id, name, and category");
    }

    this.skills.set(skill.id, skill);

    // Index by category
    if (!this.categoryIndex.has(skill.category)) {
      this.categoryIndex.set(skill.category, new Set());
    }
    this.categoryIndex.get(skill.category)!.add(skill.id);

    // Index by keywords
    for (const keyword of skill.trigger_keywords) {
      const lower = keyword.toLowerCase();
      if (!this.keywordIndex.has(lower)) {
        this.keywordIndex.set(lower, new Set());
      }
      this.keywordIndex.get(lower)!.add(skill.id);
    }

    // Index by tags
    for (const tag of skill.tags) {
      const lower = tag.toLowerCase();
      if (!this.tagIndex.has(lower)) {
        this.tagIndex.set(lower, new Set());
      }
      this.tagIndex.get(lower)!.add(skill.id);
    }
  }

  /**
   * Batch register skills
   */
  registerSkills(skills: Skill[]): void {
    skills.forEach(skill => this.registerSkill(skill));
  }

  /**
   * Get skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills by category
   */
  getByCategory(category: SkillCategory): Skill[] {
    const ids = this.categoryIndex.get(category) || new Set();
    return Array.from(ids).map(id => this.skills.get(id)!).filter(Boolean);
  }

  /**
   * Find skills matching keywords
   */
  findByKeywords(keywords: string[]): Skill[] {
    const matchedIds = new Set<string>();

    for (const keyword of keywords) {
      const ids = this.keywordIndex.get(keyword.toLowerCase()) || new Set();
      ids.forEach(id => matchedIds.add(id));
    }

    return Array.from(matchedIds).map(id => this.skills.get(id)!).filter(Boolean);
  }

  /**
   * Find skills by tags
   */
  findByTags(tags: string[]): Skill[] {
    const matchedIds = new Set<string>();

    for (const tag of tags) {
      const ids = this.tagIndex.get(tag.toLowerCase()) || new Set();
      ids.forEach(id => matchedIds.add(id));
    }

    return Array.from(matchedIds).map(id => this.skills.get(id)!).filter(Boolean);
  }

  /**
   * Search skills by text (searches name, description, tags)
   */
  search(query: string): Skill[] {
    const lower = query.toLowerCase();
    return this.getAllSkills().filter(skill =>
      skill.name.toLowerCase().includes(lower) ||
      skill.description.toLowerCase().includes(lower) ||
      skill.tags.some(tag => tag.toLowerCase().includes(lower))
    );
  }

  /**
   * Get skills by complexity level
   */
  getByComplexity(complexity: SkillComplexity): Skill[] {
    return this.getAllSkills().filter(skill => skill.complexity === complexity);
  }

  /**
   * Get most used skills
   */
  getMostUsed(limit = 10): Skill[] {
    return this.getAllSkills()
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, limit);
  }

  /**
   * Get highest success rate skills
   */
  getHighestSuccessRate(limit = 10): Skill[] {
    return this.getAllSkills()
      .sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0))
      .slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const skills = this.getAllSkills();
    const categories: Record<SkillCategory, number> = {
      sales: 0,
      marketing: 0,
      finance: 0,
      hr: 0,
      operations: 0,
      product: 0,
      tech: 0,
      'c-suite': 0,
      general: 0
    };

    let totalComplexity = { low: 0, medium: 0, high: 0 };
    let totalUsage = 0;
    let totalSuccessRate = 0;

    skills.forEach(skill => {
      categories[skill.category]++;
      totalComplexity[skill.complexity]++;
      totalUsage += skill.usage_count || 0;
      totalSuccessRate += skill.success_rate || 0;
    });

    return {
      total_skills: skills.length,
      by_category: categories,
      by_complexity: totalComplexity,
      average_usage: totalUsage / skills.length,
      average_success_rate: totalSuccessRate / skills.length
    };
  }

  /**
   * Update skill usage statistics
   */
  updateUsageStats(skillId: string, success: boolean): void {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    skill.usage_count = (skill.usage_count || 0) + 1;
    
    if (success) {
      const currentRate = skill.success_rate || 0;
      const totalUses = skill.usage_count;
      skill.success_rate = (currentRate * (totalUses - 1) + 1) / totalUses;
    }
  }

  /**
   * Export all skills as JSON
   */
  export(): string {
    return JSON.stringify(Array.from(this.skills.values()), null, 2);
  }

  /**
   * Import skills from JSON
   */
  import(json: string): void {
    const skills = JSON.parse(json) as Skill[];
    this.registerSkills(skills);
  }
}

/**
 * Singleton instance
 */
let registryInstance: SkillsRegistry | null = null;

export function getSkillsRegistry(): SkillsRegistry {
  if (!registryInstance) {
    registryInstance = new SkillsRegistry();
  }
  return registryInstance;
}

export function resetSkillsRegistry(): void {
  registryInstance = null;
}
