import type { ModvizLlmOutput, ModvizOutput, VizNode } from "../../mod/types";

export type ModvizScope = "all" | "workspace" | "external";
export type ExternalGroupingMode = "combined" | "package";

export type SummaryListItem = {
	label: string;
	path: string;
	value: number;
	description?: string;
};

export type ModvizDerivedSummary = {
	overview: {
		totalNodes: number;
		workspaceNodes: number;
		externalNodes: number;
		barrelFiles: number;
		entrypoints: number;
		workspacePackages: number;
		externalPackages: number;
	};
	hotspots: SummaryListItem[];
	topImportedBy: SummaryListItem[];
	topImporters: SummaryListItem[];
	topClusters: SummaryListItem[];
	topExternalPackages: SummaryListItem[];
	hasLlm: boolean;
};

export type ModvizDataBundle = {
	graph: ModvizOutput;
	llm: ModvizLlmOutput | null;
	projectTitle: string | null;
	summary: ModvizDerivedSummary;
};

export type ModvizJsonStatus = {
	exists: boolean;
	graphPath: string;
	hasLlm: boolean;
	lastModified: number | null;
	llmPath: string;
};

export const isExternalNode = (
	node: VizNode,
	workspacePackageNames: Set<string>,
) => {
	if (node.path.includes("node_modules")) return true;
	if (!node.package?.name) return false;
	return !workspacePackageNames.has(node.package.name);
};

export const getWorkspacePackageNames = (graph: ModvizOutput) =>
	new Set(graph.metadata.packages.map((pkg) => pkg.name));

export const getNodeScope = (
	node: VizNode,
	workspacePackageNames: Set<string>,
): Exclude<ModvizScope, "all"> =>
	isExternalNode(node, workspacePackageNames) ? "external" : "workspace";

export const getExternalPackageName = (node: VizNode) => {
	if (!node.path.includes("node_modules")) {
		return node.package?.name ?? "external";
	}

	if (node.package?.name && node.package.name !== "node_modules") {
		return node.package.name;
	}

	const segments = node.path.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return "node_modules";
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const maybeName = segments[nodeModulesIndex + 2];

	if (!scopeOrName) {
		return "node_modules";
	}

	return scopeOrName.startsWith("@") && maybeName
		? `${scopeOrName}/${maybeName}`
		: scopeOrName;
};

export const getNodeGroupingLabel = (
	node: VizNode,
	workspacePackageNames: Set<string>,
	externalGrouping: ExternalGroupingMode,
) => {
	if (getNodeScope(node, workspacePackageNames) === "external") {
		return externalGrouping === "package"
			? getExternalPackageName(node)
			: "node_modules";
	}

	return node.cluster ?? node.package?.name ?? "workspace";
};

export const filterNodesByScope = (
	nodes: VizNode[],
	workspacePackageNames: Set<string>,
	scope: ModvizScope,
) => {
	if (scope === "all") {
		return nodes;
	}

	return nodes.filter(
		(node) => getNodeScope(node, workspacePackageNames) === scope,
	);
};

