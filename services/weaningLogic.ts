import { DrugConfig, WeanConfig, ScheduleResult, ScheduleStep, Denomination } from '../types';

interface ExpandedOption {
  originalId: string;
  strength: number;
  cost: number; // 1 for whole, 0.5 for half, 0.25 for quarter
}

/**
 * Finds the combination of tablets that minimizes the difference between
 * the total strength and the target dose.
 * Returns the counts for each denomination and the actual resulting dose.
 */
function findBestTabletCombination(
  targetDose: number,
  denominations: Denomination[]
): { actualDose: number; tablets: { [id: string]: number } } {
  if (targetDose <= 0) {
    return { actualDose: 0, tablets: {} };
  }

  // Expand denominations into all possible physical pieces (Whole, Half, Quarter)
  const options: ExpandedOption[] = [];
  denominations.forEach(d => {
    // Always add whole tablet
    options.push({ originalId: d.id, strength: d.strength, cost: 1 });
    
    // Add half if allowed
    if (d.canSplit === 'half' || d.canSplit === 'quarter') {
      options.push({ originalId: d.id, strength: d.strength / 2, cost: 0.5 });
    }
    
    // Add quarter if allowed
    if (d.canSplit === 'quarter') {
      options.push({ originalId: d.id, strength: d.strength / 4, cost: 0.25 });
    }
  });

  // Sort options descending by strength to prioritize larger pieces (greedy-ish approach)
  const sortedOptions = options.sort((a, b) => b.strength - a.strength);
  
  if (sortedOptions.length === 0) return { actualDose: 0, tablets: {} };

  const minStrength = sortedOptions[sortedOptions.length - 1].strength;
  
  let bestDiff = Infinity;
  let bestCombo: { [index: number]: number } = {}; // Index in sortedOptions -> count
  let bestActual = 0;

  // Base greedy fill for large doses to optimize performance
  let baseActual = 0;
  let remainingTarget = targetDose;
  const baseCounts: { [index: number]: number } = {};
  
  // Use the largest available whole tablet for bulk filling
  const largestOptionIndex = sortedOptions.findIndex(o => o.cost === 1); 
  if (largestOptionIndex !== -1) {
    const largest = sortedOptions[largestOptionIndex];
    if (targetDose > largest.strength * 5) {
       const bulkCount = Math.floor((targetDose - (largest.strength * 4)) / largest.strength);
       if (bulkCount > 0) {
           baseCounts[largestOptionIndex] = bulkCount;
           baseActual += bulkCount * largest.strength;
           remainingTarget -= bulkCount * largest.strength;
       }
    }
  }

  function solve(index: number, currentSum: number, counts: { [index: number]: number }) {
    const diff = Math.abs(currentSum - remainingTarget);
    
    // Update best if this is closer
    if (diff < bestDiff - 0.0001) { // Epsilon for float comparison
        bestDiff = diff;
        bestActual = baseActual + currentSum;
        bestCombo = { ...counts };
    } else if (Math.abs(diff - bestDiff) < 0.0001) {
        // Tie-breaker: prefer fewer physical pieces/cuts (sum of costs isn't quite right, we want simplicity)
        // Let's use total 'cost' (number of tablets used) as tie breaker
        const currentCost = Object.entries(counts).reduce((acc, [idx, cnt]) => acc + (cnt * sortedOptions[Number(idx)].cost), 0);
        const bestCost = Object.entries(bestCombo).reduce((acc, [idx, cnt]) => acc + (cnt * sortedOptions[Number(idx)].cost), 0);
        
        if (currentCost < bestCost) {
             bestActual = baseActual + currentSum;
             bestCombo = { ...counts };
        }
    }

    if (index >= sortedOptions.length) return;
    
    // Pruning
    if (currentSum > remainingTarget + minStrength) return;

    const option = sortedOptions[index];
    // Heuristic limit: don't add more than necessary to cover remaining
    // For smaller pieces (quarters), we might need up to 3 to make a whole, but since we have whole options sorted first, 
    // we only need enough to cover the "gap" between wholes.
    // Generally 0-2 of a specific fragment size is enough if we have the larger sizes available.
    // However, if we only have 10mg and need 2.5mg, we pick one 2.5mg option.
    const maxUseful = Math.ceil((remainingTarget - currentSum) / option.strength) + 1; 
    const limit = Math.min(5, Math.max(0, maxUseful));

    for (let i = 0; i <= limit; i++) {
        const nextCounts = { ...counts };
        if (i > 0) nextCounts[index] = (nextCounts[index] || 0) + i;
        solve(index + 1, currentSum + (i * option.strength), nextCounts);
    }
  }

  solve(0, 0, {});

  // Aggregate results back to original denomination IDs
  const finalTablets: { [id: string]: number } = {};
  
  // Add base counts
  Object.entries(baseCounts).forEach(([idx, count]) => {
      const opt = sortedOptions[Number(idx)];
      finalTablets[opt.originalId] = (finalTablets[opt.originalId] || 0) + (count * opt.cost);
  });

  // Add optimized remainder counts
  Object.entries(bestCombo).forEach(([idx, count]) => {
      const opt = sortedOptions[Number(idx)];
      finalTablets[opt.originalId] = (finalTablets[opt.originalId] || 0) + (count * opt.cost);
  });
  
  return {
    actualDose: parseFloat(bestActual.toFixed(3)),
    tablets: finalTablets
  };
}

export function generateSchedule(drug: DrugConfig, wean: WeanConfig): ScheduleResult {
  const steps: ScheduleStep[] = [];
  const totalTablets: { [denomId: string]: number } = {};
  
  let currentTarget = drug.currentDose;
  let currentDate = new Date(drug.startDate);
  let iteration = 0;
  
  const MAX_ITERATIONS = 500; 

  while (currentTarget > wean.minimumDoseThreshold && iteration < MAX_ITERATIONS) {
    const { actualDose, tablets } = findBestTabletCombination(currentTarget, drug.denominations);
    
    steps.push({
      date: currentDate.toISOString().split('T')[0],
      dayIndex: iteration * wean.intervalDays,
      targetDose: parseFloat(currentTarget.toFixed(3)),
      actualDose,
      tablets,
      isStop: false
    });

    Object.entries(tablets).forEach(([id, count]) => {
      totalTablets[id] = (totalTablets[id] || 0) + count * wean.intervalDays;
    });

    if (wean.reductionType === 'fixed') {
      currentTarget = currentTarget - wean.reductionValue;
    } else {
      currentTarget = currentTarget * (1 - (wean.reductionValue / 100));
    }

    currentDate.setDate(currentDate.getDate() + wean.intervalDays);
    iteration++;
  }

  steps.push({
    date: currentDate.toISOString().split('T')[0],
    dayIndex: iteration * wean.intervalDays,
    targetDose: 0,
    actualDose: 0,
    tablets: {},
    isStop: true
  });

  return {
    steps,
    totalTablets,
    durationWeeks: Math.ceil((iteration * wean.intervalDays) / 7)
  };
}