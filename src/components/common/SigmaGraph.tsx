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
	// const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	/** When component mount => load the graph + register events */
	useEffect(() => {
		const graph = makeGraph();
		loadGraph(graph);
		assignLayout();
	}, [loadGraph, registerEvents, makeGraph, assignLayout]);

	/** When component mount => load the graph + register events */
	useEffect(() => {
		registerEvents({
			enterNode: (event) => setHoveredNodeId(event.node),
			leaveNode: () => setHoveredNodeId(null),
			// clickStage: () => setSelectedNodeId(null),
			downNode: (event) => {
				// setSelectedNodeId((current) =>
				// 	current === event.node ? null : event.node,
				// );
				setDraggedNodeId(event.node);
				sigma.getGraph().setNodeAttribute(event.node, "highlighted", true);
			},
			// On mouse move, if the drag mode is enabled, we change the position of the draggedNode
			mousemovebody: (e) => {
				if (!draggedNodeId) return;
				// Get new position of node
				const pos = sigma.viewportToGraph(e);
				sigma.getGraph().setNodeAttribute(draggedNodeId, "x", pos.x);
				sigma.getGraph().setNodeAttribute(draggedNodeId, "y", pos.y);

				// Prevent sigma to move camera:
				e.preventSigmaDefault();
				e.original.preventDefault();
				e.original.stopPropagation();
			},
			// On mouse up, we reset the autoscale and the dragging mode
			mouseup: () => {
				if (draggedNodeId) {
					setDraggedNodeId(null);
					sigma.getGraph().removeNodeAttribute(draggedNodeId, "highlighted");
				}
			},
			// Disable the autoscale at the first down interaction
			mousedown: () => {
				if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
			},
		});
	}, [registerEvents, draggedNodeId]);

	/** When component mount or hovered node change => Setting the sigma reducers */
	useEffect(() => {
		setSettings({
			nodeReducer: (nodeId, node) => {
				const graph = sigma.getGraph();
				const updated = {
					...node,
					label: "", // Hide labels by default
					highlighted: node.highlighted || false,
				};

				if (hoveredNodeId && graph.hasNode(hoveredNodeId)) {
					const activeNode = graph.getNodeAttributes(hoveredNodeId);

					if (nodeId === hoveredNodeId) {
						updated.label = node.label; // Show label for active node
						updated.size = clamp(node.size, 35, node.size + 10);
					}

					if (
						nodeId === hoveredNodeId ||
						graph.neighbors(hoveredNodeId).includes(nodeId)
					) {
						updated.label = node.label; // Show labels for active node and neighbors
						updated.highlighted = true;

						if (hoveredNodeId !== props.entryNode) {
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

				if (
					hoveredNodeId &&
					graph.extremities(edgeId).includes(hoveredNodeId)
				) {
					// Otheriwse show hovered node edges
					const activeNode = graph.getNodeAttributes(hoveredNodeId);
					updated.hidden = false;
					updated.color = activeNode.color;
				}

				return updated;
			},
		});
	}, [setSettings, hoveredNodeId, sigma, props.entryNode]);

	return null;
};
