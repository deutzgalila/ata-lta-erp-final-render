/**
 * Dependency Graph Cycle Detection Oracle
 *
 * Implements DFS-based cycle detection across tasks in a Work Request.
 * Identifies direct (A -> B -> A), indirect (A -> B -> C -> A), self-dependencies (A -> A),
 * and invalid identifiers ('0', empty string).
 * Bypasses wildcard '*' which enforces topological dependency on all preceding tasks.
 */

export interface DependencyValidationTask {
  id: string;
  dependsOn?: string[] | string | null;
}

export interface DependencyValidationResult {
  hasCycle: boolean;
  error?: string;
  cycleNodes?: string[];
}

export function validateDependencies(
  tasks: DependencyValidationTask[]
): DependencyValidationResult {
  const adj = new Map<string, string[]>();
  const allIds = new Set(tasks.map((t) => t.id));

  for (const t of tasks) {
    if (!adj.has(t.id)) {
      adj.set(t.id, []);
    }
    if (t.dependsOn === undefined || t.dependsOn === null) {
      continue;
    }

    const deps = Array.isArray(t.dependsOn) ? t.dependsOn : [t.dependsOn];
    for (const d of deps) {
      if (d === '0' || d === '') {
        return { hasCycle: true, error: `Invalid dependency identifier '${d}'` };
      }
      if (d === '*') {
        continue;
      }
      if (!allIds.has(d)) {
        return {
          hasCycle: true,
          error: `Dependency target '${d}' does not exist in work request`,
        };
      }
      if (d === t.id) {
        return { hasCycle: true, error: `Self-dependency detected for task '${t.id}'` };
      }
      const list = adj.get(t.id);
      if (list) {
        list.push(d);
      }
    }
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cycleNodes: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);

    const neighbors = adj.get(node) ?? [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        if (dfs(n)) {
          return true;
        }
      } else if (recStack.has(n)) {
        cycleNodes.push(n);
        return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const t of tasks) {
    if (!visited.has(t.id)) {
      if (dfs(t.id)) {
        return {
          hasCycle: true,
          error: `Circular dependency detected involving task '${t.id}'`,
          cycleNodes,
        };
      }
    }
  }

  return { hasCycle: false };
}
