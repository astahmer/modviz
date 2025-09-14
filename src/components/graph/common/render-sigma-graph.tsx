import { useLoadGraph } from "@react-sigma/core";
import { useLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { button, useControls } from "leva";
import { useEffect } from "react";
import {
	useCreateGraph,
	type EdgeType,
	type NodeType,
} from "~/components/graph/common/use-create-graph";
import { useGraphSettings } from "~/components/graph/common/use-graph-settings";
import type { ModvizOutput } from "../../../../mod/types";

type ForceAtlas2SynchronousLayoutParameters = Parameters<
	typeof useLayoutForceAtlas2
>[0];

export const SigmaGraph = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
	layout?: ForceAtlas2SynchronousLayoutParameters;
}) => {
	const controls = useControls({
		iterations: {
			min: 10,
			max: 300,
			step: 10,
			value: props.layout?.iterations ?? 100,
		},
		gravity: {
			min: 0,
			max: 1000,
			step: 1,
			value: props.layout?.settings?.gravity ?? props.nodes.length / 4,
		},
		scalingRatio: {
			min: 1,
			max: 300,
			step: 1,
			value: props.layout?.settings?.scalingRatio ?? props.nodes.length / 15,
		},
		strongGravityMode: props.layout?.settings?.strongGravityMode ?? false, // true?
		linLogMode: props.layout?.settings?.linLogMode ?? false,
		adjustSizes: props.layout?.settings?.adjustSizes ?? false,
		outboundAttractionDistribution:
			props.layout?.settings?.outboundAttractionDistribution ?? true,
		refresh: button(() => {
			const graph = createGraph();
			loadGraph(graph);
			layout.assign();
		}),
		hideClusterLabels: {
			value: false,
			onChange: (value) => {
				const clusterLabelLayer = document.getElementById(
					"cluster-label-layers",
				);
				if (clusterLabelLayer) {
					if (value) {
						clusterLabelLayer.dataset.hidden = "true";
					} else {
						delete clusterLabelLayer.dataset.hidden;
					}
				}
			},
		},
	});
	const { iterations, ...settings } = controls;

	const layout = useLayoutForceAtlas2({
		iterations: iterations,
		...props.layout,
		settings: {
			...settings,
			...props.layout?.settings,
			// gravity: 0.5, // Lower gravity to allow clusters to spread out
			// scalingRatio: 30, // Higher scaling for better separation
			// strongGravityMode: false, // Allow more natural clustering
			// slowDown: 5, // Faster convergence
			// outboundAttractionDistribution: true, // Better for clustered graphs
			// linLogMode: true, // Better for clustered networks
		},
	});

	const createGraph = useCreateGraph(props);
	const loadGraph = useLoadGraph<NodeType, EdgeType>();
	useGraphSettings(props);

	// When component mount => load the graph
	useEffect(() => {
		const graph = createGraph();
		loadGraph(graph);
	}, [loadGraph, createGraph]);

	// When controls change => update layout
	useEffect(() => {
		layout.assign();
	}, [controls, layout.assign]);

	return null;
};
