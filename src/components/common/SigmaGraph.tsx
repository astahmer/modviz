import {
	useLoadGraph,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { useEffect, useState } from "react";
import {
	clamp,
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/common/use-graph";
import type { ModvizOutput } from "../../../mod/types";

const defaultColor = "#E2E2E2";

export const SigmaGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	// Use ForceAtlas2 layout for better cluster positioning
	const { assign: assignLayout } = useLayoutForceAtlas2({
		iterations: 300,
		settings: {
			scalingRatio: 10,
			strongGravityMode: true,
			slowDown: 10,
		},
	});

	const makeGraph = useCreateGraph(props);

	const sigma = useSigma<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const loadGraph = useLoadGraph<NodeType, EdgeType>();

	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	/** When component mount => load the graph + register events */
	useEffect(() => {
		// Create & load the graph
		const graph = makeGraph();
		loadGraph(graph);
		assignLayout();

		// Register the events
		registerEvents({
			enterNode: (event) => setHoveredNodeId(event.node),
			leaveNode: () => setHoveredNodeId(null),
			downNode: (event) =>
				setSelectedNodeId((current) =>
					current === event.node ? null : event.node,
				),
			clickStage: () => setSelectedNodeId(null),
		});
	}, [loadGraph, registerEvents, makeGraph, assignLayout]);

	/** When component mount or hovered node change => Setting the sigma reducers */
	useEffect(() => {
		const activeNodeId = selectedNodeId ?? hoveredNodeId;
		setSettings({
			nodeReducer: (nodeId, node) => {
				const graph = sigma.getGraph();
				const updated = {
					...node,
					label: "", // Hide labels by default
					highlighted: node.highlighted || false,
				};

				if (props.entryNode) {
					if (nodeId === props.entryNode) {
						updated.label = node.label; // Always show entry node label
						updated.color = "#FF6B35"; // Distinct orange color for entry
					}

					// Show labels for nodes connected to entry node
					if (graph.neighbors(props.entryNode).includes(nodeId)) {
						updated.label = node.label;
						if (node.color === defaultColor) {
							updated.color = "#FFB347"; // Lighter orange for neighbors
						}
					}
				}

				if (activeNodeId) {
					const activeNode = graph.getNodeAttributes(activeNodeId);

					if (nodeId === activeNodeId) {
						updated.label = node.label; // Show label for active node
						updated.size = clamp(node.size, 35, node.size + 10);
					}

					if (
						nodeId === activeNodeId ||
						graph.neighbors(activeNodeId).includes(nodeId)
					) {
						updated.label = node.label; // Show labels for active node and neighbors
						updated.highlighted = true;

						if (activeNodeId !== props.entryNode) {
							updated.color =
								activeNode.color === defaultColor
									? "#FA4F40"
									: activeNode.color;
						}
					} else {
						updated.color = defaultColor;
						updated.highlighted = false;
						updated.label = ""; // Hide labels for non-connected nodes
					}
				}
				return updated;
			},
			edgeReducer: (edgeId, edge) => {
				const graph = sigma.getGraph();
				const updated: EdgeType = { ...edge, hidden: true };

				// Only show entry node edges if no node is hovered
				if (!activeNodeId && props.entryNode) {
					if (graph.extremities(edgeId).includes(props.entryNode)) {
						updated.hidden = false;
					}
				} else if (
					activeNodeId &&
					graph.extremities(edgeId).includes(activeNodeId)
				) {
					// Otheriwse show hovered node edges
					const activeNode = graph.getNodeAttributes(activeNodeId);
					updated.hidden = false;
					updated.color = activeNode.color;
				}

				return updated;
			},
		});
	}, [selectedNodeId, hoveredNodeId, setSettings, sigma, props.entryNode]);

	return null;
};
