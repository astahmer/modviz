import fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
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
	summary: ModvizDerivedSummary;
};

const getLlmOutputPath = async (graphPath: string) => {
	if (graphPath.endsWith(".llm.json")) return graphPath;
	const path = await import("node:path")
	const parsed = path.parse(graphPath);
	return path.join(parsed.dir, `${parsed.name}.llm.json`);
};

const readJsonFile = <T>(filePath: string): T =>
	JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;

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
					description: `${hotspot.directImporterCount} direct importers`,
				})),
			)
		: topImporters;

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

export const fetchModvizBundle = createServerFn().handler(async () => {
	const graphPath = import.meta.env.modvizPath;
	const graph = readJsonFile<ModvizOutput>(graphPath);
	const llmPath = await getLlmOutputPath(graphPath);
	const llm = fs.existsSync(llmPath)
		? readJsonFile<ModvizLlmOutput>(llmPath)
		: null;

	return {
		graph,
		llm,
		summary: buildModvizSummary(graph, llm),
	} satisfies ModvizDataBundle;
});
