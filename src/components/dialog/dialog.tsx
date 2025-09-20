"use client";

import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Tabs } from "@ark-ui/react/tabs";
import { useLoaderData } from "@tanstack/react-router";
import { useAtom } from "@xstate/store/react";
import { useMemo, useState } from "react";
import { LuMaximize, LuMinimize } from "react-icons/lu";
import {
	focusedNodeIdAtom,
	isFocusedModalOpenedAtom,
} from "~/components/graph/common/use-graph-atoms";
import { TreeViewBasic } from "~/components/tree-view/basic";
import {
	mapModvizOutputToImporteesTreeCollection,
	mapModvizOutputToImportsChainTreeCollection,
	type ImportsChainDirection,
} from "~/components/tree-view/map-modviz-output-to-tree-collection";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectControl,
	SelectIndicator,
	SelectItem,
	SelectTrigger,
	SelectValueText,
	createListCollection,
} from "~/components/ui/select";
import type { VizNode } from "../../../mod/types";

export function NodeDetailsModal() {
	const isOpened = useAtom(isFocusedModalOpenedAtom);
	const focusedNodeId = useAtom(focusedNodeIdAtom);

	const output = useLoaderData({ from: "/" });
	const node =
		isOpened && output.nodes.find((node) => node.path === focusedNodeId);

	return (
		<Dialog.Root
			open={isOpened}
			onOpenChange={(details) => isFocusedModalOpenedAtom.set(details.open)}
			lazyMount
		>
			<Portal>
				<Dialog.Backdrop className="data-[state=open]:animate-backdrop-in data-[state=closed]:animate-backdrop-out fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
				<Dialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center p-4">
					{node && (
						<NodeDetailsModalContent
							node={node}
							entryNodeId={output.metadata.entrypoints.at(0)!}
						/>
					)}
				</Dialog.Positioner>
			</Portal>
		</Dialog.Root>
	);
}

const NodeDetailsModalContent = (props: {
	node: VizNode;
	entryNodeId: string;
}) => {
	const [isMaximized, setIsMaximized] = useState(false);
	return (
		<Dialog.Content
			className="data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out relative w-full max-w-4xl h-[80vh] rounded-lg bg-white dark:bg-gray-900 shadow-lg flex flex-col"
			style={{
				width: isMaximized ? "95vw" : undefined,
				maxWidth: isMaximized ? "95vw" : undefined,
				height: isMaximized ? "95vh" : undefined,
				maxHeight: isMaximized ? "95vh" : undefined,
			}}
		>
			<Dialog.Title className="relative flex gap-2 items-center text-lg font-semibold text-gray-900 dark:text-white p-4 border-b border-gray-200 dark:border-gray-700">
				<span>Current node:</span>
				<span>{props.node.path}</span>
				<div className="ml-auto">
					<Button
						variant="outline"
						className="px-2 py-1"
						onClick={() => setIsMaximized((isMaximized) => !isMaximized)}
					>
						{isMaximized ? (
							<>
								<LuMinimize className="h-4 w-4 text-slate-400" />
								<span className="sr-only">Minimize</span>
							</>
						) : (
							<>
								<LuMaximize className="h-4 w-4 text-slate-400" />
								<span className="sr-only">Maximize</span>
							</>
						)}
					</Button>
				</div>
			</Dialog.Title>
			<div className="bg-white dark:bg-gray-800 w-full h-full min-h-0 px-4 py-6 rounded-xl flex flex-col">
				<Tabs.Root
					className="w-full h-full min-h-0 overflow-hidden flex flex-col"
					defaultValue="transitive-imports"
				>
					<Tabs.List className="flex gap-1 p-1 bg-gray-100 rounded-lg dark:bg-gray-700 w-fit mb-2">
						<Tabs.Trigger
							value="transitive-imports"
							className="px-4 py-2 text-sm font-medium text-gray-600 rounded-md transition-all data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-sm dark:text-gray-300 dark:data-selected:bg-gray-800 dark:data-selected:text-gray-100"
						>
							Transitive imports
						</Tabs.Trigger>
						<Tabs.Trigger
							value="imports-chain"
							className="px-4 py-2 text-sm font-medium text-gray-600 rounded-md transition-all data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-sm dark:text-gray-300 dark:data-selected:bg-gray-800 dark:data-selected:text-gray-100"
						>
							Imports chains
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content
						value="transitive-imports"
						className="w-full h-full min-h-0 text-gray-600 dark:text-gray-300"
					>
						<TransitiveImportsTab node={props.node} />
					</Tabs.Content>

					<Tabs.Content
						value="imports-chain"
						className="w-full h-full min-h-0 text-gray-600 dark:text-gray-300"
					>
						<ImportsChainTab node={props.node} />
					</Tabs.Content>
				</Tabs.Root>
			</div>

			<div className="flex flex-col items-end text-xs p-2 border-t border-gray-200 dark:border-gray-700">
				<div className="flex gap-3">
					Current node: <span>{props.node.path}</span>
				</div>
				<div className="flex gap-3">
					Entrypoint: <span>{props.entryNodeId}</span>
				</div>
			</div>
		</Dialog.Content>
	);
};

