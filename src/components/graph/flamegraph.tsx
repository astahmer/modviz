import { Flamegraph as AntfuFlamegraph, normalizeTreeNode } from "nanovis";
import { useEffect, useRef } from "react";
import {
	convertToNanovisHierarchyData,
	type FlamegraphBuildOptions,
} from "~/components/graph/map-to-flamegraph";
import type { ModvizOutput } from "../../../mod/types";

export const Flamegraph = (props: {
	output: ModvizOutput;
	entryNodeId?: string;
	options?: FlamegraphBuildOptions;
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const flamegraphRef = useRef<any>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		// Convert data to nanovis format
		const entryNodeId = props.entryNodeId ?? props.output.metadata.entrypoints[0]!;
		const data = convertToNanovisHierarchyData(props.output, entryNodeId, props.options);

		// Normalize the tree data for nanovis
		const normalizedTree = normalizeTreeNode(data as any);

		// Create flamegraph instance
		const flamegraph = new AntfuFlamegraph(normalizedTree);
		flamegraphRef.current = flamegraph;

		// Register events
		const unsubSelect = flamegraph.events.on("select", (node: any) => {
			console.log("Selected node:", {
				text: node?.text,
				subtext: node?.subtext,
				meta: node?.meta,
			});
		});

		const unsubHover = flamegraph.events.on("hover", (node: any, event?: MouseEvent) => {
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
			unsubSelect();
			unsubHover();
			if (flamegraphRef.current) {
				flamegraphRef.current = null;
			}
		};
	}, [props.entryNodeId, props.options, props.output]);

	return (
		<div className="relative w-full h-full min-h-0 flex flex-col">
			<div ref={containerRef} className="flex-1 min-h-0" style={{ minHeight: "400px" }} />

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
