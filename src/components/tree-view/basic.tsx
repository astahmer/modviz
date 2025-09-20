"use client";

import { useFilter } from "@ark-ui/react/locale";
import {
	TreeView,
	useTreeView,
	type TreeCollection,
} from "@ark-ui/react/tree-view";
import { ChevronRight, File } from "lucide-react";
import { useState } from "react";
import {
	LuArrowDownFromLine,
	LuArrowRight,
	LuArrowUpToLine,
	LuBug,
	LuInfinity,
	LuOctagonMinus,
} from "react-icons/lu";
import { type TreeNodeData } from "~/components/tree-view/map-modviz-output-to-tree-collection";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { focusedNodeIdAtom } from "~/components/graph/common/use-graph-atoms";

const TreeNodeName = (props: {
	node: TreeNodeData;
	isCircular?: boolean;
	hasReachedMaxDepth?: boolean;
	visited?: Set<string>;
	focusedNodeId?: string;
}) => {
	const { node } = props;

	const Trigger = (
		<span
			className={cn(
				"font-medium whitespace-nowrap",
				node.original.isBarrelFile &&
					"underline decoration-amber-600 decoration-2",
				// node.original.isBarrelFile && "outline-2 outline-amber-600",
				props.isCircular && "text-red-400",
			)}
		>
			{/* TODO tooltip full path here and other node.name place */}
			{(node.original.isBarrelFile || props.isCircular) && "⚠️ "}
			{node.name}
			{node.original.isBarrelFile &&
				` (barrel ${node.original.exports.length} exports)`}
			{props.isCircular && " (circular)"}
			{props.hasReachedMaxDepth && " (max depth reached)"}
		</span>
	);

	const Name =
		// props.hasReachedMaxDepth ||
		// props.isCircular ||
		// props.node.original.isBarrelFile ? (
		true ? (
			<Tooltip lazyMount>
				<TooltipTrigger>{Trigger}</TooltipTrigger>
				<TooltipContent className="max-w-[auto]">
					{props.visited?.size ? (
						<div className="flex flex-col gap-2">
							<span>Imported by:</span>
							{[...props.visited].map((nodeId, index) => (
								<span
									key={nodeId}
									className={cn(nodeId === node.id && "text-red-400")}
									style={{ paddingLeft: `${index * 10}px` }}
								>
									{"->"} {nodeId}
								</span>
							))}
							<span
								className="text-red-400"
								style={{
									paddingLeft: `${[...props.visited].length * 10}px`,
								}}
							>
								{"->"} {node.id}
							</span>
						</div>
					) : (
						node.id
					)}
				</TooltipContent>
			</Tooltip>
		) : (
			Trigger
		);

	return (
		<>
			{Name}
			{props.focusedNodeId !== node.id && (
				<Button
					className="ml-auto"
					variant="ghost"
					size="icon"
					onClickCapture={(e) => {
						e.stopPropagation();
						focusedNodeIdAtom.set(node.id);
					}}
				>
					<LuArrowRight className="text-slate-400" />
				</Button>
			)}
			<Button
				className="ml-auto"
				variant="ghost"
				size="icon"
				onClickCapture={(e) => {
					e.stopPropagation();
					console.log(node);
				}}
			>
				<LuBug className="text-slate-400" />
			</Button>
		</>
	);
};

