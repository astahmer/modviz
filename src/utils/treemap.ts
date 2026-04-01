import type { VizNode } from "../../mod/types";
import { getExternalPackageName, getNodeScope } from "~/utils/modviz-data";

export type TreemapNodeKind = "root" | "scope" | "package" | "folder" | "module";

export interface TreemapTreeNode {
	id: string;
	label: string;
	kind: TreemapNodeKind;
	color: string;
	parentId: string | null;
	children: TreemapTreeNode[];
	size: number;
	moduleCount: number;
	totalIncoming: number;
	totalOutgoing: number;
	totalNamedImports: number;
	sourceNode?: VizNode;
	sourcePath?: string;
}

export interface TreemapRectangle {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	node: TreemapTreeNode;
}

export interface TreemapModel {
	root: TreemapTreeNode;
	nodesById: Map<string, TreemapTreeNode>;
}

const ROOT_COLOR = "#94a3b8";

const createTreeNode = (
	id: string,
	label: string,
	kind: TreemapNodeKind,
	parentId: string | null,
	color = ROOT_COLOR,
): TreemapTreeNode => ({
	id,
	label,
	kind,
	color,
	parentId,
	children: [],
	size: 0,
	moduleCount: 0,
	totalIncoming: 0,
	totalOutgoing: 0,
	totalNamedImports: 0,
});

const getModuleWeight = (node: VizNode) =>
	Math.max(1, node.importees.length + node.importedBy.length);

const getNodeColor = (node: VizNode, colorMap: Map<string, string>) => {
	const colorKey = node.cluster ?? node.package?.name ?? node.type ?? node.path;
	return colorMap.get(colorKey) ?? ROOT_COLOR;
};

const getWorkspaceSegments = (node: VizNode) => {
	const segments = node.path.split(/[\\/]/).filter(Boolean);
	return segments.length > 0 ? segments : [node.name];
};

const getExternalSegments = (node: VizNode, packageName: string) => {
	const segments = node.path.split(/[\\/]/).filter(Boolean);
	const nodeModulesIndex = segments.lastIndexOf("node_modules");
	if (nodeModulesIndex === -1) {
		return [packageName, ...segments];
	}

	const scopeOrName = segments[nodeModulesIndex + 1];
	const isScoped = Boolean(scopeOrName?.startsWith("@"));
	const rest = segments.slice(nodeModulesIndex + (isScoped ? 3 : 2));
	return rest.length > 0 ? [packageName, ...rest] : [packageName, node.name];
};

const ensureChild = (
	parent: TreemapTreeNode,
	nodesById: Map<string, TreemapTreeNode>,
	id: string,
	label: string,
	kind: TreemapNodeKind,
	color: string,
) => {
	const existing = nodesById.get(id);
	if (existing) return existing;

	const child = createTreeNode(id, label, kind, parent.id, color);
	parent.children.push(child);
	nodesById.set(id, child);
	return child;
};

const aggregateTree = (node: TreemapTreeNode): TreemapTreeNode => {
	if (node.kind === "module" && node.sourceNode) {
		node.size = getModuleWeight(node.sourceNode);
		node.moduleCount = 1;
		node.totalIncoming = node.sourceNode.importedBy.length;
		node.totalOutgoing = node.sourceNode.importees.length;
		node.totalNamedImports = node.sourceNode.imports.length;
		return node;
	}

	for (const child of node.children) {
		aggregateTree(child);
		node.size += child.size;
		node.moduleCount += child.moduleCount;
		node.totalIncoming += child.totalIncoming;
		node.totalOutgoing += child.totalOutgoing;
		node.totalNamedImports += child.totalNamedImports;
	}

	node.children.sort(
		(left, right) => right.size - left.size || left.label.localeCompare(right.label),
	);
	if (node.children[0]) {
		node.color = node.children[0].color;
	}

	return node;
};

