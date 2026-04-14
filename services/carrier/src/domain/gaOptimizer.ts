import { rankCarriers, type CarrierBid } from './scoring';

export interface OptimizerCandidate extends CarrierBid {
  capacityPerCarrier?: number;
}

export interface OptimizerInput {
  shipmentIds: string[];
  candidatesByShipment: Record<string, OptimizerCandidate[]>;
  carrierCapacities?: Record<string, number>;
}

export interface OptimizerOptions {
  populationSize: number;
  generations: number;
  mutationRate: number;
  seed: number;
  maxMs?: number;
}

export interface OptimizerResult {
  assignment: Record<string, string | null>;
  fitness: number;
  generations: number;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Genome = (string | null)[];

function randomGenome(input: OptimizerInput, rng: () => number): Genome {
  return input.shipmentIds.map((sid) => {
    const cands = input.candidatesByShipment[sid] ?? [];
    if (cands.length === 0) return null;
    const idx = Math.floor(rng() * cands.length);
    return cands[idx]?.carrierId ?? null;
  });
}

function evaluate(genome: Genome, input: OptimizerInput): number {
  const cap = input.carrierCapacities ?? {};
  const counts: Record<string, number> = {};
  let total = 0;
  let assignedCount = 0;
  input.shipmentIds.forEach((sid, i) => {
    const carrierId = genome[i];
    if (carrierId === null || carrierId === undefined) return;
    counts[carrierId] = (counts[carrierId] ?? 0) + 1;
    const cands = input.candidatesByShipment[sid] ?? [];
    const ranked = rankCarriers(cands);
    const me = ranked.find((r) => r.carrierId === carrierId);
    if (me) {
      total += me.score;
      assignedCount++;
    }
  });
  let penalty = 0;
  for (const [cid, c] of Object.entries(counts)) {
    const limit = cap[cid] ?? Infinity;
    if (c > limit) penalty += (c - limit) * 0.5;
  }
  if (assignedCount === 0) return 0;
  return Math.max(0, total / input.shipmentIds.length - penalty / input.shipmentIds.length);
}

function tournamentPick(pop: { genome: Genome; fitness: number }[], rng: () => number): Genome {
  const a = pop[Math.floor(rng() * pop.length)];
  const b = pop[Math.floor(rng() * pop.length)];
  if (!a || !b) return pop[0]?.genome ?? [];
  return a.fitness >= b.fitness ? a.genome : b.genome;
}

function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const cut = Math.floor(rng() * a.length);
  return a.slice(0, cut).concat(b.slice(cut));
}

function mutate(g: Genome, input: OptimizerInput, rate: number, rng: () => number): Genome {
  return g.map((cur, i) => {
    if (rng() >= rate) return cur;
    const sid = input.shipmentIds[i];
    if (sid === undefined) return cur;
    const cands = input.candidatesByShipment[sid] ?? [];
    if (cands.length === 0) return null;
    return cands[Math.floor(rng() * cands.length)]?.carrierId ?? cur;
  });
}

export function optimizeAssignment(
  input: OptimizerInput,
  options: OptimizerOptions,
): OptimizerResult {
  if (input.shipmentIds.length === 0) {
    return { assignment: {}, fitness: 0, generations: 0 };
  }
  const cells = options.populationSize * options.generations * input.shipmentIds.length;
  if (cells > 1_000_000) {
    throw new Error('GA budget exceeded (population × generations × shipments > 1M)');
  }
  const rng = mulberry32(options.seed);
  let population = Array.from({ length: options.populationSize }, () => {
    const g = randomGenome(input, rng);
    return { genome: g, fitness: evaluate(g, input) };
  });
  population.sort((x, y) => y.fitness - x.fitness);
  let best = population[0];
  if (!best) return { assignment: {}, fitness: 0, generations: 0 };

  const startedAt = Date.now();
  let actualGen = 0;
  for (let g = 0; g < options.generations; g++) {
    actualGen = g + 1;
    if (options.maxMs !== undefined && Date.now() - startedAt > options.maxMs) break;
    const next: typeof population = [{ genome: best.genome, fitness: best.fitness }];
    while (next.length < options.populationSize) {
      const a = tournamentPick(population, rng);
      const b = tournamentPick(population, rng);
      const child = mutate(crossover(a, b, rng), input, options.mutationRate, rng);
      next.push({ genome: child, fitness: evaluate(child, input) });
    }
    next.sort((x, y) => y.fitness - x.fitness);
    population = next;
    const head = population[0];
    if (head && head.fitness > best.fitness) best = head;
  }

  const assignment: Record<string, string | null> = {};
  input.shipmentIds.forEach((sid, i) => {
    assignment[sid] = best?.genome[i] ?? null;
  });
  return { assignment, fitness: best?.fitness ?? 0, generations: actualGen };
}
