import {
	ControlsContainer,
	FullScreenControl,
	SigmaContainer,
	useCamera,
	ZoomControl,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import "@react-sigma/graph-search/lib/style.css";
import { MiniMap } from "@react-sigma/minimap";
import { fitViewportToNodes } from "@sigma/utils";
import { useAtom } from "@xstate/store/react";
import { useEffect, useMemo, useState } from "react";
import type Sigma from "sigma";
import type { Coordinates } from "sigma/types";
import { NodeDetailsModal } from "~/components/dialog/dialog";
import { clamp } from "~/components/graph/common/clamp";
import type { GraphLayoutSettings } from "~/components/graph/common/graph-layout-settings";
import { SigmaGraph } from "~/components/graph/common/render-sigma-graph";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
import { Button } from "~/components/ui/button";
import { LoadingState } from "~/components/ui/loading-state";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
	hoveredClusterNameAtom,
} from "~/components/graph/common/use-graph-atoms";
import { GraphCommandMenuDialog } from "~/components/graph/graph-command-menu";
import { inferPathsLabel } from "~/utils/infer-paths-label";
import type { ModvizOutput } from "../../../mod/types";
import type { ExternalGroupingMode } from "~/utils/modviz-data";

export const ModvizSigma = (props: {
	output: ModvizOutput;
	entryNode?: string;
	externalGrouping?: ExternalGroupingMode;
	layoutSettings: GraphLayoutSettings;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	isBusy?: boolean;
	cancelNonce?: number;
	onCancelUpdate?: () => void;
	onBusyChange?: (isBusy: boolean) => void;
}) => {
	const [sigma, setSigma] = useState<Sigma<NodeType, EdgeType> | null>(null);
	return (
		<SigmaContainer
			ref={setSigma}
			className="relative h-full w-full"
			settings={{ allowInvalidContainer: true }}
		>
			<SigmaGraph
				entryNode={props.entryNode}
				externalGrouping={props.externalGrouping}
				layoutSettings={props.layoutSettings}
				packages={props.packages}
				nodes={props.nodes}
				cancelNonce={props.cancelNonce}
				onBusyChange={props.onBusyChange}
			/>
			{props.isBusy ? (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-white/72 backdrop-blur-[1.5px] dark:bg-slate-950/72">
					<div className="pointer-events-auto flex min-w-[18rem] flex-col items-center gap-4 rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-[0_18px_48px_-32px_rgba(15,23,42,0.65)] dark:border-slate-800 dark:bg-slate-950/90">
						<LoadingState
							label="Updating graph…"
							description="Rebuilding the dependency map and running the layout in the background."
							className="min-h-0"
						/>
						{props.onCancelUpdate ? (
							<Button variant="outline" size="sm" onClick={props.onCancelUpdate}>
								Cancel update
							</Button>
						) : null}
					</div>
				</div>
			) : null}
			{sigma && (
				<WithGraph
					hideClusterLabels={props.layoutSettings.hideClusterLabels}
					output={props.output}
					sigma={sigma as never}
					nodes={props.nodes}
					externalGrouping={props.externalGrouping}
					entryNode={props.entryNode}
				/>
			)}
		</SigmaContainer>
	);
};

