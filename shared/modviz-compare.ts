import type { ModvizOutput } from "../mod/types.ts";

export type ChangedNodeSummary = {
	path: string;
	baselineIncoming: number;
	currentIncoming: number;
	baselineOutgoing: number;
	currentOutgoing: number;
	baselineImports: number;
	currentImports: number;
	deltaMagnitude: number;
};

export type ModvizGraphComparison = {
	baselineGeneratedAt: string | null;
	currentGeneratedAt: string | null;
	summary: {
		baselineEdges: number;
		baselineExternalPackages: number;
		baselineImportStatements: number;
		baselineNodes: number;
		baselineWorkspacePackages: number;
		currentEdges: number;
		currentExternalPackages: number;
		currentImportStatements: number;
		currentNodes: number;
		currentWorkspacePackages: number;
	};
	addedEdges: string[];
	addedExternalPackages: string[];
	addedNodes: string[];
	addedWorkspacePackages: string[];
	changedNodes: ChangedNodeSummary[];
	removedEdges: string[];
	removedExternalPackages: string[];
	removedNodes: string[];
	removedWorkspacePackages: string[];
};

const sortStrings = (values: Iterable<string>) =>
	Array.from(values).sort((left, right) => left.localeCompare(right));

const getEdgeSet = (graph: ModvizOutput) =>
	new Set(
		graph.nodes.flatMap((node) => node.importees.map((importee) => `${node.path} -> ${importee}`)),
	);

const getExternalPackageName = (nodePath: string, packageName?: string) => {
	if (!nodePath.includes("node_modules")) {
		return packageName ?? "external";
	}

	if (packageName && packageName !== "node_modules") {
		return packageName;
	}

	const segments = nodePath.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return "node_modules";
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const maybeName = segments[nodeModulesIndex + 2];
	if (!scopeOrName) {
		return "node_modules";
	}

	return scopeOrName.startsWith("@") && maybeName ? `${scopeOrName}/${maybeName}` : scopeOrName;
};

const getExternalPackageSet = (graph: ModvizOutput) =>
	new Set(
		graph.nodes
			.filter((node) => node.path.includes("node_modules"))
			.map((node) => getExternalPackageName(node.path, node.package?.name))
			.filter(Boolean),
	);

const getNodeMap = (graph: ModvizOutput) => new Map(graph.nodes.map((node) => [node.path, node]));

const setDifference = (left: Set<string>, right: Set<string>) => {
	const values = new Set<string>();
	for (const value of left) {
		if (!right.has(value)) {
			values.add(value);
		}
	}
	return values;
};

