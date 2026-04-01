import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, FolderTree, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { colors } from "~/components/graph/common/colors";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { fetchModvizBundle, getWorkspacePackageNames } from "~/utils/modviz-data";
import {
	buildTreemapModel,
	collectTreemapModules,
	getTreemapAncestors,
	layoutTreemap,
	type TreemapTreeNode,
} from "~/utils/treemap";

export const Route = createFileRoute("/treemap")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: TreemapRoute,
});

const formatCount = (value: number, singular: string, plural = `${singular}s`) =>
	`${value} ${value === 1 ? singular : plural}`;

const getNodeTitle = (node: TreemapTreeNode) => {
	if (node.kind === "module") {
		return node.sourcePath ?? node.label;
	}
	return node.label;
};

const getNodeSubtitle = (node: TreemapTreeNode) => {
	if (node.kind === "module" && node.sourceNode) {
		return `${node.sourceNode.type}${node.sourceNode.cluster ? ` • ${node.sourceNode.cluster}` : ""}`;
	}
	if (node.kind === "package") {
		return `${formatCount(node.moduleCount, "module")} in package`;
	}
	if (node.kind === "scope") {
		return `${formatCount(node.moduleCount, "module")} in ${node.label.toLowerCase()}`;
	}
	return `${formatCount(node.moduleCount, "module")} across this branch`;
	};

const getRectCaption = (node: TreemapTreeNode) => {
	if (node.kind === "module") {
		return `${node.totalOutgoing} out • ${node.totalIncoming} in`;
	}
	return `${formatCount(node.moduleCount, "module")}`;
};

const getRectNumberVisibility = (width: number, height: number) =>
	width > 32 && height > 24;