const WithGraph = (props: {
	entryNode?: string;
	externalGrouping?: ExternalGroupingMode;
	hideClusterLabels: boolean;
	output: ModvizOutput;
	sigma: Sigma<NodeType, EdgeType>;
	nodes: ModvizOutput["nodes"];
}) => {
	const sigma = props.sigma;
	const clusterMap = useClusterMap(sigma);
	const clusterList = useClusterList(clusterMap);
	const externalNodeIds = useMemo(
		() =>
			props.nodes
				.filter((node) => node.path.includes("node_modules"))
				.map((node) => node.path),
		[props.nodes],
	);
	useClusterLabelLayer(sigma, clusterMap, props.hideClusterLabels);

	const graph = sigma.getGraph();
	const nodes = graph.nodes();

	return (
		<>
			<ControlsContainer position={"bottom-right"} className="mb-6">
				<ZoomControl />
				<FullScreenControl />
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-left"} className="z-10!">
				<div className="flex flex-col gap-2 text-xs p-2">
					<button
						className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 bg-white"
						onClick={() => {
							fitViewportToNodes(sigma as never, nodes, {
								animate: true,
							});
						}}
					>
						Reset view ({nodes.length} nodes)
					</button>
					{props.entryNode && (
						<button
							className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 bg-white"
							onClick={() => {
								fitViewportToNodes(sigma as never, [props.entryNode!], {
									animate: true,
								});
							}}
							title={props.entryNode}
						>
							Focus entrypoint
						</button>
					)}
					{props.externalGrouping === "package" && externalNodeIds.length ? (
						<button
							className="flex items-center gap-2 rounded-md bg-white px-2 py-1 hover:bg-gray-100"
							onClick={() => {
								fitViewportToNodes(sigma as never, externalNodeIds, {
									animate: true,
								});
							}}
						>
							node_modules ({externalNodeIds.length})
						</button>
					) : null}
					<div className="overflow-auto max-h-[300px] flex flex-col gap-2">
						{clusterList
							.filter((cluster) => cluster.nodes.length > 5)
							.map((cluster) => {
								return (
									<button
										key={cluster.name}
										title={cluster.path}
										className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100"
										onClick={() => {
											fitViewportToNodes(
												sigma as never,
												graph.filterNodes(
													(_, attrs) => attrs.cluster === cluster.name,
												),
												{ animate: true },
											);
										}}
										onMouseEnter={() => {
											hoveredClusterNameAtom.set(cluster.name);
										}}
										onMouseLeave={() => {
											hoveredClusterNameAtom.set(null);
										}}
									>
										<div
											className="w-2 h-2"
											style={{ backgroundColor: cluster.color }}
										/>
										{cluster.inferredName || cluster.name}(
										{cluster.nodes.length})
									</button>
								);
							})}
					</div>
				</div>

				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<GraphCommandMenuDialog
				nodes={props.nodes}
				onHighlight={(value) => {
					if (!value) return highlightedNodeIdAtom.set(null);

					const node = props.nodes.find((node) => node.path === value);
					if (!node) return;
					highlightedNodeIdAtom.set(value);
				}}
				onSelect={(value) => {
					highlightedNodeIdAtom.set(null);

					if (!value) {
						return focusedNodeIdAtom.set(null);
					}

					const node = props.nodes.find((node) => node.path === value);
					if (!node) return;
					if (focusedNodeIdAtom.get() === value)
						return focusedNodeIdAtom.set(null);

					focusedNodeIdAtom.set(value);
				}}
			/>

			<ControlsContainer position={"bottom-left"}>
				<MiniMap width="100px" height="100px" />
			</ControlsContainer>

			<NodeDetailsModal output={props.output} />
			<MoveToHighlightedNode />
		</>
	);
};

const MoveToHighlightedNode = () => {
	const { gotoNode } = useCamera();
	const highlightedNodeId = useAtom(highlightedNodeIdAtom);

	/**
	 * When the selected item changes, highlighted the node and center the camera on it.
	 */
	useEffect(() => {
		if (!highlightedNodeId) return;
		gotoNode(highlightedNodeId);
	}, [highlightedNodeId, gotoNode]);

	return null;
};

interface Cluster {
	name: string;
	inferredName?: string;
	isExternal?: boolean;
	path: string;
	x?: number;
	y?: number;
	color?: string;
	positions: { x: number; y: number }[];
	nodes: string[];
}

