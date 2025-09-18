import { createTreeCollection } from "@ark-ui/react/tree-view";
import type { ModvizOutput } from "../../../mod/types";

export interface TreeNodeData {
	id: string;
	name: string;
	children: TreeNodeData[];
}

export function mapModvizOutputToTreeCollection(
	output: ModvizOutput,
	entryNodeId: string,
) {
	const entryNode = output.nodes.find((node) => node.path === entryNodeId);
	if (!entryNode) return null;

	const rootNode: TreeNodeData = {
		id: entryNodeId,
		name: entryNode.name,
		children: [],
	};

	const stack = [{ nodePath: entryNodeId, parent: rootNode }];
	const root = stack[0].parent;

	const visited = new Set<string>();

	while (stack.length > 0) {
		const { nodePath, parent } = stack.pop()!;

		if (visited.has(nodePath)) continue;
		visited.add(nodePath);

		const node = output.nodes.find((node) => node.path === nodePath);

		if (!node) continue;

		const currentTreeNode: TreeNodeData = {
			id: node.path,
			name: node.name,
			children: [],
		};

		if (parent.children) {
			parent.children.push(currentTreeNode);
		}

		stack.push(
			...node.importees.map((importee) => ({
				nodePath: importee,
				parent: currentTreeNode,
			})),
		);
	}

	return createTreeCollection<TreeNodeData>({
		nodeToValue: (node) => node.id,
		nodeToString: (node) => node.name,
		rootNode: root,
	});
}
