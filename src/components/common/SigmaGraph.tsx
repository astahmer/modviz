import {
	useLoadGraph,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import Graph, { DirectedGraph } from "graphology";
import { useCallback, useEffect, useState } from "react";
import type { ModvizOutput } from "../../../mod/types";

type NodeType = {
	x: number;
	y: number;
	label: string;
	size: number;
	color: string;
	highlighted?: boolean;
	hidden?: boolean;
};
type EdgeType = { label: string };

const clamp = (min: number, max: number, value: number) => {
	return Math.min(Math.max(min, value), max);
};

export const SigmaGraph = (props: {
	disableHoverEffect?: boolean;
	nodes: ModvizOutput["nodes"];
	edges: ModvizOutput["edges"];
}) => {
	const makeGraph = useCallback(() => {
		const graph = new DirectedGraph<NodeType>();
		const nodes = new Set<string>();
		const edges = new Set<string>();

		props.nodes.forEach((node) => {
			nodes.add(node.path);
			graph.addNode(node.path, {
				// Set random initial position cause some algorithms (e.g. forceAtlas2) don't work well without it
				x: Math.random(),
				y: Math.random(),
				label: node.name,
				color: node.type === "entry" ? "blue" : "#E2E2E2",
				size: clamp(4, 25, node.importees.length * 2),
				highlighted: false,
				// hidden: true,
			});
		});

		props.edges.forEach((edge) => {
			const edgeId = `${edge.source}->${edge.target}`;
			if (
				nodes.has(edge.source) &&
				nodes.has(edge.target) &&
				!edges.has(edgeId)
			) {
				edges.add(edgeId);
				graph.addEdge(edge.source, edge.target, {
					label: edge.source,
				});
			}
		});
		return graph as Graph<NodeType, EdgeType>;
	}, []);

	const sigma = useSigma<NodeType, EdgeType>();
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const loadGraph = useLoadGraph<NodeType, EdgeType>();
	const [hoveredNode, setHoveredNode] = useState<string | null>(null);

	/**
	 * When component mount
	 * => load the graph
	 */
	useEffect(() => {
		// Create & load the graph
		const graph = makeGraph();
		loadGraph(graph);

		// Register the events
		registerEvents({
			enterNode: (event) => setHoveredNode(event.node),
			leaveNode: () => setHoveredNode(null),
		});
	}, [loadGraph, registerEvents, makeGraph]);

	/**
	 * When component mount or hovered node change
	 * => Setting the sigma reducers
	 */
	useEffect(() => {
		setSettings({
			nodeReducer: (node, data) => {
				const graph = sigma.getGraph();
				const newData = {
					...data,
					highlighted: data.highlighted || false,
					// hidden: false,
				};

				if (!hoveredNode) {
					if (
						node === hoveredNode ||
						graph.neighbors(hoveredNode).includes(node)
					) {
						newData.highlighted = true;
						newData.color = "#FA4F40";
					} else {
						newData.color = "#E2E2E2";
						newData.highlighted = false;
					}
				}
				return newData;
			},
			edgeReducer: (edge, data) => {
				const graph = sigma.getGraph();
				const newData = { ...data, hidden: false };

				if (hoveredNode && !graph.extremities(edge).includes(hoveredNode)) {
					newData.hidden = true;
				}
				return newData;
			},
		});
	}, [hoveredNode, setSettings, sigma]);

	return null;
};
