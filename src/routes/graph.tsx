import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "@xstate/store/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronRight, RotateCcw, Settings2 } from "lucide-react";
import { z } from "zod";
import { GraphCommandMenu } from "~/components/graph/graph-command-menu";
import {
	getDefaultGraphLayoutSettings,
	type GraphLayoutSettings,
} from "~/components/graph/common/graph-layout-settings";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
	isFocusedModalOpenedAtom,
	selectedNodeIdsAtom,
	selectionModeEnabledAtom,
} from "~/components/graph/common/use-graph-atoms";
import { GraphSettingsPanel } from "~/components/graph/graph-settings-panel";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { SetupView } from "~/components/modviz/setup-view";
import { Button } from "~/components/ui/button";
import { LoadingState } from "~/components/ui/loading-state";
import {
	filterNodesByScope,
	getNodeGroupingLabel,
	getWorkspacePackageNames,
	isModvizBundleReady,
	type ExternalGroupingMode,
	type ModvizScope,
	useModvizBundle,
} from "~/utils/modviz-data";
import { parseSearchParam } from "~/utils/search-params";

const Sigma = lazy(() =>
	import("~/components/graph/modviz-sigma").then((module) => ({
		default: module.ModvizSigma,
	})),
);

type GraphSearch = {
	adjustSizes: boolean;
	cluster: string;
	externalGrouping: ExternalGroupingMode;
	focus: string;
	gravity: number;
	hideClusterLabels: boolean;
	iterations: number;
	linLogMode: boolean;
	nodeSizeScale: number;
	outboundAttractionDistribution: boolean;
	scalingRatio: number;
	scope: ModvizScope;
	strongGravityMode: boolean;
};

const validateGraphSearch = (search: Record<string, unknown>): GraphSearch => {
	const defaults = getDefaultGraphLayoutSettings(3961);
	return {
		adjustSizes: parseSearchParam.boolean(search.adjustSizes, defaults.adjustSizes),
		cluster: parseSearchParam.string(search.cluster),
		externalGrouping:
			search.externalGrouping === "combined" ? "combined" : "package",
		focus: parseSearchParam.string(search.focus),
		gravity: parseSearchParam.number(search.gravity, defaults.gravity),
		hideClusterLabels: parseSearchParam.boolean(search.hideClusterLabels, defaults.hideClusterLabels),
		iterations: Math.round(parseSearchParam.number(search.iterations, defaults.iterations)),
		linLogMode: parseSearchParam.boolean(search.linLogMode, defaults.linLogMode),
		nodeSizeScale: parseSearchParam.number(search.nodeSizeScale, defaults.nodeSizeScale),
		outboundAttractionDistribution: parseSearchParam.boolean(
			search.outboundAttractionDistribution,
			defaults.outboundAttractionDistribution,
		),
		scalingRatio: parseSearchParam.number(search.scalingRatio, defaults.scalingRatio),
		scope:
			search.scope === "workspace" || search.scope === "external"
				? search.scope
				: "all",
		strongGravityMode: parseSearchParam.boolean(search.strongGravityMode, defaults.strongGravityMode),
	};
};

export const Route = createFileRoute("/graph")({
	ssr: false,
	validateSearch: validateGraphSearch,
	component: GraphRoute,
});

function GraphRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [refreshNonce, setRefreshNonce] = useState(0);
	const focusedValue = useAtom(focusedNodeIdAtom);
	const isFocusedModalOpened = useAtom(isFocusedModalOpenedAtom);
	const selectionModeEnabled = useAtom(selectionModeEnabledAtom);
	const selectedNodeIds = useAtom(selectedNodeIdsAtom);

	if (!isModvizBundleReady(bundle)) {
		return (
			<ModvizLayout title="Bubble Graph" description="Force-directed cluster view for spatial exploration.">
				<SetupView bundle={bundle} />
			</ModvizLayout>
		);
	}

	const workspacePackageNames = useMemo(
		() => getWorkspacePackageNames(bundle.graph),
		[bundle.graph],
	);
	const defaultLayoutSettings = useMemo(
		() => getDefaultGraphLayoutSettings(bundle.graph.nodes.length),
		[bundle.graph.nodes.length],
	);
	const layoutSettings = useMemo<GraphLayoutSettings>(
		() => ({
			adjustSizes: search.adjustSizes,
			gravity: search.gravity || defaultLayoutSettings.gravity,
			hideClusterLabels: search.hideClusterLabels,
			iterations: search.iterations || defaultLayoutSettings.iterations,
			linLogMode: search.linLogMode,
			nodeSizeScale: search.nodeSizeScale || defaultLayoutSettings.nodeSizeScale,
			outboundAttractionDistribution: search.outboundAttractionDistribution,
			scalingRatio: search.scalingRatio || defaultLayoutSettings.scalingRatio,
			strongGravityMode: search.strongGravityMode,
		}),
		[defaultLayoutSettings, search],
	);
	const scope = search.scope as ModvizScope;
	const externalGrouping = search.externalGrouping as ExternalGroupingMode;
	const filteredByScope = useMemo(
		() => filterNodesByScope(bundle.graph.nodes, workspacePackageNames, scope),
		[bundle.graph.nodes, scope, workspacePackageNames],
	);
	const filteredNodes = useMemo(() => {
		if (!search.cluster) {
			return filteredByScope;
		}

		return filteredByScope.filter(
			(node) =>
				getNodeGroupingLabel(node, workspacePackageNames, externalGrouping) ===
				search.cluster,
		);
	}, [externalGrouping, filteredByScope, search.cluster, workspacePackageNames]);
	const sigmaKey = useMemo(
		() =>
			JSON.stringify({
				cluster: search.cluster,
				externalGrouping,
				layoutSettings,
				refreshNonce,
				scope,
			}),
		[externalGrouping, layoutSettings, refreshNonce, scope, search.cluster],
	);
	const updateSearch = (
		patch: Partial<GraphSearch>,
	) =>
		navigate({
			replace: true,
			search: (previous) => ({ ...previous, ...patch }),
		});

	useEffect(() => {
		if (!search.focus) {
			return;
		}

		highlightedNodeIdAtom.set(search.focus);
		focusedNodeIdAtom.set(search.focus);
	}, [search.focus]);

	return (
		<ModvizLayout
			title="Bubble Graph"
			description="Force-directed cluster view for spatial exploration. Open this only when you need the full graph canvas, then tune spacing and gravity from the floating settings panel."
			actions={
				<Button variant="outline" onClick={() => setSettingsOpen(true)}>
					<Settings2 className="size-4" />
					Layout settings
				</Button>
			}
		>
			<div className="flex h-[calc(100vh-14rem)] min-h-[680px] flex-col gap-4">
				<section className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					{([
						["all", "All nodes"],
						["workspace", "Monorepo only"],
						["external", "node_modules only"],
					] as const).map(([value, label]) => (
						<Button
							key={value}
							variant={scope === value ? "default" : "outline"}
							size="sm"
							onClick={() => updateSearch({ scope: value, cluster: "" })}
						>
							{label}
						</Button>
					))}
					<label className="ml-auto flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
						<span>External grouping</span>
						<select
							className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							value={externalGrouping}
							onChange={(event) =>
								updateSearch({
									cluster: "",
									externalGrouping: event.currentTarget
										.value as ExternalGroupingMode,
								})
							}
						>
							<option value="package">by package</option>
							<option value="combined">single node_modules cluster</option>
						</select>
					</label>
				</section>
				<section className="flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="min-w-[18rem] flex-1">
						<GraphCommandMenu
							nodes={filteredNodes}
							onHighlight={(value) => {
								if (!value) return highlightedNodeIdAtom.set(null);
								highlightedNodeIdAtom.set(value);
							}}
							onSelect={(value) => {
								highlightedNodeIdAtom.set(null);
									if (!value) return focusedNodeIdAtom.set(null);
									if (selectionModeEnabled) {
										selectedNodeIdsAtom.set((previous) =>
											previous.includes(value)
												? previous.filter((nodeId) => nodeId !== value)
												: [...previous, value],
										);
										return;
									}
								updateSearch({ focus: value });
								focusedNodeIdAtom.set(
									focusedNodeIdAtom.get() === value ? null : value,
								);
							}}
						/>
					</div>
					<Button
						variant={selectionModeEnabled ? "default" : "outline"}
						onClick={() => {
							selectionModeEnabledAtom.set(!selectionModeEnabled);
							if (selectionModeEnabled) {
								selectedNodeIdsAtom.set([]);
							}
						}}
					>
						Selection mode
					</Button>
					{selectionModeEnabled ? (
						<Button
							variant="outline"
							onClick={() => selectedNodeIdsAtom.set([])}
							disabled={selectedNodeIds.length === 0}
						>
							Clear selection ({selectedNodeIds.length})
						</Button>
					) : null}
					<Button
						variant="outline"
						onClick={() => setRefreshNonce((value) => value + 1)}
					>
						<RotateCcw className="size-4" />
						Refresh canvas
					</Button>
					{focusedValue ? (
						<Button
							variant="outline"
							onClick={() => focusedNodeIdAtom.set(null)}
						>
							<ChevronRight className="size-4" />
							{isFocusedModalOpened ? "Close details" : "Clear selection"}
						</Button>
					) : null}
					<div className="text-sm text-slate-500 dark:text-slate-400">
						{filteredNodes.length} nodes, {bundle.graph.metadata.packages.length} workspace packages
						{selectionModeEnabled && selectedNodeIds.length > 0 ? ` • ${selectedNodeIds.length} selected` : ""}
						{search.cluster ? ` • filtered to ${search.cluster}` : ""}
					</div>
				</section>
				<section className="min-h-0 flex-1 overflow-hidden rounded-[28px] border border-slate-200/70 bg-white/90 shadow-[0_20px_70px_-36px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<Suspense fallback={<LoadingState label="Loading graph…" description="Preparing the Sigma canvas and layout pass." />}>
						<Sigma
							key={sigmaKey}
							output={{ ...bundle.graph, nodes: filteredNodes }}
							entryNode={search.focus || bundle.graph.metadata.entrypoints[0]}
							externalGrouping={externalGrouping}
							layoutSettings={layoutSettings}
							packages={bundle.graph.metadata.packages}
							nodes={filteredNodes}
						/>
					</Suspense>
				</section>
			</div>
			<GraphSettingsPanel
				open={settingsOpen}
				settings={layoutSettings}
				onOpenChange={setSettingsOpen}
				onSettingsChange={(nextSettings) => updateSearch(nextSettings)}
				onReset={() => {
					void updateSearch(defaultLayoutSettings);
					return defaultLayoutSettings;
				}}
			/>
		</ModvizLayout>
	);
}
