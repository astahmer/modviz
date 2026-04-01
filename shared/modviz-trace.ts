import type { ModvizOutput, VizNode } from "../mod/types.ts";

export interface ModvizTraceMatch {
	path: string;
	label: string;
	packageName: string | null;
	type: string;
	targetPaths: string[];
	directImporters: string[];
	chains: string[][];
	workspaceOrigins: string[];
	introducedThrough: string[];
}

export interface ModvizTraceReport {
	kind: "package" | "node";
	query: string;
	matchedLabels: string[];
	matches: ModvizTraceMatch[];
	totalChains: number;
}

export interface ModvizTraceBuildOptions {
	maxChainsPerTarget?: number;
	maxDepth?: number;
	maxNodeMatches?: number;
	maxNodesPerPackage?: number;
}

const chainCache = new WeakMap<ModvizOutput, Map<string, string[][]>>();
const packageReportCache = new WeakMap<ModvizOutput, Map<string, ModvizTraceReport>>();
const nodeReportCache = new WeakMap<ModvizOutput, Map<string, ModvizTraceReport>>();

const normalizeForSearch = (value: string) => value.trim().toLowerCase();

const isExternalPath = (value: string) => value.includes("node_modules");

const uniqueSorted = (values: Iterable<string>) =>
	Array.from(new Set(values))
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));

export const getTracePackageName = (node: VizNode) => {
	if (!node.path.includes("node_modules")) {
		return node.package?.name ?? null;
	}

	if (node.package?.name && node.package.name !== "node_modules") {
		return node.package.name;
	}

	const segments = node.path.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return null;
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const maybeName = segments[nodeModulesIndex + 2];
	if (!scopeOrName) {
		return null;
	}

	return scopeOrName.startsWith("@") && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName;
};

const uniqueChains = (chains: string[][]) => {
	const seen = new Set<string>();
	const nextChains: string[][] = [];

	for (const chain of chains) {
		const key = chain.join(" -> ");
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		nextChains.push(chain);
	}

	return nextChains.sort((left, right) => {
		const byLength = left.length - right.length;
		return byLength !== 0 ? byLength : left.join("/").localeCompare(right.join("/"));
	});
};

const buildUpstreamChains = (
	graph: ModvizOutput,
	targetPath: string,
	maxChains = 40,
	maxDepth = 28,
) => {
	const cacheKey = `${targetPath}::${maxChains}::${maxDepth}`;
	const cachedGraphChains = chainCache.get(graph);
	if (cachedGraphChains?.has(cacheKey)) {
		return cachedGraphChains.get(cacheKey)!;
	}

	const nodeByPath = new Map(graph.nodes.map((node) => [node.path, node]));
	const entrypoints = new Set(graph.metadata.entrypoints);
	const results: string[][] = [];
	const queue: string[][] = [[targetPath]];
	let queueIndex = 0;

	while (queueIndex < queue.length && results.length < maxChains) {
		const reverseChain = queue[queueIndex];
		queueIndex += 1;
		if (!reverseChain) {
			continue;
		}

		const currentPath = reverseChain[0];
		const currentNode = nodeByPath.get(currentPath);
		const importers = uniqueSorted(
			(currentNode?.importedBy ?? []).filter(
				(importerPath) => !reverseChain.includes(importerPath) && nodeByPath.has(importerPath),
			),
		);

		if (
			!currentNode ||
			importers.length === 0 ||
			entrypoints.has(currentPath) ||
			reverseChain.length >= maxDepth
		) {
			results.push([...reverseChain].reverse());
			continue;
		}

		importers
			.sort((left, right) => {
				const leftExternal = isExternalPath(left);
				const rightExternal = isExternalPath(right);
				if (leftExternal !== rightExternal) {
					return leftExternal ? 1 : -1;
				}

				return left.localeCompare(right);
			})
			.forEach((importerPath) => {
				queue.push([importerPath, ...reverseChain]);
			});
	}

	const resolvedChains = uniqueChains(results);
	const nextCache = cachedGraphChains ?? new Map<string, string[][]>();
	nextCache.set(cacheKey, resolvedChains);
	if (!cachedGraphChains) {
		chainCache.set(graph, nextCache);
	}

	return resolvedChains;
};