export const buildModvizGraphComparison = (
	baseline: ModvizOutput,
	current: ModvizOutput,
): ModvizGraphComparison => {
	const baselineNodes = getNodeMap(baseline);
	const currentNodes = getNodeMap(current);
	const baselineNodePaths = new Set(baselineNodes.keys());
	const currentNodePaths = new Set(currentNodes.keys());
	const baselineEdges = getEdgeSet(baseline);
	const currentEdges = getEdgeSet(current);
	const baselineWorkspacePackages = new Set(baseline.metadata.packages.map((pkg) => pkg.name));
	const currentWorkspacePackages = new Set(current.metadata.packages.map((pkg) => pkg.name));
	const baselineExternalPackages = getExternalPackageSet(baseline);
	const currentExternalPackages = getExternalPackageSet(current);

	const changedNodes: ChangedNodeSummary[] = [];
	for (const [nodePath, baselineNode] of baselineNodes.entries()) {
		const currentNode = currentNodes.get(nodePath);
		if (!currentNode) {
			continue;
		}

		const deltaMagnitude =
			Math.abs(currentNode.importedBy.length - baselineNode.importedBy.length) +
			Math.abs(currentNode.importees.length - baselineNode.importees.length) +
			Math.abs(currentNode.imports.length - baselineNode.imports.length);

		if (deltaMagnitude === 0) {
			continue;
		}

		changedNodes.push({
			path: nodePath,
			baselineIncoming: baselineNode.importedBy.length,
			currentIncoming: currentNode.importedBy.length,
			baselineOutgoing: baselineNode.importees.length,
			currentOutgoing: currentNode.importees.length,
			baselineImports: baselineNode.imports.length,
			currentImports: currentNode.imports.length,
			deltaMagnitude,
		});
	}

	changedNodes.sort(
		(left, right) =>
			right.deltaMagnitude - left.deltaMagnitude || left.path.localeCompare(right.path),
	);

	return {
		baselineGeneratedAt: baseline.metadata.generatedAt ?? null,
		currentGeneratedAt: current.metadata.generatedAt ?? null,
		summary: {
			baselineEdges: baselineEdges.size,
			baselineExternalPackages: baselineExternalPackages.size,
			baselineImportStatements: baseline.nodes.reduce((sum, node) => sum + node.imports.length, 0),
			baselineNodes: baseline.nodes.length,
			baselineWorkspacePackages: baselineWorkspacePackages.size,
			currentEdges: currentEdges.size,
			currentExternalPackages: currentExternalPackages.size,
			currentImportStatements: current.nodes.reduce((sum, node) => sum + node.imports.length, 0),
			currentNodes: current.nodes.length,
			currentWorkspacePackages: currentWorkspacePackages.size,
		},
		addedEdges: sortStrings(setDifference(currentEdges, baselineEdges)),
		addedExternalPackages: sortStrings(
			setDifference(currentExternalPackages, baselineExternalPackages),
		),
		addedNodes: sortStrings(setDifference(currentNodePaths, baselineNodePaths)),
		addedWorkspacePackages: sortStrings(
			setDifference(currentWorkspacePackages, baselineWorkspacePackages),
		),
		changedNodes,
		removedEdges: sortStrings(setDifference(baselineEdges, currentEdges)),
		removedExternalPackages: sortStrings(
			setDifference(baselineExternalPackages, currentExternalPackages),
		),
		removedNodes: sortStrings(setDifference(baselineNodePaths, currentNodePaths)),
		removedWorkspacePackages: sortStrings(
			setDifference(baselineWorkspacePackages, currentWorkspacePackages),
		),
	};
};

export const renderModvizGraphComparison = (
	comparison: ModvizGraphComparison,
	options: { limit?: number } = {},
) => {
	const limit = Number.isFinite(options.limit) ? Math.max(1, Math.trunc(options.limit ?? 10)) : 10;
	const changedNodes = comparison.changedNodes.slice(0, limit);

	return [
		"",
		"Graph diff",
		`- Nodes: ${comparison.summary.baselineNodes} -> ${comparison.summary.currentNodes} (${comparison.summary.currentNodes - comparison.summary.baselineNodes >= 0 ? "+" : ""}${comparison.summary.currentNodes - comparison.summary.baselineNodes})`,
		`- Edges: ${comparison.summary.baselineEdges} -> ${comparison.summary.currentEdges} (${comparison.summary.currentEdges - comparison.summary.baselineEdges >= 0 ? "+" : ""}${comparison.summary.currentEdges - comparison.summary.baselineEdges})`,
		`- Import statements: ${comparison.summary.baselineImportStatements} -> ${comparison.summary.currentImportStatements} (${comparison.summary.currentImportStatements - comparison.summary.baselineImportStatements >= 0 ? "+" : ""}${comparison.summary.currentImportStatements - comparison.summary.baselineImportStatements})`,
		`- Workspace packages: ${comparison.summary.baselineWorkspacePackages} -> ${comparison.summary.currentWorkspacePackages}`,
		`- External packages: ${comparison.summary.baselineExternalPackages} -> ${comparison.summary.currentExternalPackages}`,
		`- Added modules: ${comparison.addedNodes.length}`,
		`- Removed modules: ${comparison.removedNodes.length}`,
		`- Added edges: ${comparison.addedEdges.length}`,
		`- Removed edges: ${comparison.removedEdges.length}`,
		changedNodes.length > 0
			? [
				"",
				"Largest direct node deltas",
				...changedNodes.map(
					(node) =>
						`- ${node.path}: inbound ${node.baselineIncoming}->${node.currentIncoming}, outbound ${node.baselineOutgoing}->${node.currentOutgoing}, imports ${node.baselineImports}->${node.currentImports}`,
				),
			].join("\n")
			: "",
	].filter(Boolean).join("\n");
};
