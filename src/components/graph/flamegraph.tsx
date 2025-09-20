import { ResponsiveIcicle } from "@nivo/icicle";
import type { ModvizOutput, VizNode } from "../../../mod/types";

interface TreeNode {
	id: string;
	name: string;
	path: string;
	type?: string;
	package?: string;
	imports: number;
	exports: number;
	value?: number;
	children?: TreeNode[];
}

// Convert ModvizOutput to hierarchical data compatible with Nivo
function convertToNivoHierarchyData(modvizOutput: ModvizOutput): TreeNode {
	const nodesMap = new Map<string, VizNode>();
	const visitedPaths = new Set<string>();

	// First pass: create all nodes
	modvizOutput.nodes.forEach((node) => {
		nodesMap.set(node.path, node);
	});

	// Helper function to build tree recursively with cycle detection
	function buildTreeForNode(
		nodePath: string,
		ancestors: Set<string> = new Set(),
	): TreeNode | null {
		// Prevent infinite recursion by checking for cycles
		if (ancestors.has(nodePath) || visitedPaths.has(nodePath)) {
			return null;
		}

		const node = nodesMap.get(nodePath);
		if (!node) return null;

		// Mark this node as visited to prevent revisiting
		visitedPaths.add(nodePath);

		// Add current node to ancestors to detect immediate cycles
		const newAncestors = new Set([...ancestors, nodePath]);

		// Create a new node object to avoid circular references
		const treeNode: TreeNode = {
			id: node.path,
			name: node.name,
			path: node.path,
			type: node.type,
			package: node.package?.name,
			imports: node.imports.length,
			exports: node.exports.length,
			children: [],
		};

		// Add children (importees) recursively
		node.importees.forEach((importedPath) => {
			const childNode = buildTreeForNode(importedPath, newAncestors);
			if (childNode) {
				treeNode.children!.push(childNode);
			}
		});

		// Calculate value based on imports + exports + children count
		treeNode.value =
			treeNode.children!.length > 0
				? undefined // Let Nivo calculate from children
				: Math.max(1, treeNode.imports + treeNode.exports);

		return treeNode;
	}

	// Find entry points or root nodes
	const entryPoints = modvizOutput.metadata.entrypoints;
	const rootNodes: TreeNode[] = [];

	// Start with entry points if available
	if (entryPoints && entryPoints.length > 0) {
		entryPoints.forEach((entryPath) => {
			visitedPaths.clear(); // Reset for each entry point
			const rootNode = buildTreeForNode(entryPath);
			if (rootNode) {
				rootNodes.push(rootNode);
			}
		});
	}

	// If no entry points or no valid trees, find nodes that aren't imported by others
	if (rootNodes.length === 0) {
		const allImportedPaths = new Set<string>();
		modvizOutput.nodes.forEach((node) => {
			node.importees.forEach((path) => allImportedPaths.add(path));
		});

		modvizOutput.nodes.forEach((node) => {
			if (!allImportedPaths.has(node.path)) {
				visitedPaths.clear(); // Reset for each potential root
				const rootNode = buildTreeForNode(node.path);
				if (rootNode && rootNodes.length < 10) {
					// Limit to 10 root nodes
					rootNodes.push(rootNode);
				}
			}
		});
	}

	if (rootNodes.length === 1) {
		return rootNodes[0];
	}

	return {
		id: "module-graph-root",
		name: "Module Graph",
		path: "",
		imports: 0,
		exports: 0,
		children: rootNodes,
	};
}

export const FlamegraphControl = (props: { output: ModvizOutput }) => {
	const data = convertToNivoHierarchyData(props.output);

	return (
		<div className="relative w-full h-full min-h-0 flex flex-col">
			<div className="flex-1 min-h-0">
				<ResponsiveIcicle
					data={data}
					margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
					valueFormat=">-.0s"
					enableLabels={true}
					label={(node) => {
						const name = node.data.name || node.id;
						return name.length > 15 ? name.substring(0, 15) + "..." : name;
					}}
					labelSkipWidth={40}
					labelSkipHeight={20}
					labelTextColor={{
						from: "color",
						modifiers: [["darker", 1.8]],
					}}
					borderWidth={1}
					borderColor={{
						from: "color",
						modifiers: [["brighter", 0.5]],
					}}
					// colors={{ scheme: "nivo" }}
					tooltip={(node) => (
						<div className="bg-black bg-opacity-70 text-white p-3 rounded text-xs font-mono">
							<div className="font-bold mb-2" style={{ color: "#4CAF50" }}>
								{node.data.name || "root"}
							</div>
							{node.data.path && (
								<div className="text-xs mb-1" style={{ color: "#ddd" }}>
									{node.data.path}
								</div>
							)}
							<div className="mb-1">
								Value: <span style={{ color: "#FFD700" }}>{node.value}</span>
							</div>
							{node.data.type && (
								<div className="mb-1">
									Type:{" "}
									<span style={{ color: "#87CEEB" }}>{node.data.type}</span>
								</div>
							)}
							{node.data.package && (
								<div className="mb-1">
									Package:{" "}
									<span style={{ color: "#DDA0DD" }}>{node.data.package}</span>
								</div>
							)}
							{node.data.imports !== undefined && (
								<div className="mb-1">
									Imports:{" "}
									<span style={{ color: "#F0E68C" }}>{node.data.imports}</span>
								</div>
							)}
							{node.data.exports !== undefined && (
								<div>
									Exports:{" "}
									<span style={{ color: "#F0E68C" }}>{node.data.exports}</span>
								</div>
							)}
						</div>
					)}
					onClick={(node) => {
						console.log("Node details:", {
							name: node.data.name,
							data: node.data,
						});
					}}
					animate={true}
				/>
			</div>
			<div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded text-xs font-mono z-10">
				<div className="font-bold mb-2">Module Graph Flamegraph</div>
				<div>Click: View details</div>
				<div>Hover: Show tooltip</div>
			</div>
		</div>
	);
};
