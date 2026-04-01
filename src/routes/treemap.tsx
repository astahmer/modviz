import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, FolderTree, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { colors } from "~/components/graph/common/colors";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { getWorkspacePackageNames, useModvizBundle } from "~/utils/modviz-data";
import { parseSearchParam } from "~/utils/search-params";
import {
	buildTreemapModel,
	collectTreemapModules,
	getTreemapAncestors,
	layoutTreemap,
	type TreemapTreeNode,
} from "~/utils/treemap";
import { Portal } from "@ark-ui/react/portal";

type TreemapSearch = {
	focus: string;
	page: number;
	paginate: boolean;
	selected: string;
};

const validateTreemapSearch = (search: Record<string, unknown>): TreemapSearch => ({
	focus: parseSearchParam.string(search.focus, "root") || "root",
	page: Math.max(0, Math.floor(parseSearchParam.number(search.page, 0))),
	paginate: parseSearchParam.boolean(search.paginate, true),
	selected: parseSearchParam.string(search.selected),
});

export const Route = createFileRoute("/treemap")({
	ssr: false,
	validateSearch: validateTreemapSearch,
	component: TreemapRoute,
});

const TREEMAP_PAGE_SIZE = 18;
const TREEMAP_LAYOUT_WIDTH = 1000;
const TREEMAP_LAYOUT_HEIGHT = 600;
const INLINE_LABEL_HORIZONTAL_PADDING = 28;
const INLINE_LABEL_TOP_OFFSET = 36;
const INLINE_LABEL_BOTTOM_PADDING = 14;
const INLINE_LABEL_MIN_WIDTH = 56;
const INLINE_LABEL_MIN_HEIGHT = 42;
const INLINE_LABEL_STACK_GAP = 4;
const INLINE_LABEL_SECTION_GAP = 12;
const INLINE_LABEL_TITLE_MAX_LINES = 3;
const INLINE_LABEL_CAPTION_MAX_LINES = 2;
const INLINE_LABEL_HINT_MAX_LINES = 2;
const TITLE_LINE_HEIGHT = 18;
const CAPTION_LINE_HEIGHT = 16;
const HINT_LINE_HEIGHT = 14;
const TITLE_FONT = '600 14px ui-sans-serif, system-ui, sans-serif';
const CAPTION_FONT = '400 12px ui-sans-serif, system-ui, sans-serif';
const HINT_FONT = '400 11px ui-sans-serif, system-ui, sans-serif';

type InlineLabelLayout = {
	titleLines: string[];
	captionLines: string[];
	hintLines: string[];
};

type DenseTailGridTile = {
	id: string;
	label: string;
	caption: string;
	color: string;
	legendIndex: number;
	x: number;
	y: number;
	size: number;
};

type DenseTailGrid = {
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	tiles: DenseTailGridTile[];
	hiddenCount: number;
};

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

const isDenseTailRect = (rect: {
	width: number;
	height: number;
	inlineLabel: InlineLabelLayout | null;
}) => {
	if (rect.inlineLabel) {
		return false;
	}

	const area = rect.width * rect.height;
	return area < 900 || rect.width < 28 || rect.height < 28;
};

const getOverlayStyle = (x: number, y: number, width: number, height: number) => ({
	left: `${(x / TREEMAP_LAYOUT_WIDTH) * 100}%`,
	top: `${(y / TREEMAP_LAYOUT_HEIGHT) * 100}%`,
	width: `${(width / TREEMAP_LAYOUT_WIDTH) * 100}%`,
	height: `${(height / TREEMAP_LAYOUT_HEIGHT) * 100}%`,
});

const getTextLines = (
	text: string,
	font: string,
	maxWidth: number,
	lineHeight: number,
) =>
	layoutWithLines(
		prepareWithSegments(text, font),
		Math.max(1, maxWidth),
		lineHeight,
	);

