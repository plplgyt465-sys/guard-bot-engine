/**
 * Execution Graph (DAG) Manager
 * 
 * Implements dependency-aware execution tracking with:
 * - DAG structure for step dependencies
 * - Topological sorting for execution order
 * - Parallel execution of independent nodes
 * - State persistence and restoration
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PlanStep } from "./agent-core.ts";

// ============================================================================
// TYPES
// ============================================================================

export type NodeStatus = 
  | "pending"    // Not yet ready
  | "ready"      // All dependencies satisfied, can execute
  | "running"    // Currently executing
  | "done"       // Successfully completed
  | "failed"     // Execution failed
  | "skipped";   // Skipped (cached or intentionally bypassed)

export interface ExecutionNode {
  id: string;
  stepIndex: number;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  
  // Dependency tracking
  dependsOn: string[];      // Node IDs this depends on
  dependents: string[];     // Node IDs that depend on this
  
  // Execution state
  status: NodeStatus;
  result?: unknown;
  error?: string;
  
  // Idempotency
  hash: string;
  
  // Timing
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ExecutionGraph {
  sessionId: string;
  version: number;
  
  // Graph structure
  nodes: Map<string, ExecutionNode>;
  rootNodes: string[];      // Nodes with no dependencies
  leafNodes: string[];      // Nodes with no dependents
  
  // Execution order
  executionOrder: string[]; // Topological sort result
  
  // State
  currentPhase: number;     // For parallel execution batches
  completedCount: number;
  failedCount: number;
}

export interface SerializedGraph {
  sessionId: string;
  version: number;
  nodes: Array<[string, ExecutionNode]>;
  rootNodes: string[];
  leafNodes: string[];
  executionOrder: string[];
  currentPhase: number;
  completedCount: number;
  failedCount: number;
}

// ============================================================================
// EXECUTION GRAPH MANAGER
// ============================================================================

export class ExecutionGraphManager {
  private supabase: SupabaseClient;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Build execution graph from plan steps with automatic dependency detection
   */
  buildFromPlan(sessionId: string, steps: PlanStep[]): ExecutionGraph {
    const graph: ExecutionGraph = {
      sessionId,
      version: 1,
      nodes: new Map(),
      rootNodes: [],
      leafNodes: [],
      executionOrder: [],
      currentPhase: 0,
      completedCount: 0,
      failedCount: 0
    };

    // Create nodes for each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const node: ExecutionNode = {
        id: step.id,
        stepIndex: i,
        tool: step.tool,
        args: step.args,
        description: step.description,
        dependsOn: [],
        dependents: [],
        status: "pending",
        hash: this.computeNodeHash(step.tool, step.args),
        createdAt: new Date().toISOString()
      };
      graph.nodes.set(step.id, node);
    }

    // Detect dependencies
    const dependencies = this.detectDependencies(steps);
    
    // Apply dependencies to nodes
    for (const [stepIndex, depIndices] of dependencies.entries()) {
      const stepId = steps[stepIndex].id;
      const node = graph.nodes.get(stepId)!;
      
      for (const depIndex of depIndices) {
        const depId = steps[depIndex].id;
        node.dependsOn.push(depId);
        
        // Update dependent's dependents list
        const depNode = graph.nodes.get(depId)!;
        depNode.dependents.push(stepId);
      }
    }

    // Identify root and leaf nodes
    for (const [id, node] of graph.nodes) {
      if (node.dependsOn.length === 0) {
        graph.rootNodes.push(id);
        node.status = "ready"; // Root nodes are immediately ready
      }
      if (node.dependents.length === 0) {
        graph.leafNodes.push(id);
      }
    }

    // Compute topological order
    graph.executionOrder = this.topologicalSort(graph);

    return graph;
  }

  /**
   * Detect dependencies between steps by analyzing args and tool outputs
   */
  private detectDependencies(steps: PlanStep[]): Map<number, number[]> {
    const deps = new Map<number, number[]>();
    
    // Tool output patterns that indicate dependency
    const outputProducingTools = new Set([
      'port_scan', 'http_probe', 'tech_detect', 'dir_enum',
      'dns_enum', 'ssl_check', 'cve_lookup', 'service_detection',
      'vuln_scan', 'sqli_scan', 'xss_scan', 'lfi_scan'
    ]);

    // Tools that consume specific outputs
    const inputConsumingTools: Record<string, string[]> = {
      'service_detection': ['port_scan'],
      'tech_detect': ['http_probe', 'port_scan'],
      'dir_enum': ['http_probe', 'tech_detect'],
      'vuln_scan': ['port_scan', 'service_detection', 'tech_detect'],
      'sqli_scan': ['dir_enum', 'tech_detect'],
      'xss_scan': ['dir_enum', 'tech_detect'],
      'lfi_scan': ['dir_enum'],
      'ssl_check': ['port_scan'],
      'cve_lookup': ['service_detection', 'tech_detect'],
      'header_check': ['http_probe'],
      'exploit_execute': ['vuln_scan', 'sqli_scan', 'xss_scan']
    };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepDeps: number[] = [];
      
      // Check explicit dependencies via args references
      if (step.args) {
        const argsStr = JSON.stringify(step.args);
        for (let j = 0; j < i; j++) {
          // Check for step reference patterns
          if (argsStr.includes(`$step_${j}`) || 
              argsStr.includes(`{{step_${j}}}`) ||
              argsStr.includes(`"step_${j}"`) ||
              argsStr.includes(`steps[${j}]`)) {
            stepDeps.push(j);
          }
        }
      }

      // Check implicit dependencies based on tool relationships
      const requiredTools = inputConsumingTools[step.tool] || [];
      for (const requiredTool of requiredTools) {
        // Find the most recent step that runs this required tool
        for (let j = i - 1; j >= 0; j--) {
          if (steps[j].tool === requiredTool && !stepDeps.includes(j)) {
            stepDeps.push(j);
            break; // Only depend on most recent
          }
        }
      }

      // Default: sequential dependency for steps with no explicit deps
      // Only if no other dependencies detected and step produces output
      if (stepDeps.length === 0 && i > 0) {
        // Light sequential hint - depend on previous if it produces output
        if (outputProducingTools.has(steps[i - 1].tool)) {
          stepDeps.push(i - 1);
        }
      }

      deps.set(i, stepDeps);
    }

    return deps;
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(graph: ExecutionGraph): string[] {
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    const queue: string[] = [];

    // Initialize in-degrees
    for (const [id, node] of graph.nodes) {
      inDegree.set(id, node.dependsOn.length);
      if (node.dependsOn.length === 0) {
        queue.push(id);
      }
    }

    // Process queue
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      
      const node = graph.nodes.get(nodeId)!;
      for (const dependentId of node.dependents) {
        const newDegree = inDegree.get(dependentId)! - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          queue.push(dependentId);
        }
      }
    }

    // Check for cycles
    if (result.length !== graph.nodes.size) {
      console.warn('[GRAPH] Cycle detected in execution graph!');
      // Fall back to index order for remaining nodes
      for (const [id] of graph.nodes) {
        if (!result.includes(id)) {
          result.push(id);
        }
      }
    }

    return result;
  }

  /**
   * Get nodes ready for execution (all dependencies satisfied)
   */
  getReadyNodes(graph: ExecutionGraph): ExecutionNode[] {
    const ready: ExecutionNode[] = [];
    
    for (const [, node] of graph.nodes) {
      if (node.status === "ready") {
        ready.push(node);
      } else if (node.status === "pending") {
        // Check if all dependencies are done
        const allDepsDone = node.dependsOn.every(depId => {
          const depNode = graph.nodes.get(depId);
          return depNode && (depNode.status === "done" || depNode.status === "skipped");
        });
        
        if (allDepsDone) {
          node.status = "ready";
          ready.push(node);
        }
      }
    }

    return ready;
  }

  /**
   * Mark node as running
   */
  startNode(graph: ExecutionGraph, nodeId: string): void {
    const node = graph.nodes.get(nodeId);
    if (node && node.status === "ready") {
      node.status = "running";
      node.startedAt = new Date().toISOString();
    }
  }

  /**
   * Mark node as completed and propagate to dependents
   */
  completeNode(graph: ExecutionGraph, nodeId: string, result: unknown): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    node.status = "done";
    node.result = result;
    node.completedAt = new Date().toISOString();
    graph.completedCount++;

    // Check dependents
    for (const dependentId of node.dependents) {
      const dependent = graph.nodes.get(dependentId);
      if (dependent && dependent.status === "pending") {
        const allDepsDone = dependent.dependsOn.every(depId => {
          const depNode = graph.nodes.get(depId);
          return depNode && (depNode.status === "done" || depNode.status === "skipped");
        });
        
        if (allDepsDone) {
          dependent.status = "ready";
        }
      }
    }
  }

  /**
   * Mark node as failed
   */
  failNode(graph: ExecutionGraph, nodeId: string, error: string): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    node.status = "failed";
    node.error = error;
    node.completedAt = new Date().toISOString();
    graph.failedCount++;

    // Optionally cascade failure to dependents
    // For now, we leave dependents as pending - they may be retried later
  }

  /**
   * Mark node as skipped (e.g., from cache)
   */
  skipNode(graph: ExecutionGraph, nodeId: string, cachedResult: unknown): void {
    const node = graph.nodes.get(nodeId);
    if (!node) return;

    node.status = "skipped";
    node.result = cachedResult;
    node.completedAt = new Date().toISOString();
    graph.completedCount++;

    // Propagate to dependents same as complete
    for (const dependentId of node.dependents) {
      const dependent = graph.nodes.get(dependentId);
      if (dependent && dependent.status === "pending") {
        const allDepsDone = dependent.dependsOn.every(depId => {
          const depNode = graph.nodes.get(depId);
          return depNode && (depNode.status === "done" || depNode.status === "skipped");
        });
        
        if (allDepsDone) {
          dependent.status = "ready";
        }
      }
    }
  }

  /**
   * Get the result of a dependency node
   */
  getDependencyResult(graph: ExecutionGraph, nodeId: string, dependencyId: string): unknown {
    const depNode = graph.nodes.get(dependencyId);
    if (!depNode) {
      throw new Error(`Dependency ${dependencyId} not found for node ${nodeId}`);
    }
    if (depNode.status !== "done" && depNode.status !== "skipped") {
      throw new Error(`Dependency ${dependencyId} not completed (status: ${depNode.status})`);
    }
    return depNode.result;
  }

  /**
   * Get all dependency results for a node
   */
  getAllDependencyResults(graph: ExecutionGraph, nodeId: string): Map<string, unknown> {
    const node = graph.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const results = new Map<string, unknown>();
    for (const depId of node.dependsOn) {
      results.set(depId, this.getDependencyResult(graph, nodeId, depId));
    }
    return results;
  }

  /**
   * Check if graph is complete
   */
  isComplete(graph: ExecutionGraph): boolean {
    for (const [, node] of graph.nodes) {
      if (node.status !== "done" && node.status !== "skipped" && node.status !== "failed") {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if graph has failures
   */
  hasFailures(graph: ExecutionGraph): boolean {
    return graph.failedCount > 0;
  }

  /**
   * Get resume point (first incomplete nodes after restore)
   */
  getResumePoint(graph: ExecutionGraph): ExecutionNode[] {
    const resumeNodes: ExecutionNode[] = [];
    
    for (const nodeId of graph.executionOrder) {
      const node = graph.nodes.get(nodeId)!;
      
      // Skip completed/skipped nodes
      if (node.status === "done" || node.status === "skipped") {
        continue;
      }
      
      // Reset failed/running nodes to pending
      if (node.status === "failed" || node.status === "running") {
        node.status = "pending";
        node.error = undefined;
        node.startedAt = undefined;
      }
      
      // Check if ready
      const allDepsDone = node.dependsOn.every(depId => {
        const depNode = graph.nodes.get(depId);
        return depNode && (depNode.status === "done" || depNode.status === "skipped");
      });
      
      if (allDepsDone) {
        node.status = "ready";
        resumeNodes.push(node);
      }
    }

    return resumeNodes;
  }

  /**
   * Compute hash for idempotency
   */
  computeNodeHash(tool: string, args: Record<string, unknown>): string {
    const normalized = JSON.stringify(args, Object.keys(args).sort());
    const input = `${tool}:${normalized}`;
    return this.simpleHash(input);
  }

  /**
   * Simple hash function (for Deno compatibility)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Serialize graph for persistence
   */
  serializeGraph(graph: ExecutionGraph): string {
    const serialized: SerializedGraph = {
      sessionId: graph.sessionId,
      version: graph.version,
      nodes: Array.from(graph.nodes.entries()),
      rootNodes: graph.rootNodes,
      leafNodes: graph.leafNodes,
      executionOrder: graph.executionOrder,
      currentPhase: graph.currentPhase,
      completedCount: graph.completedCount,
      failedCount: graph.failedCount
    };
    return JSON.stringify(serialized);
  }

  /**
   * Deserialize graph from persistence
   */
  deserializeGraph(data: string): ExecutionGraph {
    const serialized: SerializedGraph = JSON.parse(data);
    return {
      sessionId: serialized.sessionId,
      version: serialized.version,
      nodes: new Map(serialized.nodes),
      rootNodes: serialized.rootNodes,
      leafNodes: serialized.leafNodes,
      executionOrder: serialized.executionOrder,
      currentPhase: serialized.currentPhase,
      completedCount: serialized.completedCount,
      failedCount: serialized.failedCount
    };
  }

  /**
   * Persist graph to database
   */
  async persistGraph(graph: ExecutionGraph): Promise<void> {
    // Persist individual nodes
    for (const [, node] of graph.nodes) {
      await this.supabase.from('execution_nodes').upsert({
        id: node.id,
        session_id: graph.sessionId,
        step_index: node.stepIndex,
        tool: node.tool,
        args: node.args,
        depends_on: node.dependsOn,
        dependents: node.dependents,
        status: node.status,
        result: node.result,
        error: node.error,
        hash: node.hash,
        started_at: node.startedAt,
        completed_at: node.completedAt
      });
    }
  }

  /**
   * Load graph from database
   */
  async loadGraph(sessionId: string): Promise<ExecutionGraph | null> {
    const { data: nodes } = await this.supabase
      .from('execution_nodes')
      .select('*')
      .eq('session_id', sessionId)
      .order('step_index', { ascending: true });

    if (!nodes || nodes.length === 0) {
      return null;
    }

    const graph: ExecutionGraph = {
      sessionId,
      version: 1,
      nodes: new Map(),
      rootNodes: [],
      leafNodes: [],
      executionOrder: [],
      currentPhase: 0,
      completedCount: 0,
      failedCount: 0
    };

    for (const row of nodes) {
      const node: ExecutionNode = {
        id: row.id,
        stepIndex: row.step_index,
        tool: row.tool,
        args: row.args,
        description: row.description || '',
        dependsOn: row.depends_on || [],
        dependents: row.dependents || [],
        status: row.status as NodeStatus,
        result: row.result,
        error: row.error,
        hash: row.hash,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at
      };
      
      graph.nodes.set(node.id, node);
      
      if (node.dependsOn.length === 0) {
        graph.rootNodes.push(node.id);
      }
      if (node.dependents.length === 0) {
        graph.leafNodes.push(node.id);
      }
      if (node.status === "done" || node.status === "skipped") {
        graph.completedCount++;
      }
      if (node.status === "failed") {
        graph.failedCount++;
      }
    }

    graph.executionOrder = this.topologicalSort(graph);
    return graph;
  }

  /**
   * Add a new node dynamically (for plan modifications)
   */
  addNode(
    graph: ExecutionGraph, 
    step: PlanStep, 
    dependsOn: string[] = []
  ): ExecutionNode {
    const node: ExecutionNode = {
      id: step.id,
      stepIndex: graph.nodes.size,
      tool: step.tool,
      args: step.args,
      description: step.description,
      dependsOn,
      dependents: [],
      status: dependsOn.length === 0 ? "ready" : "pending",
      hash: this.computeNodeHash(step.tool, step.args),
      createdAt: new Date().toISOString()
    };

    // Update dependency nodes
    for (const depId of dependsOn) {
      const depNode = graph.nodes.get(depId);
      if (depNode) {
        depNode.dependents.push(node.id);
      }
    }

    graph.nodes.set(node.id, node);
    
    if (dependsOn.length === 0) {
      graph.rootNodes.push(node.id);
    }
    graph.leafNodes.push(node.id);
    
    // Re-sort
    graph.executionOrder = this.topologicalSort(graph);
    graph.version++;

    return node;
  }

  /**
   * Add dependency between existing nodes
   */
  addDependency(graph: ExecutionGraph, fromId: string, toId: string): boolean {
    const fromNode = graph.nodes.get(fromId);
    const toNode = graph.nodes.get(toId);
    
    if (!fromNode || !toNode) {
      return false;
    }

    // Add dependency (toNode depends on fromNode)
    if (!toNode.dependsOn.includes(fromId)) {
      toNode.dependsOn.push(fromId);
    }
    if (!fromNode.dependents.includes(toId)) {
      fromNode.dependents.push(toId);
    }

    // Update root/leaf status
    graph.rootNodes = graph.rootNodes.filter(id => id !== toId);
    graph.leafNodes = graph.leafNodes.filter(id => id !== fromId);

    // Re-sort
    graph.executionOrder = this.topologicalSort(graph);
    graph.version++;

    return true;
  }

  /**
   * Get execution statistics
   */
  getStats(graph: ExecutionGraph): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    ready: number;
    running: number;
    progress: number;
  } {
    let pending = 0, ready = 0, running = 0;
    
    for (const [, node] of graph.nodes) {
      switch (node.status) {
        case "pending": pending++; break;
        case "ready": ready++; break;
        case "running": running++; break;
      }
    }

    const total = graph.nodes.size;
    const completed = graph.completedCount;
    
    return {
      total,
      completed,
      failed: graph.failedCount,
      pending,
      ready,
      running,
      progress: total > 0 ? (completed / total) * 100 : 0
    };
  }
}