const useClusterMap = (sigma: Sigma<NodeType, EdgeType>) => {
	const [clusterMap, setClusterMap] = useState<Map<string, Cluster>>(
		() => new Map<string, Cluster>(),
	);

	useEffect(() => {
		const listener = () => {
			const map = new Map<string, Cluster>();
			map.clear();

			const graph = sigma.getGraph();
			graph.forEachNode((nodeId, attrs) => {
				if (!attrs.cluster) return;
				const cluster = map.get(attrs.cluster);
				if (cluster) {
					cluster.nodes.push(nodeId);
					cluster.positions.push({ x: attrs.x, y: attrs.y });
					cluster.isExternal = cluster.isExternal || attrs.modType === "external";
					return;
				}

				map.set(attrs.cluster, {
					name: attrs.cluster,
					isExternal: attrs.modType === "external",
					path: attrs.clusterPath ?? "",
					nodes: [nodeId],
					positions: [{ x: attrs.x, y: attrs.y }],
					color: attrs.color,
				});
			});

			map.forEach((cluster) => {
				if (!cluster.isExternal) {
					const pathsLabel = inferPathsLabel(
						cluster.nodes.map((path) => path.replace(cluster.path, "")),
					);
					if (pathsLabel) {
						cluster.inferredName = pathsLabel;
					}
				}

				// calculate the cluster's nodes barycenter to use this as cluster label position
				cluster.x =
					cluster.positions.reduce((acc, p) => acc + p.x, 0) /
					cluster.positions.length;
				cluster.y =
					cluster.positions.reduce((acc, p) => acc + p.y, 0) /
					cluster.positions.length;
			});

			setClusterMap(map);
		};

		sigma.addListener("afterProcess", listener);
		return () => {
			sigma.removeListener("afterProcess", listener);
		};
	}, [sigma]);

	return clusterMap;
};

const useClusterList = (clusterMap: Map<string, Cluster>) => {
	return useMemo(() => {
		const clusterList = Array.from(clusterMap.entries())
			.sort((a, b) => {
				const res = b[1].nodes.length - a[1].nodes.length;
				return res !== 0 ? res : a[0].localeCompare(b[0]);
			})
			.map(([_name, cluster]) => cluster);
		return clusterList;
	}, [clusterMap]);
};

const useClusterLabelLayer = (
	sigma: Sigma<NodeType, EdgeType>,
	clusterMap: Map<string, Cluster>,
	hideClusterLabels: boolean,
) => {
	useEffect(() => {
		const visibleClusters = Array.from(clusterMap.values())
			.filter((cluster) => cluster.nodes.length >= 8)
			.sort((left, right) => right.nodes.length - left.nodes.length)
			.slice(0, 24);
		let layer = document.getElementById("cluster-label-layers")!;
		const hasLayer = Boolean(layer);
		if (!hasLayer) {
			layer = document.createElement("div");
		}

		layer.id = "cluster-label-layers";
		layer.dataset.hidden = hideClusterLabels ? "true" : undefined;
		if (hideClusterLabels) {
			layer.dataset.hidden = "true";
		} else {
			delete layer.dataset.hidden;
		}

		layer.className =
			"absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden data-hidden:hidden";
		let clusterLabelsDoms = "";
		visibleClusters.forEach((cluster) => {
			const viewportPos = sigma.graphToViewport(cluster as Coordinates);
			const fontSize = clamp(14, 28, 10 + Math.log2(cluster.nodes.length) * 3);
			clusterLabelsDoms += `<div id='${cluster.name}' class="absolute -translate-1/2 -translate-y-1/2 text-shadow-md font-semibold whitespace-nowrap" style="top:${viewportPos.y}px;left:${viewportPos.x}px;color:${cluster.color};font-size:${fontSize}px;background:color-mix(in srgb, white 78%, transparent);padding:2px 8px;border-radius:999px;backdrop-filter:blur(2px);opacity:0.92">${cluster.inferredName || cluster.name}</div>`;
		});
		layer.innerHTML = clusterLabelsDoms;

		// insert the layer underneath the hovers layer
		if (!hasLayer) {
			const container = sigma.getContainer();
			container.insertBefore(layer, container.querySelector(".sigma-hovers"));
		}

		// Clusters labels position needs to be updated on each render
		const listener = () => {
			visibleClusters.forEach((cluster) => {
				const clusterLabel = document.getElementById(cluster.name);
				if (clusterLabel) {
					// update position from the viewport
					const viewportPos = sigma.graphToViewport(cluster as Coordinates);
					clusterLabel.style.top = `${viewportPos.y}px`;
					clusterLabel.style.left = `${viewportPos.x}px`;
				}
			});
		};
		sigma.on("afterRender", listener);

		return () => {
			sigma.off("afterRender", listener);
		};
	}, [clusterMap, hideClusterLabels, sigma]);
};
