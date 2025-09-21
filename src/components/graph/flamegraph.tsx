import { useEffect, useRef } from "react";
import { Flamegraph as AntfuFlamegraph, normalizeTreeNode } from "nanovis";
import type { ModvizOutput, VizNode } from "../../../mod/types";
import { mapModvizOutputToImporteesTreeCollection } from "~/components/tree-view/map-modviz-output-to-tree-collection";

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
		imports: number;
		exports: number;
		originalNode: VizNode;
	};
}

// Convert ModvizOutput to hierarchical data compatible with nanovis
function convertToNanovisHierarchyData(output: ModvizOutput): NanovisTreeNode {
	const entryNodeId = output.metadata.entrypoints[0]!;
	const entryNode = output.nodes.find((node) => node.path === entryNodeId);

	const nodeMap = new Map<string, NanovisTreeNode>();
	output.nodes.forEach((node) => {
		nodeMap.set(node.path, {
			id: node.path,
			text: node.path.split("/").slice(-2).join("/"),
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
				imports: 0,
				exports: 0,
				originalNode: {} as VizNode,
			},
		} as NanovisTreeNode;
	}

	const rootNode: NanovisTreeNode = {
		id: entryNode.path,
		text: entryNode.name,
		subtext: entryNode.package?.name,
		sizeSelf: Math.max(1, entryNode.imports.length + entryNode.exports.length),
		children: [],
		meta: {
			path: entryNode.path,
			type: entryNode.type,
			package: entryNode.package?.name,
			imports: entryNode.imports.length,
			exports: entryNode.exports.length,
			originalNode: entryNode,
		},
	};

	const allVisited = new Set<string>();
	const stack = [
		{
			nodePath: entryNodeId,
			parent: rootNode,
			visited: new Set([entryNodeId]),
		},
	];

	while (stack.length > 0) {
		const { nodePath, parent, visited } = stack.pop()!;
		allVisited.add(nodePath);

		const node = output.nodes.find((node) => node.path === nodePath);
		if (!node) continue;

		const currentTreeNode: NanovisTreeNode = {
			id: node.path,
			text: node.path.split("/").slice(-2).join("/"),
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

		if (parent.children) {
			parent.children.push(currentTreeNode);
		}

		node.importees.forEach((importee) => {
			if (visited.has(importee)) {
				const importeeNode = output.nodes.find(
					(node) => node.path === importee,
				);
				if (!importeeNode) return;

				const importeeTreeNode: NanovisTreeNode = {
					id: importeeNode.path,
					text: importeeNode.path.split("/").slice(-2).join("/"),
					subtext: importeeNode.package?.name,
					sizeSelf: Math.max(
						1,
						importeeNode.imports.length + importeeNode.exports.length,
					),
					children: [],
					meta: {
						path: importeeNode.path,
						type: importeeNode.type,
						package: importeeNode.package?.name,
						imports: importeeNode.imports.length,
						exports: importeeNode.exports.length,
						originalNode: importeeNode,
					},
				};
				currentTreeNode.children?.push(importeeTreeNode);
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

	return rootNode;
}

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
		console.time("convertToNanovisHierarchyData");
		const data = convertToNanovisHierarchyData(props.output);
		console.timeEnd("convertToNanovisHierarchyData");
		console.log(data);
		// const mapped = mapModvizOutputToImporteesTreeCollection(
		// 	props.output,
		// 	props.entryNodeId ?? props.output.metadata.entrypoints[0],
		// );
		// const data = mapped?.collection.rootNode!;

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
