import {
	ControlsContainer,
	FullScreenControl,
	SigmaContainer,
	useSigma,
	ZoomControl,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { GraphSearch, GraphSearchOption } from "@react-sigma/graph-search";
import "@react-sigma/graph-search/lib/style.css";
import { MiniMap } from "@react-sigma/minimap";
import { fitViewportToNodes } from "@sigma/utils";
import { useCallback, useMemo, useState } from "react";
import { SigmaGraph } from "~/components/graph/common/render-sigma-graph";
import type {
	EdgeType,
	NodeType,
} from "~/components/graph/common/use-create-graph";
import type { ModvizOutput } from "../../../mod/types";
import { FocusOnNode } from "./common/focus-on-node";

export const ModvizSigma = (props: {
	entryNode?: string;
	packages: ModvizOutput["metadata"]["packages"];
	nodes: ModvizOutput["nodes"];
}) => {
	return (
		<SigmaContainer className="h-full w-full">
			<SigmaGraph
				entryNode={props.entryNode}
				packages={props.packages}
				nodes={props.nodes}
			/>
			<WithGraph />
		</SigmaContainer>
	);
};

const WithGraph = () => {
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

	const sigma = useSigma<NodeType, EdgeType>();
	const graph = sigma.getGraph();

	const communities = useMemo(() => {
		const communities = new Map<string, string[]>();
		graph.forEachNode(
			(nodeId, attrs) =>
				attrs.louvainCommunity &&
				communities.set(
					attrs.louvainCommunity,
					(communities.get(attrs.louvainCommunity) ?? []).concat(nodeId),
				),
		);

		return Array.from(communities.entries())
			.sort((a, b) => {
				const res = b[1].length - a[1].length;
				return res !== 0 ? res : a[0].localeCompare(b[0]);
			})
			.map(([name, ids]) => ({ name, ids }));
	}, [sigma]);

	const nodes = graph.nodes();

	return (
		<>
			<FocusOnNode node={focusNode ?? selectedNode} />
			<ControlsContainer position={"bottom-right"} className="mb-6">
				<ZoomControl />
				<FullScreenControl />
				{/* <LayoutsControl /> */}
			</ControlsContainer>
			<ControlsContainer position={"top-left"}>
				<div className="flex flex-col flex-wrap gap-2 text-xs p-2">
					<button
						className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100"
						onClick={() => {
							fitViewportToNodes(sigma as never, nodes, {
								animate: true,
							});
						}}
					>
						Reset view ({nodes.length} nodes)
					</button>
					{communities.map((community) => {
						const graph = sigma.getGraph();
						const color = community.ids.length
							? graph.getNodeAttribute(community.ids[0], "color")
							: "#E2E2E2";
						return (
							<button
								key={community.name}
								className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100"
								onClick={() => {
									fitViewportToNodes(
										sigma as never,
										graph.filterNodes(
											(_, attrs) => attrs.louvainCommunity === community.name,
										),
										{ animate: true },
									);
								}}
								onMouseEnter={() => {
									const nodes = graph.filterNodes((nodeId, attrs) =>
										community.ids.includes(nodeId),
									);
									nodes.forEach((nodeId) => {
										graph.setNodeAttribute(nodeId, "highlighted", true);
									});
								}}
								onMouseLeave={() => {
									graph.forEachNode((nodeId) => {
										graph.setNodeAttribute(nodeId, "highlighted", false);
									});
								}}
							>
								<div className="w-2 h-2" style={{ backgroundColor: color }} />
								{community.name} ({community.ids.length})
							</button>
						);
					})}
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
		</>
	);
};
