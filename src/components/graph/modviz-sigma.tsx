import {
	ControlsContainer,
	FullScreenControl,
	SigmaContainer,
	ZoomControl,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { GraphSearch, GraphSearchOption } from "@react-sigma/graph-search";
import "@react-sigma/graph-search/lib/style.css";
import { MiniMap } from "@react-sigma/minimap";
import { fitViewportToNodes } from "@sigma/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Sigma from "sigma";
import type { Coordinates } from "sigma/types";
import { SigmaGraph } from "~/components/graph/common/render-sigma-graph";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
import { inferPathsLabel } from "~/utils/infer-paths-label";
import type { ModvizOutput } from "../../../mod/types";
import { FocusOnNode } from "./common/focus-on-node";
import { levaStore } from "leva";

export const ModvizSigma = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const [sigma, setSigma] = useState<Sigma<NodeType, EdgeType> | null>(null);
	return (
		<SigmaContainer ref={setSigma} className="h-full w-full">
			<SigmaGraph
				entryNode={props.entryNode}
				packages={props.packages}
				nodes={props.nodes}
			/>
			{sigma && <WithGraph sigma={sigma as never} />}
		</SigmaContainer>
	);
};

const WithGraph = (props: { sigma: Sigma<NodeType, EdgeType> }) => {
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [focusNode, setFocusNode] = useState<string | null>(null);

	const onFocus = useCallback((value: GraphSearchOption | null) => {
		if (value === null) setFocusNode(null);
		else if (value.type === "nodes") setFocusNode(value.id);
	}, []);

	const onChange = useCallback((value: GraphSearchOption | null) => {
		if (value === null) setSelectedNode(null);
		else if (value.type === "nodes") setSelectedNode(value.id);
	}, []);

	const postSearchResult = useCallback(
		(options: GraphSearchOption[]): GraphSearchOption[] => {
			return options.length <= 10
				? options
				: [
						...options.slice(0, 10),
						{
							type: "message",
							message: (
								<span className="text-center text-muted">
									And {options.length - 10} others
								</span>
							),
						},
					];
		},
		[],
	);

	const sigma = props.sigma;
	const clusterMap = useClusterMap(sigma);
	const clusterList = useClusterList(clusterMap);
	useClusterLabelLayer(sigma, clusterMap);

	const graph = sigma.getGraph();
	const nodes = graph.nodes();

	return (
		<>
			<FocusOnNode node={focusNode ?? selectedNode} />
			<ControlsContainer position={"bottom-right"} className="mb-6">
				<ZoomControl />
				<FullScreenControl />
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-left"}>
				<div className="flex flex-col flex-wrap gap-2 text-xs p-2">
					<button
						className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100"
						onClick={() => {
							fitViewportToNodes(sigma as never, nodes, {
								animate: true,
							});
						}}
					>
						Reset view ({nodes.length} nodes)
					</button>
					{clusterList
						.filter((cluster) => cluster.nodes.length > 5)
						.map((cluster) => {
							return (
								<button
									key={cluster.name}
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100"
									onClick={() => {
										fitViewportToNodes(
											sigma as never,
											graph.filterNodes(
												(_, attrs) => attrs.louvainCommunity === cluster.name,
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
									{cluster.inferredName || cluster.name}({cluster.nodes.length})
								</button>
							);
						})}
				</div>
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-right"}>
				<GraphSearch
					type="nodes"
					value={selectedNode ? { type: "nodes", id: selectedNode } : null}
					onFocus={onFocus}
					onChange={onChange}
					postSearchResult={postSearchResult}
				/>
			</ControlsContainer>

			<ControlsContainer position={"bottom-left"}>
				<MiniMap width="100px" height="100px" />
			</ControlsContainer>
		</>
	);
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
		const layer =
			document.getElementById("cluster-label-layers") ??
			document.createElement("div");
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
			clusterLabelsDoms += `<div id='${cluster.name}' class="absolute -translate-1/2 -translate-y-1/2 text-shadow-sm text-2xl" style="top:${viewportPos.y}px;left:${viewportPos.x}px;color:${cluster.color}">${cluster.inferredName || cluster.name}</div>`;
		});
		layer.innerHTML = clusterLabelsDoms;

		// insert the layer underneath the hovers layer
		const container = sigma.getContainer();
		container.insertBefore(layer, container.querySelector(".sigma-hovers"));

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
