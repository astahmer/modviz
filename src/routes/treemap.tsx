import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, Info } from "lucide-react";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { Button } from "~/components/ui/button";
import { fetchModvizBundle, getWorkspacePackageNames } from "~/utils/modviz-data";
import type { VizNode } from "../../mod/types";
import { colors } from "~/components/graph/common/colors";

export const Route = createFileRoute("/treemap")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: TreemapRoute,
});

interface TreemapNode {
	path: string;
	size: number;
	label: string;
	color: string;
	children?: TreemapNode[];
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	node?: VizNode;
}

interface Rectangle {
	path: string;
	label: string;
	color: string;
	x: number;
	y: number;
	width: number;
	height: number;
	size: number;
	node?: VizNode;
}

function TreemapRoute() {
	const bundle = Route.useLoaderData();
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	const workspacePackageNames = useMemo(
		() => getWorkspacePackageNames(bundle.graph),
		[bundle.graph],
	);

	const clusterColors = useMemo(() => {
		const colorMap = new Map<string, string>();
		bundle.graph.nodes.forEach((node) => {
			const cluster = node.cluster ?? node.package?.name ?? "other";
			if (!colorMap.has(cluster)) {
				colorMap.set(
					cluster,
					colors.list[colorMap.size] ?? colors.deterministic(cluster),
				);
			}
		});
		return colorMap;
	}, [bundle.graph.nodes]);

	const treemapData = useMemo(() => {
		const nodesMap = new Map(bundle.graph.nodes.map((n) => [n.path, n]));
		const tree = buildHierarchy(
			bundle.graph.nodes,
			clusterColors,
			selectedPath,
		);
		return { tree, nodesMap };
	}, [bundle.graph.nodes, clusterColors, selectedPath]);

	const rectangles = useMemo(() => {
		const rects = layout(treemapData.tree, 0, 0, 1000, 600);
		return rects;
	}, [treemapData.tree]);

	const selectedNode = selectedPath
		? treemapData.nodesMap.get(selectedPath)
		: null;
	const parentPath = selectedPath ? selectedPath.split("/").slice(0, -1).join("/") : null;

	return (
		<ModvizLayout>
			<div className="space-y-4">
				<div>
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
							Treemap Visualization
						</h1>
						{selectedPath && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setSelectedPath(null)}
								className="gap-2"
							>
								<ChevronLeft className="size-4" />
								Reset view
							</Button>
						)}
					</div>
					<p className="mt-2 text-slate-600 dark:text-slate-400">
						Hierarchical view of modules sized by import dependencies. Click to zoom.
					</p>
				</div>

				<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<svg
						viewBox="0 0 1000 600"
						className="w-full border border-slate-200 dark:border-slate-700"
						style={{
							maxHeight: "70vh",
							backgroundColor: "var(--bg)",
						}}
					>
						{rectangles.map((rect) => (
							<g
								key={rect.path}
								onClick={() => setSelectedPath(rect.path === "root" ? null : rect.path)}
								className="cursor-pointer transition-opacity hover:opacity-80"
							>
								<rect
									x={rect.x}
									y={rect.y}
									width={rect.width}
									height={rect.height}
									fill={rect.color}
									stroke="white"
									strokeWidth="2"
									opacity="0.85"
								/>
								{rect.width > 60 && rect.height > 40 && (
									<foreignObject
										x={rect.x + 4}
										y={rect.y + 4}
										width={rect.width - 8}
										height={rect.height - 8}
									>
										<div className="flex h-full flex-col overflow-hidden text-white">
											<p className="truncate text-xs font-semibold">
												{rect.label}
											</p>
											<p className="text-[10px] opacity-90">
												{rect.size} import{rect.size !== 1 ? "s" : ""}
											</p>
										</div>
									</foreignObject>
								)}
							</g>
						))}
					</svg>
				</div>

				{selectedNode && (
					<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
						<div className="flex items-start justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
									Selected Node
								</p>
								<h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
									{selectedNode.path}
								</h2>
								<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
									{selectedNode.cluster ?? selectedNode.type}
								</p>
							</div>
							{parentPath && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setSelectedPath(parentPath)}
								>
									<ChevronLeft className="size-4" />
									Parent
								</Button>
							)}
						</div>

						<div className="mt-4 grid gap-4 md:grid-cols-3">
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Direct imports
								</p>
								<p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
									{selectedNode.imports.length}
								</p>
							</div>
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Imported by
								</p>
								<p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
									{selectedNode.importedBy.length}
								</p>
							</div>
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Type
								</p>
								<p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
									{selectedNode.type}
								</p>
							</div>
						</div>
					</div>
				)}

				<div className="rounded-[24px] border border-blue-200/70 bg-blue-50/80 p-4 dark:border-blue-900/30 dark:bg-blue-950/30">
					<div className="flex gap-3">
						<Info className="mt-0.5 size-5 shrink-0 text-blue-900 dark:text-blue-100" />
						<div className="text-sm text-blue-800 dark:text-blue-200">
							<p className="font-semibold">About this view</p>
							<p className="mt-1">
								Rectangle size represents the number of direct imports for each module.
								Click on any rectangle to zoom in and explore sub-modules. Rectangles are
								color-coded by cluster/package for quick visual identification.
							</p>
						</div>
					</div>
				</div>
			</div>
		</ModvizLayout>
	);
}