const TreeNode = (
	props: TreeView.NodeProviderProps<TreeNodeData> & {
		visited: Set<string>;
		maxDepth: number;
		currentDepth: number;
		focusedNodeId?: string;
	},
) => {
	const { node, indexPath } = props;

	// TODO bind node details modal to url ?

	return (
		<TreeView.NodeProvider key={node.id} node={node} indexPath={indexPath}>
			{node.children?.length ? (
				<TreeView.Branch onClick={() => console.log(indexPath, node)}>
					<TreeView.BranchControl className="group flex w-full items-center gap-2 rounded-lg py-0.5 text-sm font-medium whitespace-nowrap transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[state=open]:text-slate-900 dark:data-[state=open]:text-slate-100">
						<TreeView.BranchIndicator className="flex h-4 w-4 shrink-0 items-center justify-center">
							<ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-90 group-data-[state=open]:text-slate-600" />
						</TreeView.BranchIndicator>
						<TreeView.BranchText className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 group-data-[state=open]:text-slate-900 dark:group-data-[state=open]:text-slate-100">
							<TreeNodeName node={node} focusedNodeId={props.focusedNodeId} />
						</TreeView.BranchText>
					</TreeView.BranchControl>
					<TreeView.BranchContent className="ml-6 border-l border-slate-200 pl-2 dark:border-slate-700/60">
						<TreeView.BranchIndentGuide />
						{node.children.map((child, index) =>
							props.visited.has(child.id) ? (
								<TreeView.Item
									key={child.id}
									onClick={() => console.log([...indexPath, index], child)}
									className="group flex w-full items-center gap-2 rounded-lg py-1 text-sm font-medium whitespace-nowrap transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[selected]:bg-blue-50 dark:data-[selected]:bg-blue-900/30 data-[selected]:text-blue-700 dark:data-[selected]:text-blue-300 data-[selected]:shadow-sm data-[selected]:ring-1 data-[selected]:ring-blue-200 dark:data-[selected]:ring-blue-800/30"
								>
									<div className="flex h-4 w-4 shrink-0 items-center justify-center">
										<div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-data-[selected]:bg-blue-500" />
									</div>
									<TreeView.ItemText className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 group-data-[selected]:text-blue-700 dark:group-data-[selected]:text-blue-300">
										{/* TODO tooltip stack list */}
										<LuInfinity className="h-4 w-4 text-slate-400 group-data-[selected]:text-blue-500" />
										<TreeNodeName
											node={child}
											isCircular
											visited={props.visited}
											focusedNodeId={props.focusedNodeId}
										/>
									</TreeView.ItemText>
								</TreeView.Item>
							) : props.currentDepth >= props.maxDepth ? (
								<TreeView.Item
									key={child.id}
									onClick={() => console.log([...indexPath, index], child)}
									className="group flex w-full items-center gap-2 rounded-lg py-1 text-sm font-medium whitespace-nowrap transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[selected]:bg-blue-50 dark:data-[selected]:bg-blue-900/30 data-[selected]:text-blue-700 dark:data-[selected]:text-blue-300 data-[selected]:shadow-sm data-[selected]:ring-1 data-[selected]:ring-blue-200 dark:data-[selected]:ring-blue-800/30"
								>
									<div className="flex h-4 w-4 shrink-0 items-center justify-center">
										<div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-data-[selected]:bg-blue-500" />
									</div>
									<TreeView.ItemText className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 group-data-[selected]:text-blue-700 dark:group-data-[selected]:text-blue-300">
										<LuOctagonMinus className="h-4 w-4 text-slate-400 group-data-[selected]:text-blue-500" />
										<TreeNodeName
											node={child}
											hasReachedMaxDepth
											focusedNodeId={props.focusedNodeId}
										/>
									</TreeView.ItemText>
								</TreeView.Item>
							) : (
								<TreeNode
									key={child.id}
									node={child}
									indexPath={[...indexPath, index]}
									visited={new Set([...props.visited, child.id])}
									currentDepth={props.currentDepth + 1}
									maxDepth={props.maxDepth}
									focusedNodeId={props.focusedNodeId}
								/>
							),
						)}
					</TreeView.BranchContent>
				</TreeView.Branch>
			) : (
				<TreeView.Item
					onClick={() => console.log(indexPath, node)}
					className="group flex w-full items-center gap-2 rounded-lg py-1 text-sm font-medium whitespace-nowrap transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[selected]:bg-blue-50 dark:data-[selected]:bg-blue-900/30 data-[selected]:text-blue-700 dark:data-[selected]:text-blue-300 data-[selected]:shadow-sm data-[selected]:ring-1 data-[selected]:ring-blue-200 dark:data-[selected]:ring-blue-800/30"
				>
					<div className="flex h-4 w-4 shrink-0 items-center justify-center">
						<div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-data-[selected]:bg-blue-500" />
					</div>
					<TreeView.ItemText className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 group-data-[selected]:text-blue-700 dark:group-data-[selected]:text-blue-300">
						<File className="h-4 w-4 text-slate-400 group-data-[selected]:text-blue-500" />
						<TreeNodeName node={node} focusedNodeId={props.focusedNodeId} />
					</TreeView.ItemText>
				</TreeView.Item>
			)}
		</TreeView.NodeProvider>
	);
};

export function TreeViewBasic(props: {
	entryNodeId: string;
	initialCollection: TreeCollection<TreeNodeData>;
	defaultExpandedValue?: string[];
}) {
	const { contains } = useFilter({ sensitivity: "base" });
	const [collection, setCollection] = useState(props.initialCollection);

	const filter = (value: string) => {
		const filtered =
			value.length > 0
				? collection.filter((node) => contains(node.name, value))
				: props.initialCollection;
		setCollection(filtered);
	};

	const treeView = useTreeView({
		id: props.entryNodeId,
		collection,
		defaultExpandedValue: props.defaultExpandedValue ?? [props.entryNodeId],
		selectedValue: [], // prevent selection
	});

	const flattened = treeView.collection.flatten();
	const visible = treeView.getVisibleNodes().map((node) => node.id);
	const flattenedUniqueNodeIds = new Set(flattened.map((node) => node.id));
	console.log(
		flattened.length,
		treeView.getVisibleNodes().map((node) => node.id).length,
		flattenedUniqueNodeIds.size,
	);
	const isAllExpanded =
		treeView.expandedValue.length === flattenedUniqueNodeIds.size;

	return (
		<div className="w-full h-full min-h-0 flex flex-col gap-2">
			<div className="flex gap-2">
				<Input placeholder="Search" onChange={(e) => filter(e.target.value)} />
				<div className="ml-auto">
					{isAllExpanded ? (
						<Button
							variant="outline"
							className="px-2 py-1"
							onClick={() => treeView.collapse()}
						>
							<LuArrowUpToLine className="h-4 w-4 text-slate-400">
								<span className="sr-only">Collapse all</span>
							</LuArrowUpToLine>
						</Button>
					) : (
						<Button
							variant="outline"
							className="px-2 py-1"
							onClick={() =>
								flattened.length <= 500
									? treeView.expand()
									: visible.length <= 500
										? treeView.expand(visible)
										: treeView.expand(visible.slice(0, 250))
							}
						>
							<LuArrowDownFromLine className="h-4 w-4 text-slate-400">
								<span className="sr-only">Expand all</span>
							</LuArrowDownFromLine>
						</Button>
					)}
				</div>
			</div>
			<div className="w-full h-full min-h-0 overflow-auto">
				<TreeView.RootProvider value={treeView} lazyMount unmountOnExit>
					<TreeView.Tree>
						{collection.rootNode.children?.map((node, index) => (
							<TreeNode
								key={node.id}
								node={node}
								indexPath={[index]}
								visited={new Set([node.id])}
								currentDepth={0}
								maxDepth={100}
								focusedNodeId={props.entryNodeId}
							/>
						))}
					</TreeView.Tree>
				</TreeView.RootProvider>
			</div>
		</div>
	);
}
