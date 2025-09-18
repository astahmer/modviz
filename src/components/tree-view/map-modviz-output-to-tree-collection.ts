import { createTreeCollection } from "@ark-ui/react/tree-view";
import type { ModvizOutput } from "../../../mod/types";

export interface TreeNodeData {
	id: string;
	name: string;
	children: TreeNodeData[];
	isBarrel: boolean;
}

export function mapModvizOutputToImporteesTreeCollection(
	output: ModvizOutput,
	entryNodeId: string,
) {
	const entryNode = output.nodes.find((node) => node.path === entryNodeId);
	if (!entryNode) return null;

	const rootNode: TreeNodeData = {
		id: entryNodeId,
		name: entryNode.name,
		children: [],
		isBarrel: entryNode.isBarrelFile,
	};

	const allVisited = new Set<string>();
	const stack = [
		{
			nodePath: entryNodeId,
			parent: rootNode,
			visited: new Set([entryNodeId]),
		},
	];
	const root = stack[0].parent;

	while (stack.length > 0) {
		const { nodePath, parent, visited } = stack.pop()!;
		allVisited.add(nodePath);

		const node = output.nodes.find((node) => node.path === nodePath);
		if (!node) continue;

		const currentTreeNode: TreeNodeData = {
			id: node.path,
			name: node.path.split("/").slice(-2).join("/"),
			children: [],
			isBarrel: entryNode.isBarrelFile,
		};

		if (parent.children) {
			parent.children.push(currentTreeNode);
		}

		node.importees.forEach((importee) => {
			if (visited.has(importee)) {
				const importeeNode = output.nodes.find(
					(node) => node.path === importee,
				);
				if (!importeeNode) return;

				const importeeTreeNode: TreeNodeData = {
					id: importeeNode.path,
					name: importeeNode.path.split("/").slice(-2).join("/"),
					children: [],
					isBarrel: entryNode.isBarrelFile,
				};
				currentTreeNode.children.push(importeeTreeNode);
				return;
			}
			visited.add(importee);

			stack.push({
				nodePath: importee,
				parent: currentTreeNode,
				visited: new Set([...visited, importee]),
			});
		});
	}

	const collection = createTreeCollection<TreeNodeData>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: root,
	});

	return { visited: allVisited, collection };
}

export type ImportsChainDirection =
	| "from-entrypoint-to-current-node"
	| "from-current-node-to-entrypoint";

export function mapModvizOutputToImportsChainTreeCollection(
	output: ModvizOutput,
	currentNodeId: string,
	direction: ImportsChainDirection = "from-current-node-to-entrypoint",
) {
	const entryNode = output.nodes.find((node) => node.path === currentNodeId);
	if (!entryNode) return null;

	const chain = entryNode.chain.at(0) ?? [];
	const importChain =
		direction === "from-entrypoint-to-current-node" ? chain : chain.reverse();
	const rootId = importChain[0];
	if (!rootId) return null;

	const root = output.nodes.find((node) => node.path === rootId);
	if (!root) return null;

	const rootNode: TreeNodeData = {
		id: rootId,
		name: root.path.split("/").slice(-2).join("/"),
		children: [],
		isBarrel: entryNode.isBarrelFile,
	};
	let currentParent = rootNode;
	for (const nodePath of importChain) {
		const node = output.nodes.find((node) => node.path === nodePath);
		if (!node) continue;

		const treeNode: TreeNodeData = {
			id: node.path,
			name: node.path.split("/").slice(-2).join("/"),
			children: [],
			isBarrel: entryNode.isBarrelFile,
		};
		currentParent.children.push(treeNode);
		currentParent = treeNode;
	}

	const collection = createTreeCollection<TreeNodeData>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: rootNode,
	});

	return collection;
}