const getWorkspaceOrigin = (chain: string[]) =>
	chain.find((segment) => !isExternalPath(segment)) ?? chain[0] ?? null;

const getIntroducedThrough = (chain: string[]) => {
	for (let index = 0; index < chain.length; index += 1) {
		if (!isExternalPath(chain[index])) {
			continue;
		}

		return chain[index - 1] ?? chain[index] ?? null;
	}

	return chain.at(-1) ?? null;
};

const createTraceMatch = (node: VizNode, chains: string[][]): ModvizTraceMatch => ({
	path: node.path,
	label: node.name,
	packageName: getTracePackageName(node),
	type: node.type,
	targetPaths: [node.path],
	directImporters: uniqueSorted(node.importedBy),
	chains,
	workspaceOrigins: uniqueSorted(
		chains.map((chain) => getWorkspaceOrigin(chain)).filter(Boolean) as string[],
	),
	introducedThrough: uniqueSorted(
		chains.map((chain) => getIntroducedThrough(chain)).filter(Boolean) as string[],
	),
});

export const buildPackageTraceReport = (
	graph: ModvizOutput,
	packageQuery: string,
	options: ModvizTraceBuildOptions = {},
): ModvizTraceReport => {
	const {
		maxChainsPerTarget = 40,
		maxDepth = 28,
		maxNodesPerPackage = Number.POSITIVE_INFINITY,
	} = options;
	const cacheSuffix = `::${maxChainsPerTarget}::${maxDepth}::${maxNodesPerPackage}`;
	const normalizedQuery = normalizeForSearch(packageQuery);
	const cacheKey = `${normalizedQuery}${cacheSuffix}`;
	const cachedReports = packageReportCache.get(graph);
	if (cachedReports?.has(cacheKey)) {
		return cachedReports.get(cacheKey)!;
	}

	const groupedMatches = new Map<string, ModvizTraceMatch>();
	const tracedNodeCountByPackage = new Map<string, number>();

	graph.nodes
		.filter((node) => node.path.includes("node_modules"))
		.filter((node) => {
			const packageName = getTracePackageName(node);
			return packageName ? normalizeForSearch(packageName).includes(normalizedQuery) : false;
		})
		.forEach((node) => {
			const packageName = getTracePackageName(node) ?? node.path;
			const tracedCount = tracedNodeCountByPackage.get(packageName) ?? 0;
			const canTraceNode = tracedCount < maxNodesPerPackage;
			const chains = canTraceNode
				? buildUpstreamChains(graph, node.path, maxChainsPerTarget, maxDepth)
				: [];
			if (canTraceNode) {
				tracedNodeCountByPackage.set(packageName, tracedCount + 1);
			}
			const existing = groupedMatches.get(packageName);

			if (!existing) {
				groupedMatches.set(packageName, {
					path: packageName,
					label: packageName,
					packageName,
					type: "package",
					targetPaths: [node.path],
					directImporters: uniqueSorted(node.importedBy),
					chains,
					workspaceOrigins: uniqueSorted(
						chains.map((chain) => getWorkspaceOrigin(chain)).filter(Boolean) as string[],
					),
					introducedThrough: uniqueSorted(
						chains.map((chain) => getIntroducedThrough(chain)).filter(Boolean) as string[],
					),
				});
				return;
			}

			existing.targetPaths = uniqueSorted([...existing.targetPaths, node.path]);
			existing.directImporters = uniqueSorted([...existing.directImporters, ...node.importedBy]);
			existing.chains = uniqueChains([...existing.chains, ...chains]);
			existing.workspaceOrigins = uniqueSorted([
				...existing.workspaceOrigins,
				...(chains.map((chain) => getWorkspaceOrigin(chain)).filter(Boolean) as string[]),
			]);
			existing.introducedThrough = uniqueSorted([
				...existing.introducedThrough,
				...(chains.map((chain) => getIntroducedThrough(chain)).filter(Boolean) as string[]),
			]);
		});

	const matches = Array.from(groupedMatches.values()).sort((left, right) =>
		left.label.localeCompare(right.label),
	);

	const report: ModvizTraceReport = {
		kind: "package",
		query: packageQuery,
		matchedLabels: Array.from(
			new Set(matches.map((match) => match.packageName).filter(Boolean) as string[]),
		).sort((left, right) => left.localeCompare(right)),
		matches,
		totalChains: matches.reduce((sum, match) => sum + match.chains.length, 0),
	};

	const nextCache = cachedReports ?? new Map<string, ModvizTraceReport>();
	nextCache.set(cacheKey, report);
	if (!cachedReports) {
		packageReportCache.set(graph, nextCache);
	}

	return report;
};