const getInlineLabelLayout = (
	node: TreemapTreeNode,
	width: number,
	height: number,
): InlineLabelLayout | null => {
	const availableWidth = width - INLINE_LABEL_HORIZONTAL_PADDING;
	const availableHeight = height - INLINE_LABEL_TOP_OFFSET - INLINE_LABEL_BOTTOM_PADDING;
	if (availableWidth < INLINE_LABEL_MIN_WIDTH || availableHeight < INLINE_LABEL_MIN_HEIGHT) {
		return null;
	}

	const titleLayout = getTextLines(node.label, TITLE_FONT, availableWidth, TITLE_LINE_HEIGHT);
	if (titleLayout.lineCount === 0 || titleLayout.lineCount > INLINE_LABEL_TITLE_MAX_LINES) {
		return null;
	}

	const captionLayout = getTextLines(
		getRectCaption(node),
		CAPTION_FONT,
		availableWidth,
		CAPTION_LINE_HEIGHT,
	);
	if (
		captionLayout.lineCount === 0 ||
		captionLayout.lineCount > INLINE_LABEL_CAPTION_MAX_LINES
	) {
		return null;
	}

	const hintText = node.kind === "module" ? null : "Click to zoom deeper";
	const hintLayout = hintText
		? getTextLines(hintText, HINT_FONT, availableWidth, HINT_LINE_HEIGHT)
		: null;
	if (hintLayout && hintLayout.lineCount > INLINE_LABEL_HINT_MAX_LINES) {
		return null;
	}

	const contentHeight =
		titleLayout.height +
		INLINE_LABEL_STACK_GAP +
		captionLayout.height +
		(hintLayout ? INLINE_LABEL_SECTION_GAP + hintLayout.height : 0);
	if (contentHeight > availableHeight) {
		return null;
	}

	return {
		titleLines: titleLayout.lines.map((line) => line.text),
		captionLines: captionLayout.lines.map((line) => line.text),
		hintLines: hintLayout ? hintLayout.lines.map((line) => line.text) : [],
	};
};

const isNodeInBranch = (
	node: TreemapTreeNode,
	branchId: string,
	nodesById: Map<string, TreemapTreeNode>,
) => {
	let current: TreemapTreeNode | null = node;
	while (current) {
		if (current.id === branchId) {
			return true;
		}
		current = current.parentId ? nodesById.get(current.parentId) ?? null : null;
	}
	return false;
};

const getExplorerSearchForNode = (
	node: TreemapTreeNode,
	preservedModule?: TreemapTreeNode | null,
) => {
	const selected = preservedModule?.kind === "module" ? preservedModule.sourcePath ?? "" : "";
	if (node.kind === "module" && node.sourcePath) {
		return {
			selected: node.sourcePath,
			q: "",
			scope: node.sourcePath.includes("node_modules") ? "external" : "workspace",
		} as const;
	}

	if (node.kind === "scope") {
		return {
			selected,
			q: "",
			scope: node.id === "scope:external" ? "external" : "workspace",
		} as const;
	}

	const [, encodedPath = ""] = node.id.split(":");
	const [scope, ...segments] = encodedPath.split("/");
	return {
		selected,
		q: segments.join("/"),
		scope: scope === "external" ? "external" : "workspace",
	} as const;
};

function TreemapRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
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

	const focusNodeId = search.focus || "root";
	const activeNodeId = search.selected || focusNodeId;
	const updateTreemapSearch = (
		patch: Partial<TreemapSearch>,
		options?: { replace?: boolean },
	) => {
		void navigate({
			replace: options?.replace ?? false,
			resetScroll: false,
			search: (previous) => ({ ...previous, ...patch }),
		});
	};

	const resolvedFocusNode = treemap.nodesById.get(focusNodeId) ?? treemap.root;
	const resolvedActiveNode = treemap.nodesById.get(activeNodeId) ?? resolvedFocusNode;
	const breadcrumbs = useMemo(
		() => getTreemapAncestors(resolvedFocusNode, treemap.nodesById),
		[resolvedFocusNode, treemap.nodesById],
	);
	const parentNode = resolvedFocusNode.parentId
		? treemap.nodesById.get(resolvedFocusNode.parentId) ?? null
		: null;
	const hoveredNode = hoveredNodeId
		? treemap.nodesById.get(hoveredNodeId) ?? null
		: null;
	const preservedExplorerModule = useMemo(() => {
		if (hoveredNode?.kind === "module" && isNodeInBranch(hoveredNode, resolvedFocusNode.id, treemap.nodesById)) {
			return hoveredNode;
		}
		if (
			resolvedActiveNode.kind === "module" &&
			isNodeInBranch(resolvedActiveNode, resolvedFocusNode.id, treemap.nodesById)
		) {
			return resolvedActiveNode;
		}
		return null;
	}, [hoveredNode, resolvedActiveNode, resolvedFocusNode.id, treemap.nodesById]);
	const explorerSearch = useMemo(
		() => getExplorerSearchForNode(resolvedFocusNode, preservedExplorerModule),
		[preservedExplorerModule, resolvedFocusNode],
	);

	const visibleNodes = resolvedFocusNode.children.length > 0
		? resolvedFocusNode.children
		: [resolvedFocusNode];
	const sortedVisibleNodes = useMemo(
		() => [...visibleNodes].sort((left, right) => right.size - left.size),
		[visibleNodes],
	);
	const paginationEnabled = search.paginate;
	const totalPages = Math.max(1, Math.ceil(sortedVisibleNodes.length / TREEMAP_PAGE_SIZE));
	const pageIndex = paginationEnabled ? Math.min(search.page, totalPages - 1) : 0;
	const pageStart = paginationEnabled ? pageIndex * TREEMAP_PAGE_SIZE : 0;
	const pagedVisibleNodes = useMemo(
		() =>
			paginationEnabled
				? sortedVisibleNodes.slice(
					pageStart,
					pageStart + TREEMAP_PAGE_SIZE,
				)
				: sortedVisibleNodes,
		[pageStart, paginationEnabled, sortedVisibleNodes],
	);

	useEffect(() => {
		if (!paginationEnabled || search.page === pageIndex) {
			return;
		}

		updateTreemapSearch({ page: pageIndex }, { replace: true });
	}, [pageIndex, paginationEnabled, search.page]);

	const rectangles = useMemo(
		() =>
			layoutTreemap(pagedVisibleNodes, 0, 0, TREEMAP_LAYOUT_WIDTH, TREEMAP_LAYOUT_HEIGHT).map((rect, index) => ({
				...rect,
				legendIndex: pageStart + index + 1,
				inlineLabel: getInlineLabelLayout(rect.node, rect.width, rect.height),
			})),
		[pagedVisibleNodes, pageStart],
	);
	const denseTailGrid = useMemo<DenseTailGrid | null>(() => {
		if (paginationEnabled) {
			return null;
		}

		const denseTailRects = rectangles.filter(isDenseTailRect);
		if (denseTailRects.length < 8) {
			return null;
		}

		const minX = Math.min(...denseTailRects.map((rect) => rect.x));
		const minY = Math.min(...denseTailRects.map((rect) => rect.y));
		const maxX = Math.max(...denseTailRects.map((rect) => rect.x + rect.width));
		const maxY = Math.max(...denseTailRects.map((rect) => rect.y + rect.height));
		const bounds = {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		};
		const padding = 6;
		const gap = 4;
		const minTileSize = 18;
		const availableWidth = Math.max(minTileSize, bounds.width - padding * 2);
		const availableHeight = Math.max(minTileSize, bounds.height - padding * 2);
		const maxColumns = Math.max(1, Math.floor((availableWidth + gap) / (minTileSize + gap)));
		const maxRows = Math.max(1, Math.floor((availableHeight + gap) / (minTileSize + gap)));
		const capacity = Math.max(1, maxColumns * maxRows);
		const hiddenCount = Math.max(0, denseTailRects.length - capacity);
		const visibleRects = hiddenCount > 0 ? denseTailRects.slice(0, capacity - 1) : denseTailRects.slice(0, capacity);
		const tileCount = visibleRects.length + (hiddenCount > 0 ? 1 : 0);
		const columns = Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(tileCount))));
		const rows = Math.max(1, Math.ceil(tileCount / columns));
		const tileSize = Math.floor(
			Math.min(
				(availableWidth - gap * (columns - 1)) / columns,
				(availableHeight - gap * (rows - 1)) / rows,
			),
		);
		const tiles: DenseTailGridTile[] = [];

		visibleRects.forEach((rect, index) => {
			const column = index % columns;
			const row = Math.floor(index / columns);
			tiles.push({
				id: rect.node.id,
				label: getNodeTitle(rect.node),
				caption: getRectCaption(rect.node),
				color: rect.node.color,
				legendIndex: rect.legendIndex,
				x: padding + column * (tileSize + gap),
				y: padding + row * (tileSize + gap),
				size: tileSize,
			});
		});

		if (hiddenCount > 0) {
			const index = visibleRects.length;
			const column = index % columns;
			const row = Math.floor(index / columns);
			tiles.push({
				id: "dense-tail-more",
				label: `+${hiddenCount} more`,
				caption: "Enable pagination to reveal every tiny node",
				color: "rgba(15,23,42,0.84)",
				legendIndex: 0,
				x: padding + column * (tileSize + gap),
				y: padding + row * (tileSize + gap),
				size: tileSize,
			});
		}

		return {
			bounds,
			tiles,
			hiddenCount,
		};
	}, [paginationEnabled, rectangles]);
	const previewNode = hoveredNode ?? resolvedActiveNode;
	const topModules = useMemo(
		() =>
			collectTreemapModules(resolvedActiveNode)
				.sort((left, right) => right.size - left.size)
				.slice(0, 6),
		[resolvedActiveNode],
	);
	const pageForNodeId = (nodeId: string) => {
		const index = sortedVisibleNodes.findIndex((node) => node.id === nodeId);
		if (index < 0) {
			return 0;
		}

		return Math.floor(index / TREEMAP_PAGE_SIZE);
	};

	const handleRectClick = (node: TreemapTreeNode) => {
		updateTreemapSearch({ selected: node.id });
		if (node.children.length > 0) {
			updateTreemapSearch({ focus: node.id, page: 0, selected: node.id });
		}
	};

	const handleDenseTileClick = (nodeId: string) => {
		updateTreemapSearch({
			paginate: true,
			page: pageForNodeId(nodeId),
			selected: nodeId,
		});
	};

	const handleNavigateTo = (nodeId: string) => {
		updateTreemapSearch({ focus: nodeId, page: 0, selected: nodeId });
	};

	const pageEnd = Math.min(sortedVisibleNodes.length, pageStart + TREEMAP_PAGE_SIZE);

	return (
		<ModvizLayout projectTitle={bundle.projectTitle}>
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
						<Button asChild variant="outline" size="sm">
							<Link to="/explorer" search={explorerSearch}>
								<ExternalLink className="size-4" />
								Open current view in explorer
							</Link>
						</Button>
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
					<div className="mb-4 flex min-h-[84px] flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200/70 bg-white/80 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-950/40">
						<div>
							<p className="font-medium text-slate-900 dark:text-slate-100">
								{paginationEnabled
									? totalPages > 1
										? "Dense level detected"
										: "Single-page level"
									: "Global overview enabled"}
							</p>
							<p className="text-slate-500 dark:text-slate-400">
								{paginationEnabled
									? totalPages > 1
										? `Showing ${pageStart + 1}-${pageEnd} of ${sortedVisibleNodes.length} nodes so each page stays readable.`
										: `Showing all ${sortedVisibleNodes.length} nodes on a single page.`
									: `Showing all ${sortedVisibleNodes.length} nodes at once for a full branch overview.`}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateTreemapSearch(
										{ paginate: !paginationEnabled, page: 0 },
										{ replace: true },
									)
								}
							>
								{paginationEnabled ? "Show global overview" : "Enable pagination"}
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateTreemapSearch(
										{ page: Math.max(0, pageIndex - 1) },
										{ replace: true },
									)
								}
								disabled={!paginationEnabled || totalPages <= 1 || pageIndex === 0}
							>
								Previous page
							</Button>
							<span className="min-w-24 px-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
								{paginationEnabled ? `Page ${pageIndex + 1} / ${totalPages}` : "All nodes visible"}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									updateTreemapSearch(
										{ page: Math.min(totalPages - 1, pageIndex + 1) },
										{ replace: true },
									)
								}
								disabled={!paginationEnabled || totalPages <= 1 || pageIndex >= totalPages - 1}
							>
								Next page
							</Button>
						</div>
					</div>
					<div className="relative aspect-[5/3] w-full overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
						<svg
							viewBox={`0 0 ${TREEMAP_LAYOUT_WIDTH} ${TREEMAP_LAYOUT_HEIGHT}`}
							className="absolute inset-0 h-full w-full"
						>
						{rectangles.map((rect) => {
							if (denseTailGrid && isDenseTailRect(rect)) {
								return null;
							}

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
									{rect.inlineLabel && (
										<foreignObject
											x={rect.x + 14}
											y={rect.y + 36}
											width={Math.max(0, rect.width - 28)}
											height={Math.max(0, rect.height - 50)}
										>
											<div className="flex h-full flex-col justify-between overflow-hidden text-white">
												<div>
													<div
														className="space-y-0 text-sm font-semibold"
														style={{ lineHeight: `${TITLE_LINE_HEIGHT}px` }}
													>
														{rect.inlineLabel.titleLines.map((line, index) => (
															<p
																key={`${rect.id}-title-${index}`}
																className="overflow-hidden text-ellipsis whitespace-nowrap"
															>
																{line}
															</p>
														))}
													</div>
													<div
														className="mt-1 space-y-0 text-xs opacity-90"
														style={{ lineHeight: `${CAPTION_LINE_HEIGHT}px` }}
													>
														{rect.inlineLabel.captionLines.map((line, index) => (
															<p
																key={`${rect.id}-caption-${index}`}
																className="overflow-hidden text-ellipsis whitespace-nowrap"
															>
																{line}
															</p>
														))}
													</div>
												</div>
												{rect.inlineLabel.hintLines.length > 0 && (
													<div
														className="space-y-0 text-[11px] opacity-80"
														style={{ lineHeight: `${HINT_LINE_HEIGHT}px` }}
													>
														{rect.inlineLabel.hintLines.map((line, index) => (
															<p
																key={`${rect.id}-hint-${index}`}
																className="overflow-hidden text-ellipsis whitespace-nowrap"
															>
																{line}
															</p>
														))}
													</div>
												)}
											</div>
										</foreignObject>
									)}
								</g>
							);
						})}
						</svg>
						<div className="pointer-events-none absolute inset-0">
							{rectangles
								.filter((rect) => !rect.inlineLabel)
								.filter((rect) => !(denseTailGrid && isDenseTailRect(rect)))
								.map((rect) => (
									<div
										key={`${rect.id}-overlay`}
										className="pointer-events-auto absolute"
										style={getOverlayStyle(
											rect.x + 2,
											rect.y + 2,
											Math.max(0, rect.width - 4),
											Math.max(0, rect.height - 4),
										)}
									>
										<Tooltip lazyMount openDelay={70} closeDelay={0}>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="block h-full w-full rounded-[10px]"
													onClick={() => handleRectClick(rect.node)}
													onMouseEnter={() => setHoveredNodeId(rect.node.id)}
													onMouseLeave={() =>
														setHoveredNodeId((current) =>
															current === rect.node.id ? null : current,
														)
													}
													aria-label={`Open ${getNodeTitle(rect.node)}`}
												/>
											</TooltipTrigger>
											<Portal>
												<TooltipContent className="max-w-80">
													<div className="space-y-1">
														<p className="font-semibold">#{rect.legendIndex} {getNodeTitle(rect.node)}</p>
														<p className="text-xs opacity-80">{getNodeSubtitle(rect.node)}</p>
														<p className="text-xs opacity-80">{getRectCaption(rect.node)}</p>
													</div>
												</TooltipContent>
											</Portal>
										</Tooltip>
									</div>
								))}
							{denseTailGrid && (
								<div
									className="pointer-events-auto absolute"
									style={getOverlayStyle(
										denseTailGrid.bounds.x,
										denseTailGrid.bounds.y,
										denseTailGrid.bounds.width,
										denseTailGrid.bounds.height,
									)}
								>
									<div className="relative h-full w-full rounded-[16px] border border-white/75 bg-white/18 p-1 shadow-[0_12px_32px_-22px_rgba(15,23,42,0.55)] backdrop-blur-[1px] dark:border-slate-700/80 dark:bg-slate-950/12">
										{denseTailGrid.tiles.map((tile) => {
											if (tile.id === "dense-tail-more") {
												return (
													<button
														key={tile.id}
														type="button"
														onClick={() => updateTreemapSearch({ paginate: true, page: 0 }, { replace: true })}
														className="absolute flex items-center justify-center rounded-[10px] text-[10px] font-semibold text-white shadow-sm transition hover:scale-[1.03]"
														style={{
															left: tile.x,
															top: tile.y,
															width: tile.size,
															height: tile.size,
															backgroundColor: tile.color,
														}}
													>
														+{denseTailGrid.hiddenCount}
													</button>
												);
											}

											return (
												<Tooltip key={tile.id} lazyMount openDelay={70} closeDelay={0}>
													<TooltipTrigger asChild>
														<button
															type="button"
															onClick={() => handleDenseTileClick(tile.id)}
															className="absolute rounded-[10px] border border-white/80 shadow-sm transition hover:scale-[1.03]"
															style={{
																left: tile.x,
																top: tile.y,
																width: tile.size,
																height: tile.size,
																backgroundColor: tile.color,
															}}
															aria-label={`Open ${tile.label}`}
														/>
													</TooltipTrigger>
													<Portal>
														<TooltipContent className="max-w-80">
															<div className="space-y-1">
																<p className="font-semibold">#{tile.legendIndex} {tile.label}</p>
																<p className="text-xs opacity-80">{tile.caption}</p>
															</div>
														</TooltipContent>
													</Portal>
												</Tooltip>
											);
										})}
									</div>
								</div>
							)}
						</div>
					</div>
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
							{paginationEnabled
								? "Tiny tiles are numbered to match this page of the list."
								: "Tiny tiles are numbered to match the full list below."}
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
												onClick={() => updateTreemapSearch({ selected: node.id })}
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
