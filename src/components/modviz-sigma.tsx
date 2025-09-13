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
import { useCallback, useState } from "react";
import { SigmaGraph } from "~/components/common/SigmaGraph";
import type { ModvizOutput } from "../../mod/types";
import { FocusOnNode } from "./common/FocusOnNode";

export const ModvizSigma = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [focusNode, setFocusNode] = useState<string | null>(null);
	console.log({ selectedNode, focusNode });

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

	return (
		<SigmaContainer
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

const sigmaStyle = { height: "500px", width: "500px" };
