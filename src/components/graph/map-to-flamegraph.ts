import type { ModvizOutput, VizNode } from "../../../mod/types";

interface NanovisTreeNode {
	id: string;
	text: string;
	subtext: string | undefined;
	sizeSelf?: number;
	size?: number;
	children: NanovisTreeNode[];
	meta: {
		path: string;
		type?: string;
		package?: string;
		importees: string[];
		imports: number;
		exports: number;
		originalNode: VizNode;
	};
}

export type FlamegraphBuildOptions = {
	includeExternal?: boolean;
	maxChildren?: number;
	maxDepth?: number;
};

// Convert ModvizOutput to hierarchical data compatible with nanovis
export function convertToNanovisHierarchyData(
	output: ModvizOutput,
	entryNodeId: string,
	options: FlamegraphBuildOptions = {},
): NanovisTreeNode {
	const maxDepth = options.maxDepth ?? 6;
	const maxChildren = options.maxChildren ?? 24;
	const includeExternal = options.includeExternal ?? true;
	const entryNode = output.nodes.find((node) => node.path === entryNodeId);

	const nodeMap = new Map<string, NanovisTreeNode>();
	output.nodes.forEach((node) => {
		nodeMap.set(node.path, {
			id: node.path,
			text: node.path.split("/").slice(-2).join("/"),
			subtext: node.package?.name,
			sizeSelf: node.importees.length + 1,
			children: [],
			meta: {
				path: node.path,
				type: node.type,
				package: node.package?.name,
				importees: node.importees,
				imports: node.imports.length,
				exports: node.exports.length,
				originalNode: node,
			},
		});
	});

	if (!entryNode) {
		return {
			id: "module-graph-root",
			text: "Module Graph",
			subtext: "No entrypoints found",
			sizeSelf: 1,
			children: [],
			meta: {
				path: "",
				importees: [],
				imports: 0,
				exports: 0,
				originalNode: {} as VizNode,
			},
		} as NanovisTreeNode;
	}

	const rootNode: NanovisTreeNode = Object.assign({}, nodeMap.get(entryNodeId)!, { children: [] });
	const allVisited = new Set<string>();
	const stack = [
		{
			depth: 0,
			nodePath: entryNodeId,
			parent: rootNode,
			visited: new Set([entryNodeId]),
		},
	];

	let stackSize = 0;
	const childrenMap = new Map<string, NanovisTreeNode[]>();
	while (stack.length > 0) {
		stackSize++;
		const { depth, nodePath, parent, visited } = stack.pop()!;
		const wasAlreadyVisited = allVisited.has(nodePath);
		allVisited.add(nodePath);

		const node = nodeMap.get(nodePath)!;
		if (!node) continue;

		const currentTreeNode: NanovisTreeNode = Object.assign({}, node, {
			children: wasAlreadyVisited ? childrenMap.get(nodePath) : [],
		});

		!wasAlreadyVisited && childrenMap.set(nodePath, currentTreeNode.children);

		if (parent.children) {
			parent.children.push(currentTreeNode);
		}

		if (wasAlreadyVisited) continue;
		if (depth >= maxDepth) continue;

		const importees = currentTreeNode.meta.importees
			.filter((importee) => includeExternal || !importee.includes("node_modules"))
			.sort((left, right) => {
				const leftNode = nodeMap.get(left);
				const rightNode = nodeMap.get(right);
				return (rightNode?.meta.importees.length ?? 0) - (leftNode?.meta.importees.length ?? 0);
			});

		const visibleImportees = importees.slice(0, maxChildren);
		visibleImportees.forEach((importee) => {
			if (visited.has(importee)) {
				const importeeNode = nodeMap.get(importee)!;
				if (!importeeNode) return;

				const importeeTreeNode: NanovisTreeNode = Object.assign(
					{},
					importeeNode,
					// prevent circular references
					{ children: [] },
				);
				currentTreeNode.children.push(importeeTreeNode);
				return;
			}
			visited.add(importee);

			stack.push({
				depth: depth + 1,
				nodePath: importee,
				parent: currentTreeNode,
				visited: new Set([...visited, importee]),
			});
		});

		if (importees.length > visibleImportees.length) {
			currentTreeNode.children.push({
				id: `${nodePath}#truncated`,
				text: `… ${importees.length - visibleImportees.length} more`,
				subtext: "pruned",
				sizeSelf: 1,
				children: [],
				meta: {
					path: `${nodePath}#truncated`,
					importees: [],
					imports: 0,
					exports: 0,
					originalNode: currentTreeNode.meta.originalNode,
				},
			});
		}
	}

	return rootNode;
}
