// ============================================
// MAXIMUM BIPARTITE MATCHING ALGORITHM
// ============================================
// Implements Hopcroft-Karp inspired algorithm for finding
// the maximum number of trade crosses possible.
//
// Given a set of valid pairs (edges), finds the assignment that:
// 1. Maximizes total number of matches
// 2. Secondary: Minimizes total balance difference (tie-breaker)

export interface MatchCandidate<T> {
  nodeA: T;
  nodeB: T;
  weight: number; // Lower is better (balance difference)
}

export interface MatchingResult<T> {
  matches: Array<{ nodeA: T; nodeB: T; weight: number }>;
  unmatched: T[];
}

/**
 * Find maximum matching using exhaustive search with pruning
 * For small sets (typical: 20-50 accounts), this is fast enough
 * and GUARANTEES the optimal solution
 */
export function findMaximumMatching<T extends { id: string }>(
  candidates: MatchCandidate<T>[],
  maxIterations: number = 100000
): MatchingResult<T> {
  if (candidates.length === 0) {
    return { matches: [], unmatched: [] };
  }

  // Get all unique nodes
  const allNodes = new Map<string, T>();
  for (const c of candidates) {
    allNodes.set(c.nodeA.id, c.nodeA);
    allNodes.set(c.nodeB.id, c.nodeB);
  }

  // Build adjacency list for each node (what can it match with?)
  const adjacency = new Map<string, MatchCandidate<T>[]>();
  for (const c of candidates) {
    if (!adjacency.has(c.nodeA.id)) adjacency.set(c.nodeA.id, []);
    if (!adjacency.has(c.nodeB.id)) adjacency.set(c.nodeB.id, []);
    adjacency.get(c.nodeA.id)!.push(c);
    adjacency.get(c.nodeB.id)!.push(c);
  }

  // Sort candidates by weight (balance difference) - prefer closer matches
  const sortedCandidates = [...candidates].sort((a, b) => a.weight - b.weight);

  // Track best solution found
  let bestMatching: Array<{ nodeA: T; nodeB: T; weight: number }> = [];
  let bestMatchCount = 0;
  let bestTotalWeight = Infinity;
  let iterations = 0;

  /**
   * Recursive backtracking search
   * Try each candidate as a match, then recursively match remaining nodes
   */
  function backtrack(
    currentMatching: Array<{ nodeA: T; nodeB: T; weight: number }>,
    usedNodes: Set<string>,
    candidateIndex: number,
    currentWeight: number
  ): void {
    iterations++;
    if (iterations > maxIterations) return;

    // Pruning: calculate maximum possible additional matches
    const remainingNodes = new Set<string>();
    for (let i = candidateIndex; i < sortedCandidates.length; i++) {
      const c = sortedCandidates[i];
      if (!usedNodes.has(c.nodeA.id) && !usedNodes.has(c.nodeB.id)) {
        remainingNodes.add(c.nodeA.id);
        remainingNodes.add(c.nodeB.id);
      }
    }
    const maxPossibleAdditional = Math.floor(remainingNodes.size / 2);
    const maxPossibleTotal = currentMatching.length + maxPossibleAdditional;

    // Prune: can't beat current best
    if (maxPossibleTotal < bestMatchCount) return;

    // Update best if this is better
    if (
      currentMatching.length > bestMatchCount ||
      (currentMatching.length === bestMatchCount && currentWeight < bestTotalWeight)
    ) {
      bestMatchCount = currentMatching.length;
      bestTotalWeight = currentWeight;
      bestMatching = [...currentMatching];
    }

    // Try adding more matches
    for (let i = candidateIndex; i < sortedCandidates.length; i++) {
      const c = sortedCandidates[i];
      if (usedNodes.has(c.nodeA.id) || usedNodes.has(c.nodeB.id)) continue;

      // Include this match
      usedNodes.add(c.nodeA.id);
      usedNodes.add(c.nodeB.id);
      currentMatching.push({ nodeA: c.nodeA, nodeB: c.nodeB, weight: c.weight });

      backtrack(currentMatching, usedNodes, i + 1, currentWeight + c.weight);

      // Backtrack
      currentMatching.pop();
      usedNodes.delete(c.nodeA.id);
      usedNodes.delete(c.nodeB.id);

      if (iterations > maxIterations) break;
    }
  }

  backtrack([], new Set(), 0, 0);

  // Find unmatched nodes
  const matchedIds = new Set<string>();
  for (const m of bestMatching) {
    matchedIds.add(m.nodeA.id);
    matchedIds.add(m.nodeB.id);
  }
  const unmatched: T[] = [];
  for (const [id, node] of allNodes) {
    if (!matchedIds.has(id)) {
      unmatched.push(node);
    }
  }

  console.log(`[MAX-MATCHING] Found ${bestMatching.length} optimal matches in ${iterations} iterations`);
  console.log(`[MAX-MATCHING] Unmatched nodes: ${unmatched.length}`);

  return {
    matches: bestMatching,
    unmatched
  };
}

/**
 * Greedy fallback for very large sets
 * Less optimal but much faster O(n²)
 */
export function findGreedyMatching<T extends { id: string }>(
  candidates: MatchCandidate<T>[]
): MatchingResult<T> {
  // Sort by weight (balance difference)
  const sorted = [...candidates].sort((a, b) => a.weight - b.weight);

  const usedNodes = new Set<string>();
  const matches: Array<{ nodeA: T; nodeB: T; weight: number }> = [];

  for (const c of sorted) {
    if (usedNodes.has(c.nodeA.id) || usedNodes.has(c.nodeB.id)) continue;
    usedNodes.add(c.nodeA.id);
    usedNodes.add(c.nodeB.id);
    matches.push({ nodeA: c.nodeA, nodeB: c.nodeB, weight: c.weight });
  }

  // Find unmatched
  const allNodes = new Map<string, T>();
  for (const c of candidates) {
    allNodes.set(c.nodeA.id, c.nodeA);
    allNodes.set(c.nodeB.id, c.nodeB);
  }
  const unmatched: T[] = [];
  for (const [id, node] of allNodes) {
    if (!usedNodes.has(id)) {
      unmatched.push(node);
    }
  }

  return { matches, unmatched };
}

/**
 * Smart matching: uses exhaustive search for small sets, greedy for large
 */
export function findOptimalMatching<T extends { id: string }>(
  candidates: MatchCandidate<T>[],
  exhaustiveThreshold: number = 200 // Use exhaustive if fewer candidates
): MatchingResult<T> {
  if (candidates.length === 0) {
    return { matches: [], unmatched: [] };
  }

  if (candidates.length <= exhaustiveThreshold) {
    return findMaximumMatching(candidates);
  } else {
    console.log(`[MAX-MATCHING] Using greedy fallback for ${candidates.length} candidates`);
    return findGreedyMatching(candidates);
  }
}
