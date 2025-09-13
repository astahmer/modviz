import {
	useLoadGraph,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import { useEffect, useState } from "react";
import { clamp } from "~/components/graph/common/clamp";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
const defaultColor = "#E2E2E2";

export const useGraphSettings = (props: { entryNode?: string }) => {
	const sigma = useSigma<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	// const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

	// registerEvents
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
			mousemovebody: (e) => {
				if (!draggedNodeId) return;

				const pos = sigma.viewportToGraph(e);
				sigma.getGraph().setNodeAttribute(draggedNodeId, "x", pos.x);
				sigma.getGraph().setNodeAttribute(draggedNodeId, "y", pos.y);

				// Prevent sigma to move camera:
				e.preventSigmaDefault();
				e.original.preventDefault();
				e.original.stopPropagation();
			},
			mouseup: () => {
				if (draggedNodeId) {
					setDraggedNodeId(null);
					sigma.getGraph().removeNodeAttribute(draggedNodeId, "highlighted");
				}
			},
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
						updated.size = node.size + clamp(4, 10, node.size * 0.25);
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
};