const countBy = <T, K extends string>(items: T[], getKey: (item: T) => K | null) => {
	const counts = new Map<K, number>();
	for (const item of items) {
		const key = getKey(item);
		if (!key) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
};

const sortSummaryItems = (items: SummaryListItem[]) =>
	items
		.sort((left, right) => {
			const valueOrder = right.value - left.value;
			return valueOrder !== 0
				? valueOrder
				: left.label.localeCompare(right.label);
		})
		.slice(0, 8);

const buildReachableCountByPath = (nodes: VizNode[]) => {
	const adjacency = new Map(nodes.map((node) => [node.path, node.importees]));
	const reachableCountByPath = new Map<string, number>();

	for (const node of nodes) {
		const visited = new Set<string>();
		const stack = [...node.importees];

		while (stack.length > 0) {
			const nextPath = stack.pop();
			if (!nextPath || visited.has(nextPath)) {
				continue;
			}

			visited.add(nextPath);
			const importees = adjacency.get(nextPath);
			if (!importees) {
				continue;
			}

			for (const importeePath of importees) {
				if (importeePath !== node.path && !visited.has(importeePath)) {
					stack.push(importeePath);
				}
			}
		}

		reachableCountByPath.set(node.path, visited.size);
	}

	return reachableCountByPath;
};

export const buildModvizSummary = (
	graph: ModvizOutput,
	llm: ModvizLlmOutput | null,
): ModvizDerivedSummary => {
	const workspacePackageNames = new Set(
		graph.metadata.packages.map((pkg) => pkg.name),
	);
	const externalNodes = graph.nodes.filter((node) =>
		isExternalNode(node, workspacePackageNames),
	);
	const workspaceNodes = graph.nodes.filter(
		(node) => !isExternalNode(node, workspacePackageNames),
	);
	const externalPackageCounts = countBy(externalNodes, (node) =>
		getExternalPackageName(node),
	);
	const reachableCountByPath = buildReachableCountByPath(graph.nodes);
	const clusterCounts = countBy(graph.nodes, (node) => {
		return node.cluster ?? node.package?.name ?? node.type ?? "unclassified";
	});

	const topImportedBy = sortSummaryItems(
		[...graph.nodes].map((node) => ({
			label: node.name,
			path: node.path,
			value: node.importedBy.length,
			description: `${node.importees.length} outgoing imports`,
		})),
	);
	const topImporters = sortSummaryItems(
		[...graph.nodes].map((node) => ({
			label: node.name,
			path: node.path,
			value: node.importees.length,
			description: `${node.importedBy.length} inbound imports`,
		})),
	);
	const topClusters = sortSummaryItems(
		Array.from(clusterCounts.entries()).map(([label, value]) => ({
			label,
			path: label,
			value,
		})),
	);
	const topExternalPackages = sortSummaryItems(
		Array.from(externalPackageCounts.entries()).map(([label, value]) => ({
			label,
			path: label,
			value,
		})),
	);

	const hotspots = llm
		? sortSummaryItems(
				llm.summary.topHotspots.map((hotspot) => ({
					label: hotspot.displayPath,
					path: hotspot.path,
					value: hotspot.reachableModulesCount,
					description: `${hotspot.reachableModulesCount} transitive imports • ${hotspot.directImporterCount} direct importers`,
				})),
			)
		: sortSummaryItems(
				[...graph.nodes].map((node) => ({
					label: node.name,
					path: node.path,
					value: reachableCountByPath.get(node.path) ?? 0,
					description: `${reachableCountByPath.get(node.path) ?? 0} transitive imports • ${node.importees.length} direct imports • ${node.importedBy.length} inbound imports`,
				})),
			);

	return {
		overview: {
			totalNodes: graph.nodes.length,
			workspaceNodes: workspaceNodes.length,
			externalNodes: externalNodes.length,
			barrelFiles: graph.nodes.filter((node) => node.isBarrelFile).length,
			entrypoints: graph.metadata.entrypoints.length,
			workspacePackages: graph.metadata.packages.length,
			externalPackages: externalPackageCounts.size,
		},
		hotspots,
		topImportedBy,
		topImporters,
		topClusters,
		topExternalPackages,
		hasLlm: Boolean(llm),
	};
};

const readErrorMessage = async (response: Response) => {
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const body = (await response.json().catch(() => null)) as
			| { error?: string }
			| null;
		if (body?.error) {
			return body.error;
		}
	}

	return (await response.text().catch(() => "")) || response.statusText;
};

const fetchJson = async <T>(pathname: string): Promise<T> => {
	const response = await fetch(pathname, {
		cache: "no-store",
		headers: {
			accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response));
	}

	return (await response.json()) as T;
};

export const fetchModvizBundle = () =>
	fetchJson<ModvizDataBundle>("/api/modviz-bundle");

export const fetchModvizJsonStatus = () =>
	fetchJson<ModvizJsonStatus>("/api/json-status");
