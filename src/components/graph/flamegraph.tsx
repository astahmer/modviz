import { useEffect, useRef } from "react";
import { Flamegraph as AntfuFlamegraph, normalizeTreeNode } from "nanovis";
import type { ModvizOutput, VizNode } from "../../../mod/types";

interface NanovisTreeNode {
	id?: string;
	text?: string;
	subtext?: string;
	sizeSelf?: number;
	size?: number;
	children?: NanovisTreeNode[];
	meta?: {
		path: string;
		type?: string;
		package?: string;
		imports: number;
		exports: number;
		originalNode: VizNode;
	};
}

// Convert ModvizOutput to hierarchical data compatible with nanovis
function convertToNanovisHierarchyData(
	modvizOutput: ModvizOutput,
): NanovisTreeNode {
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
	): NanovisTreeNode | null {
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
		const treeNode: NanovisTreeNode = {
			id: node.path,
			text: node.name,
			subtext: node.package?.name,
			sizeSelf: Math.max(1, node.imports.length + node.exports.length),
			children: [],
			meta: {
				path: node.path,
				type: node.type,
				package: node.package?.name,
				imports: node.imports.length,
				exports: node.exports.length,
				originalNode: node,
			},
		};

		// Add children (importees) recursively
		node.importees.forEach((importedPath) => {
			const childNode = buildTreeForNode(importedPath, newAncestors);
			if (childNode) {
				treeNode.children!.push(childNode);
			}
		});

		return treeNode;
	}

	// Find entry points or root nodes
	const entryPoints = modvizOutput.metadata.entrypoints;
	const rootNodes: NanovisTreeNode[] = [];

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
		text: "Module Graph",
		sizeSelf: 1,
		children: rootNodes,
		meta: {
			path: "",
			imports: 0,
			exports: 0,
			originalNode: {} as VizNode,
		},
	};
}

// tooltip={(node) => (
// 	<div className="bg-black bg-opacity-70 text-white p-3 rounded text-xs font-mono">
// 		<div className="font-bold mb-2" style={{ color: "#4CAF50" }}>
// 			{node.data.original.name || "root"}
// 		</div>
// 		{node.data.original.path && (
// 			<div className="text-xs mb-1" style={{ color: "#ddd" }}>
// 				{node.data.original.path}
// 			</div>
// 		)}
// 		<div className="mb-1">
// 			Value: <span style={{ color: "#FFD700" }}>{node.value}</span>
// 		</div>
// 		{node.data.original.type && (
// 			<div className="mb-1">
// 				Type:{" "}
// 				<span style={{ color: "#87CEEB" }}>
// 					{node.data.original.type}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.package && (
// 			<div className="mb-1">
// 				Package:{" "}
// 				<span style={{ color: "#DDA0DD" }}>
// 					{node.data.original.package.name}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.imports !== undefined && (
// 			<div className="mb-1">
// 				Imports:{" "}
// 				<span style={{ color: "#F0E68C" }}>
// 					{node.data.original.imports.length}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.exports !== undefined && (
// 			<div>
// 				Exports:{" "}
// 				<span style={{ color: "#F0E68C" }}>
// 					{node.data.original.exports.length}
// 				</span>
// 			</div>
// 		)}
// 	</div>
// )}" "}
// 				<span style={{ color: "#87CEEB" }}>
// 					{node.data.original.type}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.package && (
// 			<div className="mb-1">
// 				Package:{" "}
// 				<span style={{ color: "#DDA0DD" }}>
// 					{node.data.original.package.name}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.imports !== undefined && (
// 			<div className="mb-1">
// 				Imports:{" "}
// 				<span style={{ color: "#F0E68C" }}>
// 					{node.data.original.imports.length}
// 				</span>
// 			</div>
// 		)}
// 		{node.data.original.exports !== undefined && (
// 			<div>
// 				Exports:{" "}
// 				<span style={{ color: "#F0E68C" }}>
// 					{node.data.original.exports.length}
// 				</span>
// 			</div>
// 		)}
// 	</div>
// )}

export const Flamegraph = (props: {
	output: ModvizOutput;
	entryNodeId?: string;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const flamegraphRef = useRef<any>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		// Convert data to nanovis format
		const data = convertToNanovisHierarchyData(props.output);

		// Normalize the tree data for nanovis
		const normalizedTree = normalizeTreeNode(data as any);

		// Create flamegraph instance
		const flamegraph = new AntfuFlamegraph(normalizedTree);
		flamegraphRef.current = flamegraph;

		// Register events
		flamegraph.events.on("select", (node: any) => {
			console.log("Selected node:", {
				text: node?.text,
				subtext: node?.subtext,
				meta: node?.meta,
			});
		});

		flamegraph.events.on("hover", (node: any, event?: MouseEvent) => {
			if (!tooltipRef.current) return;
			
			if (node && node.meta) {
				// Show tooltip
				tooltipRef.current.style.display = "block";
				
				// Position tooltip based on mouse position if available
				if (event) {
					tooltipRef.current.style.left = `${event.clientX + 10}px`;
					tooltipRef.current.style.top = `${event.clientY - 10}px`;
				}
				
				// Update tooltip content
				tooltipRef.current.innerHTML = `
					<div style="font-weight: bold; margin-bottom: 8px; color: #4CAF50;">
						${node.text || "root"}
					</div>
					${node.meta.path ? `<div style="color: #ddd; font-size: 10px; margin-bottom: 4px;">${node.meta.path}</div>` : ""}
					<div style="margin-bottom: 4px;">
						Size: <span style="color: #FFD700;">${node.sizeSelf || 0}</span>
					</div>
					${node.meta.type ? `<div style="margin-bottom: 4px;">Type: <span style="color: #87CEEB;">${node.meta.type}</span></div>` : ""}
					${node.meta.package ? `<div style="margin-bottom: 4px;">Package: <span style="color: #DDA0DD;">${node.meta.package}</span></div>` : ""}
					${node.meta.imports !== undefined ? `<div style="margin-bottom: 4px;">Imports: <span style="color: #F0E68C;">${node.meta.imports}</span></div>` : ""}
					${node.meta.exports !== undefined ? `<div>Exports: <span style="color: #F0E68C;">${node.meta.exports}</span></div>` : ""}
				`;
			} else {
				// Hide tooltip
				tooltipRef.current.style.display = "none";
			}
		});

		// Clear container and mount the flamegraph
		containerRef.current.innerHTML = "";
		containerRef.current.appendChild(flamegraph.el);

		// Cleanup function
		return () => {
			if (flamegraphRef.current) {
				// Note: nanovis might not have an 'off' method, events are handled differently
				flamegraphRef.current = null;
			}
		};
	}, [props.output, props.entryNodeId]);

	return (
		<div className="relative w-full h-full min-h-0 flex flex-col">
			<div
				ref={containerRef}
				className="flex-1 min-h-0"
				style={{ minHeight: "400px" }}
			/>
			
			{/* Custom tooltip */}
			<div
				ref={tooltipRef}
				style={{
					position: "fixed",
					background: "rgba(0, 0, 0, 0.9)",
					color: "white",
					padding: "12px",
					borderRadius: "6px",
					fontSize: "12px",
					fontFamily: "monospace",
					maxWidth: "300px",
					boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
					pointerEvents: "none",
					zIndex: 1000,
					display: "none",
				}}
			/>
			
			<div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded text-xs font-mono z-10">
				<div className="font-bold mb-2">Module Graph Flamegraph</div>
				<div>Click: Select node</div>
				<div>Hover: View details</div>
			</div>
		</div>
	);
};


