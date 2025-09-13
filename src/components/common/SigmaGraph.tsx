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
		iterations: 50,
		settings: {
			gravity: 1,
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
		const activeNode = selectedNode ?? hoveredNode;
		setSettings({
			nodeReducer: (node, data) => {
				const graph = sigma.getGraph();
				const newData = {
					...data,
					label: "",
					highlighted: data.highlighted || false,
					// hidden: false,
				};

				if (props.entryNode) {
					if (node === props.entryNode) {
						newData.label = data.label;
					}

					if (
						node === props.entryNode ||
						(graph.neighbors(node).includes(props.entryNode) &&
							data.color === defaultColor)
					) {
						newData.color = "orange";
					}
				}

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
