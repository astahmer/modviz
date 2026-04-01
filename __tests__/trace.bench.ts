/**
 * Benchmarks for trace generation in shared/modviz-trace.ts
 *
 * Run with:  pnpm exec vitest bench __tests__/trace.bench.ts
 *
 * Two profiles are measured for each query type:
 *   - cold: fresh graph object per iteration → exercises the full build path
 *   - warm: same graph reference, cache already populated → exercises the cache hit path
 *
 * If the "cold" numbers regress, the upstream-chain algorithm has gotten slower.
 * If "warm" numbers regress, the WeakMap lookup or something around it has changed.
 */

import { bench, describe } from "vitest";
import type { ModvizOutput, VizNode } from "../mod/types.ts";
import { buildPackageTraceReport, buildNodeTraceReport } from "../shared/modviz-trace.ts";

// ---------------------------------------------------------------------------
// Synthetic graph generator
// ---------------------------------------------------------------------------

const makeNode = (path: string, overrides: Partial<VizNode> = {}): VizNode => ({
	name: path.split("/").at(-1) ?? path,
	path,
	type: "internal",
	imports: [],
	exports: [],
	unusedExports: [],
	importees: [],
	importedBy: [],
	isBarrelFile: false,
	chain: [],
	...overrides,
});

/**
 * Build a representative synthetic graph:
 * - 5 workspace entrypoints
 * - 240 workspace module nodes spread across "routes" and "components" namespaces
 * - 60 react/react-dom external nodes in node_modules with realistic importedBy chains
 *
 * Each workspace node is imported by 0-4 other workspace nodes (pseudo-random but stable).
 * Each external react node is imported by 3-8 workspace nodes.
 */
const buildLargeGraph = (): ModvizOutput => {
	const WORKSPACE_COUNT = 240;
	const REACT_NODE_COUNT = 60;

	const entrypoints = Array.from(
		{ length: 5 },
		(_, i) => `apps/app-${i}/src/main.ts`,
	);

	const workspacePaths = [
		...entrypoints,
		...Array.from({ length: WORKSPACE_COUNT }, (_, i) => {
			const ns = i < 120 ? "routes" : "components";
			return `src/${ns}/module-${i}.ts`;
		}),
	];

	const reactPaths = [
		...Array.from(
			{ length: REACT_NODE_COUNT },
			(_, i) => `node_modules/react/node-${i}.js`,
		),
	];

	// Build importedBy:  each workspace node (beyond the first few) is imported
	// by 1-4 earlier nodes — creates a realistic DAG.
	const importedByMap = new Map<string, string[]>();
	for (let i = 1; i < workspacePaths.length; i++) {
		const path = workspacePaths[i];
		const parentCount = 1 + (i % 4);
		const parents: string[] = [];
		for (let p = 0; p < parentCount; p++) {
			const parentIdx = Math.max(0, i - 1 - (p * 7 + 3));
			const parent = workspacePaths[parentIdx];
			if (parent && parent !== path && !parents.includes(parent)) {
				parents.push(parent);
			}
		}
		importedByMap.set(path, parents);
	}

	// Each react node is imported by a stable spread of workspace nodes.
	for (let i = 0; i < reactPaths.length; i++) {
		const importers: string[] = [];
		const step = Math.max(1, Math.floor(workspacePaths.length / 8));
		for (let j = (i * 3) % workspacePaths.length; importers.length < 5; j = (j + step) % workspacePaths.length) {
			importers.push(workspacePaths[j]);
			if (importers.length >= 5) break;
		}
		importedByMap.set(reactPaths[i], importers);
	}

	const allPaths = [...workspacePaths, ...reactPaths];
	const nodes: VizNode[] = allPaths.map((path) => {
		const isExternal = path.includes("node_modules");
		const isEntry = entrypoints.includes(path);
		return makeNode(path, {
			type: isEntry ? "entry" : isExternal ? "external" : "internal",
			importedBy: importedByMap.get(path) ?? [],
			package: isExternal
				? { name: "react", path: "node_modules/react" }
				: undefined,
			chain: isEntry ? [[path]] : [],
		});
	});

	return {
		metadata: {
			entrypoints,
			basePath: "/repo",
			totalFiles: nodes.length,
			generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
			nodeModulesCount: REACT_NODE_COUNT,
			packages: [{ name: "app", path: "apps/app-0" }],
		},
		nodes,
		imports: [],
	};
};

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe("trace generation – cold (fresh graph per iteration)", () => {
	bench("buildPackageTraceReport • react", () => {
		buildPackageTraceReport(buildLargeGraph(), "react");
	});

	bench("buildNodeTraceReport • src/routes", () => {
		buildNodeTraceReport(buildLargeGraph(), "src/routes");
	});

	bench("buildNodeTraceReport • specific node", () => {
		buildNodeTraceReport(buildLargeGraph(), "src/routes/module-0.ts");
	});
});

describe("trace generation – warm (cached graph reference)", () => {
	const sharedGraph = buildLargeGraph();
	// prime the cache
	buildPackageTraceReport(sharedGraph, "react");
	buildNodeTraceReport(sharedGraph, "src/routes");
	buildNodeTraceReport(sharedGraph, "src/routes/module-0.ts");

	bench("buildPackageTraceReport • react (cache hit)", () => {
		buildPackageTraceReport(sharedGraph, "react");
	});

	bench("buildNodeTraceReport • src/routes (cache hit)", () => {
		buildNodeTraceReport(sharedGraph, "src/routes");
	});

	bench("buildNodeTraceReport • specific node (cache hit)", () => {
		buildNodeTraceReport(sharedGraph, "src/routes/module-0.ts");
	});
});