function buildHierarchy(
	nodes: VizNode[],
	colorMap: Map<string, string>,
	selectedPath: string | null,
): TreemapNode {
	const nodeMap = new Map(nodes.map((n) => [n.path, n]));
	const hierarchy = new Map<string, TreemapNode>();
	let root: TreemapNode = {
		path: "root",
		size: 0,
		label: "All Modules",
		color: "#94a3b8",
		children: [],
	};

	// Filter nodes if a path is selected
	const visibleNodes = selectedPath
		? nodes.filter(
				(n) =>
					n.path === selectedPath ||
					n.path.startsWith(`${selectedPath}/`),
			)
		: nodes;

	// Build path hierarchy
	for (const node of visibleNodes) {
		const cluster = node.cluster ?? node.package?.name ?? "other";
		const size = Math.max(1, node.imports.length);
		const color = colorMap.get(cluster) ?? "#94a3b8";

		let parentPath = selectedPath || "root";
		let currentPath = selectedPath ? selectedPath : "root";

		// Create nodes for the path hierarchy
		const parts = selectedPath
			? node.path.slice(selectedPath.length + 1).split("/")
			: node.path.split("/");

		parts.forEach((part, index) => {
			const fullPath = currentPath === "root"
				? `${part}`
				: `${currentPath}/${part}`;
			const isLeaf = index === parts.length - 1;

			if (!hierarchy.has(fullPath)) {
				const newNode: TreemapNode = {
					path: fullPath,
					size: isLeaf ? size : 0,
					label: part,
					color,
					node: isLeaf ? node : undefined,
					children: [],
				};
				hierarchy.set(fullPath, newNode);

				if (parentPath === "root") {
					if (!root.children) root.children = [];
					root.children.push(newNode);
				} else {
					const parent = hierarchy.get(parentPath);
					if (parent) {
						if (!parent.children) parent.children = [];
						parent.children.push(newNode);
					}
				}
			} else if (isLeaf) {
				const existing = hierarchy.get(fullPath);
				if (existing) {
					existing.size += size;
				}
			}

			parentPath = fullPath;
			currentPath = fullPath;
		});
	}

	// Calculate sizes bottom-up
	const calculateSize = (node: TreemapNode): number => {
		if (!node.children || node.children.length === 0) {
			return node.size;
		}
		node.size = node.children.reduce((sum, child) => sum + calculateSize(child), 0);
		return node.size;
	};

	if (root.children) {
		root.size = root.children.reduce(
			(sum, child) => sum + calculateSize(child),
			0,
		);
	}

	return root;
}

function layout(
	node: TreemapNode,
	x: number,
	y: number,
	width: number,
	height: number,
): Rectangle[] {
	const rectangles: Rectangle[] = [];

	if (!node.children || node.children.length === 0) {
		rectangles.push({
			path: node.path,
			label: node.label,
			color: node.color,
			x,
			y,
			width,
			height,
			size: node.size,
			node: node.node,
		});
		return rectangles;
	}

	const children = [...node.children].sort((a, b) => b.size - a.size);
	const ratio = width / height;
	let row: TreemapNode[] = [];
	let rowWidth = 0;

	for (const child of children) {
		row.push(child);
		rowWidth += child.size;

		const rowRatio = Math.max(
			ratio,
			(rowWidth * rowWidth) / (node.size * node.size),
		);
		const maxRatio = Math.max(
			...row.map((r) => (r.size * r.size) / row.reduce((s, c) => s + c.size, 0) / rowRatio),
		);

		if (maxRatio > 1.5 || child === children[children.length - 1]) {
			const rowHeight = rowWidth / (width / rowRatio);
			let rowX = x;

			for (const rowChild of row) {
				const childWidth = (width / rowWidth) * rowChild.size;
				const childRects = layout(
					rowChild,
					rowX,
					y,
					childWidth,
					rowHeight,
				);
				rectangles.push(...childRects);
				rowX += childWidth;
			}

			y += rowHeight;
			height -= rowHeight;
			row = [];
			rowWidth = 0;
		}
	}

	return rectangles;
}
