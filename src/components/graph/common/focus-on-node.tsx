import { useCamera, useSigma } from "@react-sigma/core";
import { FC, useEffect } from "react";

export const FocusOnNode: FC<{ node: string | null; move?: boolean }> = ({
	node,
	move,
}) => {
	const sigma = useSigma();
	const { gotoNode } = useCamera();

	/**
	 * When the selected item changes, highlighted the node and center the camera on it.
	 */
	useEffect(() => {
		if (!node) return;
		const graph = sigma.getGraph();
		const initialSize = graph.getNodeAttribute(node, "size");
		graph.setNodeAttribute(node, "highlighted", true);
		graph.setNodeAttribute(node, "size", 30);
		if (move) gotoNode(node);

		return () => {
			graph.setNodeAttribute(node, "highlighted", false);
			graph.setNodeAttribute(node, "size", initialSize);
		};
	}, [node, move, sigma, gotoNode]);

	return null;
};
