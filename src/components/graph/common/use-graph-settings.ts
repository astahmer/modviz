import {
	useCamera,
	useRegisterEvents,
	useSetSettings,
	useSigma,
} from "@react-sigma/core";
import { useAtom } from "@xstate/store/react";
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
	hoveredClusterNameAtom,
	selectedNodeIdsAtom,
	selectionModeEnabledAtom,
} from "~/components/graph/common/use-graph-atoms";

export const useGraphSettings = () => {
	const sigma = useSigma<NodeType, EdgeType>();
	const setSettings = useSetSettings<NodeType, EdgeType>();
	const registerEvents = useRegisterEvents<NodeType, EdgeType>();
	const hoveredClusterName = useAtom(hoveredClusterNameAtom);
	const selectedNodeIds = useAtom(selectedNodeIdsAtom);
	const selectionModeEnabled = useAtom(selectionModeEnabledAtom);
 	const selectedNodeSet = new Set(selectedNodeIds);

	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

	const { gotoNode } = useCamera();

	useEffect(() => {
		registerEvents({
			enterNode: (event) => setHoveredNodeId(event.node),
			leaveNode: () => setHoveredNodeId(null),
			clickNode: (event) => {
				gotoNode(event.node);
				if (selectionModeEnabled) {
					selectedNodeIdsAtom.set((previous) =>
						previous.includes(event.node)
							? previous.filter((nodeId) => nodeId !== event.node)
							: [...previous, event.node],
					);
					return;
				}
				focusedNodeIdAtom.set((prev) =>
					prev === event.node ? null : event.node,
				);
			},
			downStage: () => {
				highlightedNodeIdAtom.set(null);
			},
			mousedown: () => {
				if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
			},
		});
	}, [gotoNode, registerEvents, sigma]);

	useEffect(() => {
		setSettings({
			autoCenter: true,
			autoRescale: true,
			zoomDuration: 150,
			renderLabels: Boolean(hoveredNodeId || hoveredClusterName),
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

				if (selectionModeEnabled && selectedNodeSet.size > 0) {
					if (selectedNodeSet.has(nodeId)) {
						updated.label = node.label;
						updated.highlighted = true;
						updated.size = node.size + clamp(2, 8, node.size * 0.15);
					} else {
						updated.color = colors.default;
						updated.label = "";
						updated.highlighted = false;
					}

					return updated;
				}

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
				} else if (hoveredClusterName) {
					if (node.cluster === hoveredClusterName) {
						updated.label = node.label;
						updated.highlighted = true;
					} else {
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

				if (selectionModeEnabled && selectedNodeSet.size > 0) {
					const [source, target] = graph.extremities(edgeId);
					if (selectedNodeSet.has(source) && selectedNodeSet.has(target)) {
						updated.hidden = false;
						updated.color = graph.getNodeAttribute(source, "color");
					}

					return updated;
				}

				if (
					hoveredNodeId &&
					graph.extremities(edgeId).includes(hoveredNodeId)
				) {
					// Otheriwse show hovered node edges
					const activeNode = graph.getNodeAttributes(hoveredNodeId);
					updated.hidden = false;
					updated.color = activeNode.color;
				} else if (hoveredClusterName) {
					const [source, target] = graph.extremities(edgeId);
					const sourceNode = graph.getNodeAttributes(source);
					const targetNode = graph.getNodeAttributes(target);

					if (
						sourceNode.cluster === hoveredClusterName &&
						targetNode.cluster === hoveredClusterName
					) {
						updated.hidden = false;
						updated.color = sourceNode.color;
					}
				}

				return updated;
			},
		});
	}, [hoveredClusterName, hoveredNodeId, selectedNodeIds, selectionModeEnabled, setSettings, sigma]);
};
