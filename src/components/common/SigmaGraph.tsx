import {
	useLoadGraph,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import Graph, { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import iwanthue from "iwanthue";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ModvizOutput, VizNode } from "../../../mod/types";

type NodeType = {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	highlighted?: boolean;
	hidden?: boolean;
	cluster?: string;
	type?: string;
	louvainCommunity?: string;
};
type EdgeType = { label: string; hidden?: boolean; color?: string };

const clamp = (min: number, max: number, value: number) => {
	return Math.min(Math.max(min, value), max);
};

const colorList = [
	"#5E6BFF",
	"#FE2FB5",
	"#B752F8",
	"#F85252",
	"#b9cfd4",
	"#A5243D",
	"#edcf8e",
	"#C28CAE",
	"#54457F",
	"#610F7F",
	"#9BA2FF",
	"#2A2E45",
	"#FFDC5E",
	"#FF86C8",
	"#FF69EB",
	"#1CFEBA",
	"#034748",
	"#95F2D9",
];

const defaultColor = "#E2E2E2";

export const SigmaGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	edges: ModvizOutput["edges"];
}) => {
	const packageColors = useMemo(() => {
		const colors = new Map<string, string>();
		props.packages.forEach((pkg, index) => {
			colors.set(pkg.name, colorList[index] ?? randomColor());
		});
		return colors;
	}, [props.packages]);

	// Use ForceAtlas2 layout for better cluster positioning
	const { assign: assignLayout } = useLayoutForceAtlas2({
		iterations: 50,
		settings: {
			gravity: 1,
			scalingRatio: 10,
			strongGravityMode: true,
			slowDown: 10,
		},
	});

	// TODO
	// https://github.com/johnymontana/sigma-graph-examples/blob/a5fd18e992ce261ff5b309c87174a5032f67c071/src/components/examples/GraphSearchExample.tsx#L2

	// https://www.marvel-graphs.net/#/characters/
	// https://github.com/boogheta/Marvel/blob/e3ef5ef70acbaecd8a5150feea941f770638cf1d/spatialize-network.js
	const makeGraph = useCallback(() => {
		const graph = new DirectedGraph<NodeType>();
		const nodesMap = new Map<string, VizNode>();
		const edges = new Set<string>();

		const median = props.nodes
			.map((n) => n.importees.length)
			.sort((a, b) => a - b)[props.nodes.length / 2];
		const floorMedian = Math.floor(median);

		props.nodes.forEach((node) => {
			nodesMap.set(node.path, node);
			graph.addNode(node.path, {
				// Set random initial position cause some algorithms (e.g. forceAtlas2) don't work well without it
				x: props.entryNode === node.path ? 0.5 : Math.random(),
				y: props.entryNode === node.path ? 0.5 : Math.random(),
				label: node.name,
				// type: node.type,
				cluster: node.package?.name ?? "default",
				color:
					node.type === "entry"
						? "#637AB9"
						: (packageColors.get(node.package?.name ?? "") ?? defaultColor),
				size: clamp(floorMedian, floorMedian * 5, node.importees.length * 2),
				highlighted: false,
				// hidden: true,
			});
		});

		props.edges.forEach((edge) => {
			const edgeId = `${edge.source}->${edge.target}`;
			if (
				nodesMap.has(edge.source) &&
				nodesMap.has(edge.target) &&
				!edges.has(edgeId)
			) {
				edges.add(edgeId);

				const sourceNode = nodesMap.get(edge.source)!;
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
					color: packageColors.get(sourceNode.package?.name ?? "") ?? "#E2E2E2",
				});
			}
		});

		// Apply Louvain community detection for better clustering
		try {
			// First, detect communities using Louvain algorithm
			louvain.assign(graph, {
				// getEdgeWeight: "size",
				nodeCommunityAttribute: "louvainCommunity",
				resolution: 1.0, // Adjust resolution for cluster granularity
			});

			// Get all detected communities
			const communities = new Set<string>();
			graph.forEachNode((_, attrs) => {
				if (attrs.louvainCommunity) {
					communities.add(attrs.louvainCommunity);
				}
			});
			const communitiesArray = Array.from(communities);

			// Generate distinct colors for each community using iwanthue
			const communityPalette: Record<string, string> = {};
			if (communitiesArray.length > 0) {
				const communityColors = iwanthue(communitiesArray.length, {
					seed: "modviz-clusters",
					colorSpace: "intense",
					clustering: "force-vector",
				});

				communitiesArray.forEach((community, index) => {
					communityPalette[community] = communityColors[index] || randomColor();
				});
			}

			// Apply community colors to nodes, but preserve package-based coloring for entries
			graph.forEachNode((node, attrs) => {
				const currentAttrs = graph.getNodeAttributes(node);
				if (currentAttrs.type !== "entry" && attrs.louvainCommunity) {
					graph.setNodeAttribute(
						node,
						"color",
						communityPalette[attrs.louvainCommunity],
					);
				}
			});
		} catch (error) {
			console.warn(
				"Louvain clustering failed, falling back to package-based clustering:",
				error,
			);
		}

		return graph as Graph<NodeType, EdgeType>;
	}, [packageColors]);

	const sigma = useSigma<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const loadGraph = useLoadGraph<NodeType, EdgeType>();

	const [hoveredNode, setHoveredNode] = useState<string | null>(null);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	/**
	 * When component mount
	 * => load the graph
	 */
	useEffect(() => {
		// Create & load the graph
		const graph = makeGraph();
		loadGraph(graph);

		// Apply ForceAtlas2 layout to position clusters better
		setTimeout(() => {
			try {
				assignLayout();
				console.log("Applied ForceAtlas2 layout for cluster positioning");
			} catch (error) {
				console.warn("Failed to apply layout:", error);
			}
		}, 100); // Small delay to ensure graph is fully loaded

		// Register the events
		registerEvents({
			enterNode: (event) => setHoveredNode(event.node),
			leaveNode: () => setHoveredNode(null),
			downNode: (event) =>
				setSelectedNode((current) =>
					current === event.node ? null : event.node,
				),
			clickStage: () => setSelectedNode(null),
		});
	}, [loadGraph, registerEvents, makeGraph, assignLayout]);

	/**
	 * When component mount or hovered node change
	 * => Setting the sigma reducers
	 */
	useEffect(() => {
		const activeNode = selectedNode ?? hoveredNode;
		setSettings({
			nodeReducer: (node, data) => {
				const graph = sigma.getGraph();
				const newData = {
					...data,
					highlighted: data.highlighted || false,
					// hidden: false,
				};

				if (activeNode) {
					if (node === activeNode) {
						newData.size = clamp(data.size, 30, data.size + 15);
					}

					if (
						node === activeNode ||
						graph.neighbors(activeNode).includes(node)
					) {
						newData.highlighted = true;

						if (activeNode !== props.entryNode) {
							newData.color = "#FA4F40";
						}
					} else {
						newData.color = defaultColor;
						newData.highlighted = false;
						newData.label = "";
					}
				}
				return newData;
			},
			edgeReducer: (edge, data) => {
				const graph = sigma.getGraph();
				const newData: EdgeType = { ...data, hidden: true };

				// Only show entry node edges if no node is hovered
				if (!activeNode && props.entryNode) {
					if (graph.extremities(edge).includes(props.entryNode)) {
						newData.hidden = false;
					}
				} else if (activeNode && graph.extremities(edge).includes(activeNode)) {
					// Otheriwse show hovered node edges
					newData.hidden = false;
					newData.color = "red";
				}

				return newData;
			},
		});
	}, [selectedNode, hoveredNode, setSettings, sigma, props.entryNode]);

	return null;
};

const randomColor = () => {
	const digits = "0123456789abcdef";
	let code = "#";
	for (let i = 0; i < 6; i++) {
		code += digits.charAt(Math.floor(Math.random() * 16));
	}
	return code;
};
