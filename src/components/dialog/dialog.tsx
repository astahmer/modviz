"use client";

import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { useLoaderData } from "@tanstack/react-router";
import { useAtom } from "@xstate/store/react";
import { X } from "lucide-react";
import { useMemo } from "react";
import {
	focusedNodeIdAtom,
	isFocusedModalOpenedAtom,
} from "~/components/graph/common/use-graph-atoms";
import { TreeViewBasic } from "~/components/tree-view/basic";
import { mapModvizOutputToTreeCollection } from "~/components/tree-view/map-modviz-output-to-tree-collection";
import type { VizNode } from "../../../mod/types";

export function NodeDetailsModal() {
	const isOpened = useAtom(isFocusedModalOpenedAtom);
	const focusedNodeId = useAtom(focusedNodeIdAtom);

	const output = useLoaderData({ from: "/" });
	const node = output.nodes.find((node) => node.path === focusedNodeId);

	return (
		<Dialog.Root
			open={isOpened}
			onOpenChange={(details) => isFocusedModalOpenedAtom.set(details.open)}
			lazyMount
		>
			<Portal>
				<Dialog.Backdrop className="data-[state=open]:animate-backdrop-in data-[state=closed]:animate-backdrop-out fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
				<Dialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
					{node && <Content node={node} />}
				</Dialog.Positioner>
			</Portal>
		</Dialog.Root>
	);
}

const Content = (props: { node: VizNode }) => {
	const output = useLoaderData({ from: "/" });

	const initialCollection = useMemo(
		() => mapModvizOutputToTreeCollection(output, props.node.path),
		[output.nodes, props.node.path],
	);

	if (!initialCollection) return;

	const transitiveImports = initialCollection?.visited;

	// TODO tabs: Transitive imports from path, Import chain to entrypoint
	// TODO button: show

	return (
		<Dialog.Content className="data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out relative w-full max-w-4xl h-[70vh] rounded-lg bg-white dark:bg-gray-900 shadow-lg flex flex-col">
			<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
				<Dialog.Title
					className="text-lg font-semibold text-gray-900 dark:text-white flex flex-col"
					onClick={() =>
						console.log(props.node, initialCollection, transitiveImports)
					}
				>
					({transitiveImports.size}) Transitive imports from
					<span>{props.node.path}</span>
				</Dialog.Title>
				<Dialog.CloseTrigger asChild>
					<button className="p-1 text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer">
						<X className="h-4 w-4" />
					</button>
				</Dialog.CloseTrigger>
			</div>

			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<TreeViewBasic
					key={props.node.path}
					entryNodeId={props.node.path}
					initialCollection={initialCollection.collection}
				/>
			</div>

			{/* <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
							<div className="flex gap-3">
								<Dialog.CloseTrigger asChild>
									<button className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center">
										Cancel
									</button>
								</Dialog.CloseTrigger>
							</div>
						</div> */}
		</Dialog.Content>
	);
};
