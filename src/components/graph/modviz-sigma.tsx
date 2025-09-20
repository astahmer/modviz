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
import { Leva, levaStore } from "leva";
import { useEffect, useMemo, useState } from "react";
import type Sigma from "sigma";
import type { Coordinates } from "sigma/types";
import { NodeDetailsModal } from "~/components/dialog/dialog";
import { SigmaGraph } from "~/components/graph/common/render-sigma-graph";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
} from "~/components/graph/common/use-graph-atoms";
import { GraphCommandMenuDialog } from "~/components/graph/graph-command-menu";
import { inferPathsLabel } from "~/utils/infer-paths-label";
import type { ModvizOutput } from "../../../mod/types";

export const ModvizSigma = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const [sigma, setSigma] = useState<Sigma<NodeType, EdgeType> | null>(null);
	return (
		<SigmaContainer
			ref={setSigma}
			className="h-full w-full"
			settings={{ allowInvalidContainer: true }}
		>
			<SigmaGraph
				entryNode={props.entryNode}
				packages={props.packages}
				nodes={props.nodes}
			/>
			{sigma && (
				<WithGraph
					sigma={sigma as never}
					nodes={props.nodes}
					entryNode={props.entryNode}
				/>
			)}
		</SigmaContainer>
	);
};

const WithGraph = (props: {
	entryNode?: string;
	sigma: Sigma<NodeType, EdgeType>;
	nodes: ModvizOutput["nodes"];
}) => {
	const sigma = props.sigma;
	const clusterMap = useClusterMap(sigma);
	const clusterList = useClusterList(clusterMap);
	useClusterLabelLayer(sigma, clusterMap);

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
											graph.forEachNode((nodeId) => {
												if (cluster.nodes.includes(nodeId)) {
													graph.setNodeAttribute(nodeId, "highlighted", true);
												}
											});
										}}
										onMouseLeave={() => {
											graph.forEachNode((nodeId) => {
												graph.setNodeAttribute(nodeId, "highlighted", false);
											});
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
			<Leva collapsed hidden />

			<NodeDetailsModal />
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
					return;
				}

				map.set(attrs.cluster, {
					name: attrs.cluster,
					path: attrs.clusterPath ?? "",
					nodes: [nodeId],
					positions: [{ x: attrs.x, y: attrs.y }],
					color: attrs.color,
				});
			});

			map.forEach((cluster) => {
				const pathsLabel = inferPathsLabel(
					cluster.nodes.map((path) => path.replace(cluster.path, "")),
				);
				if (pathsLabel) {
					cluster.inferredName = pathsLabel;
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
) => {
	const hideClusterLabels = levaStore.useStore(
		(s) => (s.data.hideClusterLabels as any).value,
	);

	useEffect(() => {
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
			"absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden data-hovered:hidden data-hidden:hidden";
		let clusterLabelsDoms = "";
		clusterMap.forEach((cluster) => {
			if (cluster.nodes.length < 5) return;
			const viewportPos = sigma.graphToViewport(cluster as Coordinates);
			clusterLabelsDoms += `<div id='${cluster.name}' class="absolute -translate-1/2 -translate-y-1/2 text-shadow-md text-2xl" style="top:${viewportPos.y}px;left:${viewportPos.x}px;color:${cluster.color}">${cluster.inferredName || cluster.name}</div>`;
		});
		layer.innerHTML = clusterLabelsDoms;

		// insert the layer underneath the hovers layer
		if (!hasLayer) {
			const container = sigma.getContainer();
			container.insertBefore(layer, container.querySelector(".sigma-hovers"));
		}

		// Clusters labels position needs to be updated on each render
		const listener = () => {
			clusterMap.forEach((cluster) => {
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
	}, [clusterMap, hideClusterLabels]);
};
