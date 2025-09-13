import {
	ControlsContainer,
	FullScreenControl,
	SigmaContainer,
	ZoomControl,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { GraphSearch, GraphSearchOption } from "@react-sigma/graph-search";
import "@react-sigma/graph-search/lib/style.css";
import { MiniMap } from "@react-sigma/minimap";
import { useCallback, useMemo, useState } from "react";
import { SigmaGraph } from "~/components/graph/common/render-sigma-graph";
import type { ModvizOutput } from "../../../mod/types";
import { FocusOnNode } from "./common/focus-on-node";
import { fitViewportToNodes } from "@sigma/utils";
import type Sigma from "sigma";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";

export const ModvizSigma = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [focusNode, setFocusNode] = useState<string | null>(null);

	const onFocus = useCallback((value: GraphSearchOption | null) => {
		if (value === null) setFocusNode(null);
		else if (value.type === "nodes") setFocusNode(value.id);
	}, []);

	const onChange = useCallback((value: GraphSearchOption | null) => {
		if (value === null) setSelectedNode(null);
		else if (value.type === "nodes") setSelectedNode(value.id);
	}, []);

	const postSearchResult = useCallback(
		(options: GraphSearchOption[]): GraphSearchOption[] => {
			return options.length <= 10
				? options
				: [
						...options.slice(0, 10),
						{
							type: "message",
							message: (
								<span className="text-center text-muted">
									And {options.length - 10} others
								</span>
							),
						},
					];
		},
		[],
	);

	const [sigma, setSigma] = useState<Sigma<NodeType, EdgeType> | null>(null);

	const communities = useMemo(() => {
		if (!sigma) return [];

		const communities = new Set<string>();
		const graph = sigma.getGraph();
		graph.forEachNode(
			(_nodeId, attrs) =>
				attrs.louvainCommunity && communities.add(attrs.louvainCommunity),
		);
		return Array.from(communities);
	}, [sigma]);

	return (
		<SigmaContainer
			ref={setSigma}
			className="h-full w-full"
			settings={{
				autoCenter: true,
				autoRescale: true,
				zoomDuration: 150,
				// hideEdgesOnMove: true,
				// hideLabelsOnMove: true,
				// labelSize: 20,
				// labelDensity: 0.07,
				// labelGridCellSize: 60,
				labelRenderedSizeThreshold: 8,
				// itemSizesReference: "screen",
				// This function tells sigma to grow sizes linearly with the zoom, instead
				// of relatively to the zoom ratio's square root:
				// zoomToSizeRatioFunction: (x) => x,
				// labelFont: "Lato, sans-serif",
				// zIndex: true,
				// stagePadding: 0,
			}}
		>
			<SigmaGraph
				entryNode={props.entryNode}
				packages={props.packages}
				nodes={props.nodes}
			/>
			<FocusOnNode node={focusNode ?? selectedNode} />
			<ControlsContainer position={"bottom-right"} className="mb-6">
				<ZoomControl />
				<FullScreenControl />
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-left"}>
				<div className="flex flex-col flex-wrap gap-2 text-xs p-2">
					{communities.map((community) => (
						<button
							key={community}
							onClick={() => {
								if (!sigma) return;

								const graph = sigma.getGraph();
								fitViewportToNodes(
									sigma as never,
									graph.filterNodes(
										(_, attrs) => attrs.louvainCommunity === community,
									),
									{ animate: true },
								);
							}}
						>
							{community}
						</button>
					))}
				</div>
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-right"}>
				<GraphSearch
					type="nodes"
					value={selectedNode ? { type: "nodes", id: selectedNode } : null}
					onFocus={onFocus}
					onChange={onChange}
					postSearchResult={postSearchResult}
				/>
			</ControlsContainer>

			<ControlsContainer position={"bottom-left"}>
				<MiniMap width="100px" height="100px" />
			</ControlsContainer>
		</SigmaContainer>
	);
};