export const buildNodeTraceReport = (
	graph: ModvizOutput,
	nodeQuery: string,
	options: ModvizTraceBuildOptions = {},
): ModvizTraceReport => {
	const {
		maxChainsPerTarget = 40,
		maxDepth = 28,
		maxNodeMatches = Number.POSITIVE_INFINITY,
	} = options;
	const cacheSuffix = `::${maxChainsPerTarget}::${maxDepth}::${maxNodeMatches}`;
	const normalizedQuery = normalizeForSearch(nodeQuery);
	const cacheKey = `${normalizedQuery}${cacheSuffix}`;
	const cachedReports = nodeReportCache.get(graph);
	if (cachedReports?.has(cacheKey)) {
		return cachedReports.get(cacheKey)!;
	}

	const matches = graph.nodes
		.filter((node) => {
			return [node.path, node.name, node.package?.name, node.cluster]
				.filter(Boolean)
				.some((value) => normalizeForSearch(String(value)).includes(normalizedQuery));
		})
		.slice(0, maxNodeMatches)
		.map((node) =>
			createTraceMatch(node, buildUpstreamChains(graph, node.path, maxChainsPerTarget, maxDepth)),
		);

	const report: ModvizTraceReport = {
		kind: "node",
		query: nodeQuery,
		matchedLabels: matches.map((match) => match.path),
		matches,
		totalChains: matches.reduce((sum, match) => sum + match.chains.length, 0),
	};

	const nextCache = cachedReports ?? new Map<string, ModvizTraceReport>();
	nextCache.set(cacheKey, report);
	if (!cachedReports) {
		nodeReportCache.set(graph, nextCache);
	}

	return report;
};

export const renderTraceReport = (report: ModvizTraceReport, limit = 10) => {
	const lines = [
		`${report.kind === "package" ? "Package" : "Node"} trace for: ${report.query}`,
		`Matched ${report.matches.length} node(s) across ${report.totalChains} origin chain(s).`,
		"",
	];

	if (report.matches.length === 0) {
		lines.push("No matching nodes were found.");
		return `${lines.join("\n")}\n`;
	}

	for (const match of report.matches.slice(0, limit)) {
		lines.push(`- ${match.path} (${match.type})`);
		if (match.packageName) {
			lines.push(`  Package: ${match.packageName}`);
		}
		lines.push(`  Matching files: ${match.targetPaths.length}`);
		lines.push(`  Workspace origins: ${match.workspaceOrigins.join(", ") || "none"}`);
		lines.push(`  Introduced through: ${match.introducedThrough.join(", ") || "none"}`);
		lines.push(`  Direct importers: ${match.directImporters.join(", ") || "none"}`);
		for (const chain of match.chains.slice(0, limit)) {
			lines.push(`  Chain: ${chain.join(" -> ")}`);
		}
		if (match.chains.length > limit) {
			lines.push(`  +${match.chains.length - limit} more chain(s)`);
		}
		lines.push("");
	}

	if (report.matches.length > limit) {
		lines.push(`+${report.matches.length - limit} more matching node(s)`);
	}

	return `${lines.join("\n").trimEnd()}\n`;
};
