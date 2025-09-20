import {
	useCamera,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import { useAtom } from "@xstate/store/react";
import { useControls } from "leva";
import { useEffect, useState } from "react";
import { clamp } from "~/components/graph/common/clamp";
import { colors } from "~/components/graph/common/colors";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
import {
	focusedNodeIdAtom,
	highlightedNodeIdAtom,
	isFocusedModalOpenedAtom,
} from "~/components/graph/common/use-graph-atoms";

export const useGraphSettings = (props: { entryNode?: string }) => {
	const sigma = useSigma<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();

	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

	// Hide cluster labels when hovering node
	useEffect(() => {
		const clusterLabelLayer = document.getElementById("cluster-label-layers");
		if (!clusterLabelLayer) return;

		if (hoveredNodeId) {
			clusterLabelLayer.dataset.hovered = "true";
		} else {
			delete clusterLabelLayer.dataset.hovered;
		}
	}, [Boolean(hoveredNodeId)]);

	const { gotoNode } = useCamera();

	// registerEvents
	useEffect(() => {
		registerEvents({
			enterNode: (event) => setHoveredNodeId(event.node),
			leaveNode: () => setHoveredNodeId(null),
			downNode: (event) => {
				// setDraggedNodeId(event.node);
			},
			clickNode: (event) => {
				gotoNode(event.node);
				focusedNodeIdAtom.set((prev) =>
					prev === event.node ? null : event.node,
				);
			},
			// clickStage: () => setSelectedNodeId(null),
			downStage: () => {
				highlightedNodeIdAtom.set(null);
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
	}, [registerEvents, draggedNodeId, sigma, focusedNodeIdAtom]);

	useControls({
		renderLabels: {
			value: Boolean(hoveredNodeId),
			onChange: (value) => {
				setSettings({
					renderLabels: value,
				});
			},
		},
	});

	/** When component mount or hovered node change => Setting the sigma reducers */
	useEffect(() => {
		setSettings({
			autoCenter: true,
			autoRescale: true,
			zoomDuration: 150,
			// renderLabels: Boolean(hoveredNodeId),
			// hideLabelsOnMove: true,
			labelRenderedSizeThreshold: 8,
			// This function tells sigma to grow sizes linearly with the zoom, instead
			// of relatively to the zoom ratio's square root:
			nodeReducer: (nodeId, node) => {
				const graph = sigma.getGraph();
				const updated = {
					...node,
					highlighted: node.highlighted || false,
				};

				if (hoveredNodeId && graph.hasNode(hoveredNodeId)) {
					if (nodeId === hoveredNodeId) {
						updated.label = node.label; // Show label for active node
						updated.size = node.size + clamp(4, 10, node.size * 0.25);
					}

					if (
						nodeId === hoveredNodeId ||
						graph.neighbors(hoveredNodeId).includes(nodeId)
					) {
						// Show labels for active node and neighbors
						updated.label = node.label;
						updated.highlighted = true;
					} else {
						// Hide labels for non-connected nodes
						updated.color = colors.default;
						updated.highlighted = false;
						updated.label = "";
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
