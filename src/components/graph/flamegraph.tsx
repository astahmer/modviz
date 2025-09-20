import * as d3 from "d3";
import type { ModvizOutput } from "../../../mod/types";

// Define type for tree node to prevent recursion issues
interface TreeNode {
	name: string;
	path: string;
	type?: string;
	package?: string;
	imports: number;
	exports: number;
	children: TreeNode[];
}

// Define type for hierarchy node
type HierarchyNode = d3.HierarchyRectangularNode<TreeNode>;

// Convert ModvizOutput to hierarchical data
function convertToHierarchyData(modvizOutput: ModvizOutput): {
	name: string;
	children: TreeNode[];
} {
	const nodesMap = new Map<string, any>();
	const visitedPaths = new Set<string>();

	// First pass: create all nodes
	modvizOutput.nodes.forEach((node) => {
		nodesMap.set(node.path, {
			name: node.name,
			path: node.path,
			type: node.type,
			package: node.package?.name,
			imports: node.imports.length,
			exports: node.exports.length,
			children: [],
		});
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

		const node = modvizOutput.nodes.find((n) => n.path === nodePath);
		if (!node) return null;

		const nodeData = nodesMap.get(nodePath);
		if (!nodeData) return null;

		// Mark this node as visited to prevent revisiting
		visitedPaths.add(nodePath);

		// Add current node to ancestors to detect immediate cycles
		const newAncestors = new Set([...ancestors, nodePath]);

		// Create a new node object to avoid circular references
		const treeNode: TreeNode = {
			name: nodeData.name,
			path: nodeData.path,
			type: nodeData.type,
			package: nodeData.package,
			imports: nodeData.imports,
			exports: nodeData.exports,
			children: [],
		};

		// Add children (importees) recursively
		node.importees.forEach((importedPath) => {
			const childNode = buildTreeForNode(importedPath, newAncestors);
			if (childNode) {
				treeNode.children.push(childNode);
			}
		});

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

	// Fallback: if still no roots, take first few nodes
	if (rootNodes.length === 0) {
		modvizOutput.nodes.slice(0, 5).forEach((node) => {
			visitedPaths.clear();
			const rootNode = buildTreeForNode(node.path);
			if (rootNode) {
				rootNodes.push(rootNode);
			}
		});
	}

	return {
		name: "Module Graph",
		children: rootNodes,
	};
}

export function renderFlamegraph(data: ModvizOutput) {
	const structuredData = convertToHierarchyData(data);

	// Get the container and create/select SVG
	const container = d3.select("#flamegraph-container");
	const containerNode = container.node() as HTMLElement;
	if (!containerNode) return;

	const containerWidth = containerNode.clientWidth || 1000;
	const containerHeight = containerNode.clientHeight || 600;

	// Clear any existing content
	container.selectAll("*").remove();

	// Create SVG with full container size
	const svg = container
		.append("svg")
		.attr("width", containerWidth)
		.attr("height", containerHeight)
		.style("border", "1px solid #ddd")
		.style("background", "#fafafa");

	// Create main group for zoom/pan transformations
	const mainGroup = svg.append("g").attr("class", "main-group");

	// Set up zoom behavior
	const zoom = d3
		.zoom<SVGSVGElement, unknown>()
		.scaleExtent([0.1, 10])
		.on("zoom", (event) => {
			mainGroup.attr("transform", event.transform);
		});

	// Apply zoom behavior to SVG
	svg.call(zoom);

	// Calculate layout dimensions (larger than container for better zoom experience)
	const layoutWidth = Math.max(containerWidth * 2, 2000);
	const layoutHeight = Math.max(containerHeight * 1.5, 1000);

	const hierarchyNode = d3.hierarchy(structuredData as TreeNode).sum((d) => 1);
	const layout = d3.partition<TreeNode>().size([layoutHeight, layoutWidth]);
	const root = layout(hierarchyNode);

	// Color scale based on depth
	const colorScale = d3
		.scaleOrdinal()
		.domain(["0", "1", "2", "3", "4", "5"])
		.range(["#f7f7f7", "#d1e7dd", "#a3cfbb", "#6ab04c", "#3d8b37", "#2c5232"]);

	// Create groups for each node to hold both rect and text
	const node = mainGroup
		.selectAll("g.node")
		.data(root.descendants())
		.enter()
		.append("g")
		.attr("class", "node")
		.attr("transform", (d) => `translate(${d.y0},${d.x0})`);

	// Add rectangles
	node
		.append("rect")
		.attr("width", (d) => d.y1 - d.y0)
		.attr("height", (d) => d.x1 - d.x0)
		.attr("fill", (d) =>
			d.depth === 0 ? "#f8f9fa" : (colorScale(d.depth.toString()) as string),
		)
		.attr("stroke", "#ffffff")
		.attr("stroke-width", 1)
		.style("cursor", "pointer")
		.on("click", (event, d) => {
			console.log("Node details:", {
				name: d.data.name,
				depth: d.depth,
				children: d.children?.length || 0,
				data: d.data,
			});
		})
		.on("mouseover", function (event, d) {
			d3.select(this).attr("opacity", 0.8);

			// Remove any existing tooltips
			d3.selectAll(".flamegraph-tooltip").remove();

			// Create tooltip
			const tooltip = d3
				.select("body")
				.append("div")
				.attr("class", "flamegraph-tooltip")
				.style("position", "absolute")
				.style("background", "rgba(0, 0, 0, 0.9)")
				.style("color", "white")
				.style("padding", "12px")
				.style("border-radius", "6px")
				.style("font-size", "12px")
				.style("font-family", "monospace")
				.style("pointer-events", "none")
				.style("z-index", "1000")
				.style("max-width", "300px")
				.style("box-shadow", "0 4px 8px rgba(0,0,0,0.3)")
				.html(`
					<div style="font-weight: bold; margin-bottom: 8px; color: #4CAF50;">${d.data.name || "root"}</div>
					${d.data.path ? `<div style="color: #ddd; font-size: 10px; margin-bottom: 4px;">${d.data.path}</div>` : ""}
					<div style="margin-bottom: 4px;">Depth: <span style="color: #FFD700;">${d.depth}</span></div>
					<div style="margin-bottom: 4px;">Children: <span style="color: #FFD700;">${d.children?.length || 0}</span></div>
					${d.data.type ? `<div style="margin-bottom: 4px;">Type: <span style="color: #87CEEB;">${d.data.type}</span></div>` : ""}
					${d.data.package ? `<div style="margin-bottom: 4px;">Package: <span style="color: #DDA0DD;">${d.data.package}</span></div>` : ""}
					${d.data.imports !== undefined ? `<div style="margin-bottom: 4px;">Imports: <span style="color: #F0E68C;">${d.data.imports}</span></div>` : ""}
					${d.data.exports !== undefined ? `<div>Exports: <span style="color: #F0E68C;">${d.data.exports}</span></div>` : ""}
				`)
				.style("left", event.pageX + 10 + "px")
				.style("top", event.pageY - 10 + "px");
		})
		.on("mousemove", function (event) {
			d3.select(".flamegraph-tooltip")
				.style("left", event.pageX + 10 + "px")
				.style("top", event.pageY - 10 + "px");
		})
		.on("mouseout", function () {
			d3.select(this).attr("opacity", 1);
			d3.selectAll(".flamegraph-tooltip").remove();
		});

	// Store zoom object for external access
	(svg.node() as any).__zoom__ = zoom;

	// Add text labels
	node
		.append("text")
		.attr("x", (d) => (d.y1 - d.y0) / 2)
		.attr("y", (d) => (d.x1 - d.x0) / 2)
		.attr("dy", "0.35em")
		.attr("text-anchor", "middle")
		.attr("font-size", (d) => {
			const rectWidth = d.y1 - d.y0;
			const rectHeight = d.x1 - d.x0;
			return Math.min(rectWidth / 8, rectHeight / 2, 12) + "px";
		})
		.attr("fill", (d) => (d.depth > 2 ? "#ffffff" : "#333333"))
		.attr("pointer-events", "none")
		.text((d) => {
			const rectWidth = d.y1 - d.y0;
			const name = d.data.name || "root";

			// Don't show text for very small rectangles
			if (rectWidth < 50) return "";

			// For larger rectangles, show more information
			if (rectWidth > 150) {
				const packageInfo = d.data.package ? ` (${d.data.package})` : "";
				const fullText = name + packageInfo;
				return fullText.length > 25
					? fullText.substring(0, 25) + "..."
					: fullText;
			}

			// For medium rectangles, just show the name
			if (rectWidth > 80) {
				return name.length > 15 ? name.substring(0, 15) + "..." : name;
			}

			// For small rectangles, show abbreviated name
			return name.length > 8 ? name.substring(0, 8) + "..." : name;
		})
		.each(function (d) {
			// Hide text if rectangle is too small
			const rectWidth = d.y1 - d.y0;
			const rectHeight = d.x1 - d.x0;
			if (rectWidth < 30 || rectHeight < 15) {
				d3.select(this).style("display", "none");
			}
		});

	// Add zoom controls
	const controls = container
		.append("div")
		.style("position", "absolute")
		.style("top", "10px")
		.style("right", "10px")
		.style("z-index", "1001")
		.style("display", "flex")
		.style("flex-direction", "column")
		.style("gap", "5px");

	// Zoom in button
	controls
		.append("button")
		.style("padding", "8px 12px")
		.style("background", "#4CAF50")
		.style("color", "white")
		.style("border", "none")
		.style("border-radius", "4px")
		.style("cursor", "pointer")
		.style("font-size", "14px")
		.text("Zoom In")
		.on("click", () => {
			svg.transition().duration(300).call(zoom.scaleBy, 1.5);
		});

	// Zoom out button
	controls
		.append("button")
		.style("padding", "8px 12px")
		.style("background", "#f44336")
		.style("color", "white")
		.style("border", "none")
		.style("border-radius", "4px")
		.style("cursor", "pointer")
		.style("font-size", "14px")
		.text("Zoom Out")
		.on("click", () => {
			svg.transition().duration(300).call(zoom.scaleBy, 0.67);
		});

	// Reset zoom button
	controls
		.append("button")
		.style("padding", "8px 12px")
		.style("background", "#2196F3")
		.style("color", "white")
		.style("border", "none")
		.style("border-radius", "4px")
		.style("cursor", "pointer")
		.style("font-size", "14px")
		.text("Reset")
		.on("click", () => {
			svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
		});

	// Fit to content button
	controls
		.append("button")
		.style("padding", "8px 12px")
		.style("background", "#FF9800")
		.style("color", "white")
		.style("border", "none")
		.style("border-radius", "4px")
		.style("cursor", "pointer")
		.style("font-size", "14px")
		.text("Fit")
		.on("click", () => {
			const bounds = mainGroup.node()?.getBBox();
			if (bounds) {
				const fullWidth = bounds.width;
				const fullHeight = bounds.height;
				const width = containerWidth;
				const height = containerHeight;
				const midX = bounds.x + fullWidth / 2;
				const midY = bounds.y + fullHeight / 2;
				const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9;
				const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

				svg
					.transition()
					.duration(750)
					.call(
						zoom.transform,
						d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
					);
			}
		});

	// Add keyboard shortcuts
	d3.select("body").on("keydown.flamegraph", (event) => {
		if (event.target !== document.body) return; // Only when body is focused

		switch (event.key) {
			case "+":
			case "=":
				event.preventDefault();
				svg.transition().duration(300).call(zoom.scaleBy, 1.5);
				break;
			case "-":
				event.preventDefault();
				svg.transition().duration(300).call(zoom.scaleBy, 0.67);
				break;
			case "0":
				event.preventDefault();
				svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
				break;
			case "f":
			case "F":
				event.preventDefault();
				// Fit to content
				const bounds = mainGroup.node()?.getBBox();
				if (bounds) {
					const fullWidth = bounds.width;
					const fullHeight = bounds.height;
					const width = containerWidth;
					const height = containerHeight;
					const midX = bounds.x + fullWidth / 2;
					const midY = bounds.y + fullHeight / 2;
					const scale = Math.min(width / fullWidth, height / fullHeight) * 0.9;
					const translate = [
						width / 2 - scale * midX,
						height / 2 - scale * midY,
					];

					svg
						.transition()
						.duration(750)
						.call(
							zoom.transform,
							d3.zoomIdentity
								.translate(translate[0], translate[1])
								.scale(scale),
						);
				}
				break;
		}
	});

	// Add instructions
	container
		.append("div")
		.style("position", "absolute")
		.style("bottom", "10px")
		.style("left", "10px")
		.style("background", "rgba(0, 0, 0, 0.7)")
		.style("color", "white")
		.style("padding", "8px 12px")
		.style("border-radius", "4px")
		.style("font-size", "12px")
		.style("font-family", "monospace")
		.style("z-index", "1001")
		.html(`
			<div style="font-weight: bold; margin-bottom: 4px;">Controls:</div>
			<div>Mouse: Pan & Zoom</div>
			<div>+/- : Zoom In/Out</div>
			<div>0 : Reset Zoom</div>
			<div>F : Fit to Content</div>
		`);
}

export const FlamegraphControl = (props: { output: ModvizOutput }) => {
	return (
		<div
			id="flamegraph-container"
			ref={(el) => {
				if (el) {
					// Clear any existing content to prevent duplicates
					d3.select(el).selectAll("*").remove();

					// Render the flamegraph
					renderFlamegraph(props.output);
				}
			}}
			className="relative overflow-hidden top-0 left-0 w-full h-full min-h-0 flex flex-col gap-2"
		/>
	);
};
