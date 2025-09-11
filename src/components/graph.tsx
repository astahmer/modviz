import { useRef } from "react";
import {
	GraphCanvas,
	GraphCanvasRef,
	useSelection,
	type GraphEdge,
	type GraphNode,
} from "reagraph";

export const GraphAll = (props: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
	const graphRef = useRef<GraphCanvasRef | null>(null);
	const selection = useSelection({
		ref: graphRef,
		nodes: props.nodes,
		edges: props.edges,
		pathHoverType: "all",
	});

	return (
		<div className="relative h-[800px] w-full">
			<GraphCanvas
				ref={graphRef}
				nodes={props.nodes}
				edges={props.edges}
				selections={selection.selections}
				actives={selection.actives}
				onNodePointerOver={selection.onNodePointerOver}
				onNodePointerOut={selection.onNodePointerOut}
				onCanvasClick={selection.onCanvasClick}
				onNodeClick={selection.onNodeClick}
			/>
		</div>
	);
};