export const buildTreemapModel = (
	nodes: VizNode[],
	workspacePackageNames: Set<string>,
	colorMap: Map<string, string>,
): TreemapModel => {
	const root = createTreeNode("root", "All Modules", "root", null, ROOT_COLOR);
	const nodesById = new Map<string, TreemapTreeNode>([[root.id, root]]);

	const workspaceRoot = createTreeNode(
		"scope:workspace",
		"Workspace",
		"scope",
		root.id,
		"#2563eb",
	);
	const externalRoot = createTreeNode(
		"scope:external",
		"External",
		"scope",
		root.id,
		"#0f766e",
	);

	root.children.push(workspaceRoot, externalRoot);
	nodesById.set(workspaceRoot.id, workspaceRoot);
	nodesById.set(externalRoot.id, externalRoot);

	for (const node of nodes) {
		const scope = getNodeScope(node, workspacePackageNames);
		const parentRoot = scope === "workspace" ? workspaceRoot : externalRoot;
		const packageName = scope === "external" ? getExternalPackageName(node) : null;
		const segments = scope === "workspace"
			? getWorkspaceSegments(node)
			: getExternalSegments(node, packageName ?? "external");
		const groupSegments = segments.slice(0, -1);
		const leafLabel = segments.at(-1) ?? node.name;
		const color = getNodeColor(node, colorMap);

		let currentParent = parentRoot;
		const keyParts: string[] = [scope];
		for (const [index, segment] of groupSegments.entries()) {
			keyParts.push(segment);
			const isPackage = scope === "external" && index === 0;
			const groupKind: TreemapNodeKind = isPackage ? "package" : "folder";
			const id = `${groupKind}:${keyParts.join("/")}`;
			currentParent = ensureChild(
				currentParent,
				nodesById,
				id,
				segment,
				groupKind,
				color,
			);
		}

		const leafId = `module:${node.path}`;
		const leaf = ensureChild(
			currentParent,
			nodesById,
			leafId,
			leafLabel,
			"module",
			color,
		);
		leaf.sourceNode = node;
		leaf.sourcePath = node.path;
	}

	aggregateTree(root);
	root.children = root.children.filter((child) => child.moduleCount > 0);
	return { root, nodesById };
};

export const getTreemapAncestors = (
	node: TreemapTreeNode,
	nodesById: Map<string, TreemapTreeNode>,
) => {
	const ancestors: TreemapTreeNode[] = [];
	let current: TreemapTreeNode | undefined = node;
	while (current) {
		ancestors.unshift(current);
		current = current.parentId ? nodesById.get(current.parentId) : undefined;
	}
	return ancestors;
};

export const collectTreemapModules = (node: TreemapTreeNode): TreemapTreeNode[] => {
	if (node.kind === "module") return [node];
	return node.children.flatMap((child) => collectTreemapModules(child));
};

const partitionTreemap = (
	nodes: TreemapTreeNode[],
	x: number,
	y: number,
	width: number,
	height: number,
): TreemapRectangle[] => {
	if (nodes.length === 0 || width <= 0 || height <= 0) {
		return [];
	}

	if (nodes.length === 1) {
		return [
			{
				id: nodes[0].id,
				x,
				y,
				width,
				height,
				node: nodes[0],
			},
		];
	}

	const total = nodes.reduce((sum, node) => sum + node.size, 0);
	if (total <= 0) return [];

	let splitIndex = 1;
	let firstGroupSize = nodes[0].size;
	while (splitIndex < nodes.length - 1 && firstGroupSize < total / 2) {
		firstGroupSize += nodes[splitIndex].size;
		splitIndex += 1;
	}

	const firstGroup = nodes.slice(0, splitIndex);
	const secondGroup = nodes.slice(splitIndex);
	if (secondGroup.length === 0) {
		return nodes.map((node, index) => ({
			id: node.id,
			x: width >= height ? x + (width / nodes.length) * index : x,
			y: width >= height ? y : y + (height / nodes.length) * index,
			width: width >= height ? width / nodes.length : width,
			height: width >= height ? height : height / nodes.length,
			node,
		}));
	}

	if (width >= height) {
		const firstWidth = width * (firstGroupSize / total);
		return [
			...partitionTreemap(firstGroup, x, y, firstWidth, height),
			...partitionTreemap(secondGroup, x + firstWidth, y, width - firstWidth, height),
		];
	}

	const firstHeight = height * (firstGroupSize / total);
	return [
		...partitionTreemap(firstGroup, x, y, width, firstHeight),
		...partitionTreemap(secondGroup, x, y + firstHeight, width, height - firstHeight),
	];
};

export const layoutTreemap = (
	nodes: TreemapTreeNode[],
	x: number,
	y: number,
	width: number,
	height: number,
) => partitionTreemap([...nodes].sort((left, right) => right.size - left.size), x, y, width, height);