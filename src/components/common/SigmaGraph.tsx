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
	edges: ModvizOutput["edges"];
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

	const [hoveredNode, setHoveredNode] = useState<string | null>(null);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	/** When component mount => load the graph */
	useEffect(() => {
		// Create & load the graph
		const graph = makeGraph();
		loadGraph(graph);
		assignLayout();

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

	/** When component mount or hovered node change => Setting the sigma reducers */
	useEffect(() => {
		const activeNodeId = selectedNode ?? hoveredNode;
		setSettings({
			nodeReducer: (nodeId, node) => {
				const graph = sigma.getGraph();
				const updated = {
					...node,
					// label: "",
					highlighted: node.highlighted || false,
					// hidden: false,
				};

				if (props.entryNode) {
					if (nodeId === props.entryNode) {
						updated.label = node.label;
						updated.size = Math.max(node.size * 1.5, 25); // Make entry node larger
						updated.color = "#FF6B35"; // Distinct orange color for entry
					}

					if (
						nodeId === props.entryNode ||
						(graph.neighbors(nodeId).includes(props.entryNode) &&
							node.color === defaultColor)
					) {
						// Don't override entry node color
						if (nodeId !== props.entryNode) {
							updated.color = "#FFB347"; // Lighter orange for neighbors
						}
					}
				}

				if (activeNodeId) {
					const activeNode = graph.getNodeAttributes(activeNodeId);

					if (nodeId === activeNodeId) {
						updated.size = clamp(node.size, 35, node.size + 10);
					}

					if (
						nodeId === activeNodeId ||
						graph.neighbors(activeNodeId).includes(nodeId)
					) {
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
						updated.label = "";
					}
				}
				return updated;
			},
			edgeReducer: (edge, data) => {
				const graph = sigma.getGraph();
				const newData: EdgeType = { ...data, hidden: true };

				// Only show entry node edges if no node is hovered
				if (!activeNodeId && props.entryNode) {
					if (graph.extremities(edge).includes(props.entryNode)) {
						newData.hidden = false;
					}
				} else if (
					activeNodeId &&
					graph.extremities(edge).includes(activeNodeId)
				) {
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