const TransitiveImportsTab = (props: { node: VizNode }) => {
	const output = useLoaderData({ from: "/" });

	const initialCollection = useMemo(
		() => mapModvizOutputToImporteesTreeCollection(output, props.node.path),
		[output.nodes, props.node.path],
	);
	if (!initialCollection) return;

	const transitiveImports = initialCollection.visited;

	return (
		<>
			<div className="h-full min-h-0 flex flex-col p-2 gap-2">
				<span
					onClick={() =>
						console.log(
							props.node,
							initialCollection.collection.rootNode,
							initialCollection.visited,
						)
					}
				>
					{transitiveImports.size} file imported (transitively) from current
					node
				</span>
				<TreeViewBasic
					key={props.node.path}
					entryNodeId={props.node.path}
					initialCollection={initialCollection.collection}
				/>
			</div>
		</>
	);
};

const ImportsChainTab = (props: { node: VizNode }) => {
	const output = useLoaderData({ from: "/" });

	const [direction, setDirection] = useState<ImportsChainDirection>(
		"from-entrypoint-to-current-node",
	);

	const initialCollection = useMemo(
		() =>
			mapModvizOutputToImportsChainTreeCollection(
				output,
				props.node.path,
				direction,
			),
		[output.nodes, props.node.path, direction],
	);
	if (!initialCollection) return;

	const rootNode = output.nodes.find((node) => node.path === props.node.path)!;
	const chain = rootNode.chain.at(0) ?? [];

	return (
		<>
			<div className="h-full min-h-0 flex flex-col p-2 gap-2">
				<div className="flex gap-2 items-center">
					<span
						onClick={() =>
							console.log(props.node, initialCollection.rootNode, chain)
						}
					>
						<span>
							Reached{" "}
							{direction === "from-entrypoint-to-current-node"
								? "current node"
								: "entrypoint"}{" "}
							after
						</span>
						<span> {chain.length} imports</span>
					</span>
					<div className="ml-auto">
						<ImportsChainDirection
							value={direction}
							onValueChange={setDirection}
						/>
					</div>
				</div>
				<TreeViewBasic
					key={props.node.path + direction}
					entryNodeId={props.node.path}
					initialCollection={initialCollection}
					defaultExpandedValue={chain}
				/>
			</div>
		</>
	);
};

const collection = createListCollection({
	items: [
		{
			value: "from-entrypoint-to-current-node",
			label: "From entrypoint to current node",
		},
		{
			value: "from-current-node-to-entrypoint",
			label: "From current node to entrypoint",
		},
	],
});
function ImportsChainDirection(props: {
	value: ImportsChainDirection;
	onValueChange: (value: ImportsChainDirection) => void;
}) {
	return (
		<Select
			className="min-w-64 *:not-first:mt-2"
			value={[props.value]}
			onValueChange={(details) =>
				props.onValueChange(details.value.at(0) as ImportsChainDirection)
			}
			collection={collection}
			positioning={{ sameWidth: true }}
		>
			<SelectControl>
				<SelectTrigger>
					<SelectValueText placeholder="Direction" />
					<SelectIndicator />
				</SelectTrigger>
			</SelectControl>
			<SelectContent>
				{collection.items.map((item) => (
					<SelectItem key={item.value} item={item}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