function TreemapRoute() {
	const bundle = Route.useLoaderData();
	const [focusNodeId, setFocusNodeId] = useState("root");
	const [activeNodeId, setActiveNodeId] = useState("root");
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

	const workspacePackageNames = useMemo(
		() => getWorkspacePackageNames(bundle.graph),
		[bundle.graph],
	);

	const clusterColors = useMemo(() => {
		const colorMap = new Map<string, string>();
		bundle.graph.nodes.forEach((node) => {
			const colorKey = node.cluster ?? node.package?.name ?? node.type ?? node.path;
			if (!colorMap.has(colorKey)) {
				colorMap.set(
					colorKey,
					colors.list[colorMap.size] ?? colors.deterministic(colorKey),
				);
			}
		});
		return colorMap;
	}, [bundle.graph.nodes]);

	const treemap = useMemo(
		() => buildTreemapModel(bundle.graph.nodes, workspacePackageNames, clusterColors),
		[bundle.graph.nodes, workspacePackageNames, clusterColors],
	);

	const resolvedFocusNode = treemap.nodesById.get(focusNodeId) ?? treemap.root;
	const resolvedActiveNode = treemap.nodesById.get(activeNodeId) ?? resolvedFocusNode;
	const breadcrumbs = useMemo(
		() => getTreemapAncestors(resolvedFocusNode, treemap.nodesById),
		[resolvedFocusNode, treemap.nodesById],
	);
	const parentNode = resolvedFocusNode.parentId
		? treemap.nodesById.get(resolvedFocusNode.parentId) ?? null
		: null;

	const visibleNodes = resolvedFocusNode.children.length > 0
		? resolvedFocusNode.children
		: [resolvedFocusNode];
	const rectangles = useMemo(
		() =>
			layoutTreemap(visibleNodes, 0, 0, 1000, 600).map((rect, index) => ({
				...rect,
				legendIndex: index + 1,
				hasInlineLabel: rect.width > 110 && rect.height > 72,
			})),
		[visibleNodes],
	);
	const hoveredNode = hoveredNodeId
		? treemap.nodesById.get(hoveredNodeId) ?? null
		: null;
	const previewNode = hoveredNode ?? resolvedActiveNode;
	const topModules = useMemo(
		() =>
			collectTreemapModules(resolvedActiveNode)
				.sort((left, right) => right.size - left.size)
				.slice(0, 6),
		[resolvedActiveNode],
	);

	const handleRectClick = (node: TreemapTreeNode) => {
		setActiveNodeId(node.id);
		if (node.children.length > 0) {
			setFocusNodeId(node.id);
		}
	};

	const handleNavigateTo = (nodeId: string) => {
		setFocusNodeId(nodeId);
		setActiveNodeId(nodeId);
	};

	return (
		<ModvizLayout>
			<div className="space-y-4">
				<div>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
							Treemap Visualization
						</h1>
						{parentNode && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleNavigateTo(parentNode.id)}
								className="gap-2"
							>
								<ChevronLeft className="size-4" />
								Up one level
							</Button>
						)}
						{resolvedFocusNode.id !== treemap.root.id && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleNavigateTo(treemap.root.id)}
							>
								Reset view
							</Button>
						)}
					</div>
					<p className="mt-2 text-slate-600 dark:text-slate-400">
						Size reflects total direct dependency edges for each branch or file.
						Click folders or packages to drill in, then click files to inspect the hotspot.
					</p>
				</div>

				<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
						<FolderTree className="size-4" />
						{breadcrumbs.map((node, index) => (
							<button
								key={node.id}
								type="button"
								onClick={() => handleNavigateTo(node.id)}
								className="rounded-full px-2 py-1 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-slate-100"
							>
								{index > 0 ? "/ " : ""}
								{node.label}
							</button>
						))}
					</div>
					<div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[20px] border border-slate-200/70 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								{hoveredNode ? "Hover preview" : "Selection preview"}
							</p>
							<p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
								{getNodeTitle(previewNode)}
							</p>
							<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
								{getNodeSubtitle(previewNode)}
							</p>
						</div>
						<div className="text-right text-xs text-slate-500 dark:text-slate-400">
							<p>{getRectCaption(previewNode)}</p>
							<p className="mt-1">
								{formatCount(previewNode.totalNamedImports, "import statement")}
							</p>
						</div>
					</div>
					<svg
						viewBox="0 0 1000 600"
						className="w-full rounded-[20px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
						style={{ maxHeight: "70vh" }}
					>
						{rectangles.map((rect) => {
							const isActive = rect.node.id === resolvedActiveNode.id;
							const isHovered = rect.node.id === hoveredNodeId;
							return (
								<g
									key={rect.id}
									onClick={() => handleRectClick(rect.node)}
									className="cursor-pointer transition-opacity hover:opacity-90"
									onMouseEnter={() => setHoveredNodeId(rect.node.id)}
									onMouseLeave={() => setHoveredNodeId((current) => (current === rect.node.id ? null : current))}
								>
									<title>
										#{rect.legendIndex} {getNodeTitle(rect.node)}
										{`\n${getNodeSubtitle(rect.node)}`}
										{`\n${getRectCaption(rect.node)}`}
									</title>
									<rect
										x={rect.x + 2}
										y={rect.y + 2}
										width={Math.max(0, rect.width - 4)}
										height={Math.max(0, rect.height - 4)}
										fill={rect.node.color}
										stroke={isActive || isHovered ? "#0f172a" : "rgba(255,255,255,0.92)"}
										strokeWidth={isActive ? 4 : isHovered ? 3 : 2}
										rx={10}
										opacity={rect.node.kind === "module" ? 0.9 : 0.84}
									/>
									{getRectNumberVisibility(rect.width, rect.height) && (
										<g>
											<rect
												x={rect.x + 10}
												y={rect.y + 10}
												width={Math.min(34, Math.max(24, rect.width - 20))}
												height={20}
												rx={10}
												fill="rgba(15,23,42,0.72)"
											/>
											<text
												x={rect.x + 10 + Math.min(34, Math.max(24, rect.width - 20)) / 2}
												y={rect.y + 24}
												textAnchor="middle"
												fontSize="11"
												fontWeight="700"
												fill="white"
											>
												#{rect.legendIndex}
											</text>
										</g>
									)}
									{!rect.hasInlineLabel && (
										<foreignObject
											x={rect.x + 2}
											y={rect.y + 2}
											width={Math.max(0, rect.width - 4)}
											height={Math.max(0, rect.height - 4)}
										>
											<div className="flex h-full w-full items-stretch justify-stretch">
												<Tooltip lazyMount openDelay={70} closeDelay={0}>
													<TooltipTrigger>
														<div
															className="h-full w-full cursor-pointer"
															onClick={() => handleRectClick(rect.node)}
															onMouseEnter={() => setHoveredNodeId(rect.node.id)}
															onMouseLeave={() =>
																setHoveredNodeId((current) =>
																	current === rect.node.id ? null : current,
																)
															}
														/>
													</TooltipTrigger>
													<TooltipContent sideOffset={8} className="max-w-80">
														<div className="space-y-1">
															<p className="font-semibold">#{rect.legendIndex} {getNodeTitle(rect.node)}</p>
															<p className="text-xs opacity-80">{getNodeSubtitle(rect.node)}</p>
															<p className="text-xs opacity-80">{getRectCaption(rect.node)}</p>
														</div>
													</TooltipContent>
												</Tooltip>
											</div>
										</foreignObject>
									)}
									{rect.hasInlineLabel && (
										<foreignObject
											x={rect.x + 14}
											y={rect.y + 36}
											width={Math.max(0, rect.width - 28)}
											height={Math.max(0, rect.height - 50)}
										>
											<div className="flex h-full flex-col justify-between overflow-hidden text-white">
												<div>
													<p className="truncate text-sm font-semibold leading-tight">
														{rect.node.label}
													</p>
													<p className="mt-1 text-xs opacity-90">
														{getRectCaption(rect.node)}
													</p>
												</div>
												{rect.node.kind !== "module" && (
													<p className="text-[11px] opacity-80">
														Click to zoom deeper
													</p>
												)}
											</div>
										</foreignObject>
									)}
								</g>
							);
						})}
					</svg>
				</div>

				<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
					<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
							Current selection
						</p>
						<h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
							{getNodeTitle(resolvedActiveNode)}
						</h2>
						<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
							{getNodeSubtitle(resolvedActiveNode)}
						</p>

						<div className="mt-4 grid gap-4 md:grid-cols-3">
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Modules
								</p>
								<p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
									{resolvedActiveNode.moduleCount}
								</p>
							</div>
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Outgoing imports
								</p>
								<p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
									{resolvedActiveNode.totalOutgoing}
								</p>
							</div>
							<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
									Incoming imports
								</p>
								<p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
									{resolvedActiveNode.totalIncoming}
								</p>
							</div>
						</div>

						{resolvedActiveNode.kind === "module" && resolvedActiveNode.sourceNode && (
							<div className="mt-4 rounded-lg bg-slate-50/80 p-4 text-sm text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
								<p>
									Named imports in source: {resolvedActiveNode.totalNamedImports}
								</p>
								<p className="mt-1">
									Imported by {formatCount(resolvedActiveNode.sourceNode.importedBy.length, "module")}
									 and imports {formatCount(resolvedActiveNode.sourceNode.importees.length, "module")}.
								</p>
							</div>
						)}
					</div>

					<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
						<p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
							Nodes in current view
						</p>
						<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Tiny tiles are numbered to match this list.
						</p>
						<div className="mt-4 max-h-[26rem] space-y-3 overflow-auto pr-1">
							{rectangles.map((rect) => (
								<button
									key={rect.id}
									type="button"
									onClick={() => handleRectClick(rect.node)}
									onMouseEnter={() => setHoveredNodeId(rect.node.id)}
									onMouseLeave={() => setHoveredNodeId((current) => (current === rect.node.id ? null : current))}
									className="block w-full rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900"
								>
									<div className="flex items-start gap-3">
										<div className="mt-0.5 flex items-center gap-2">
											<span className="inline-flex min-w-8 items-center justify-center rounded-full bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
												#{rect.legendIndex}
											</span>
											<span
												className="mt-1 size-3 rounded-full"
												style={{ backgroundColor: rect.node.color }}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
												{getNodeTitle(rect.node)}
											</p>
											<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
												{getNodeSubtitle(rect.node)}
											</p>
											<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
												{getRectCaption(rect.node)}
											</p>
										</div>
									</div>
								</button>
							))}
							{rectangles.length === 0 && (
								<p className="text-sm text-slate-500 dark:text-slate-400">
									No nodes are visible at this level.
								</p>
							)}
							{topModules.length > 0 && (
								<div className="pt-2">
									<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
										Heaviest modules in selection
									</p>
									<div className="mt-3 space-y-3">
										{topModules.map((node) => (
											<button
												key={node.id}
												type="button"
												onClick={() => setActiveNodeId(node.id)}
												className="block w-full rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900"
											>
												<p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
													{node.sourcePath ?? node.label}
												</p>
												<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
													{node.totalOutgoing} outgoing • {node.totalIncoming} incoming
												</p>
											</button>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				<div className="rounded-[24px] border border-blue-200/70 bg-blue-50/80 p-4 dark:border-blue-900/30 dark:bg-blue-950/30">
					<div className="flex gap-3">
						<Info className="mt-0.5 size-5 shrink-0 text-blue-900 dark:text-blue-100" />
						<div className="text-sm text-blue-800 dark:text-blue-200">
							<p className="font-semibold">About this view</p>
							<p className="mt-1">
								The treemap now groups workspace code by folders and third-party code by package,
								so the first click reveals structure instead of dropping you into a broken leaf.
								Area reflects direct dependency pressure using incoming plus outgoing edges.
							</p>
						</div>
					</div>
				</div>
			</div>
		</ModvizLayout>
	);
}