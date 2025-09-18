"use client";

import { useFilter } from "@ark-ui/react/locale";
import {
	TreeView,
	useTreeView,
	type TreeCollection,
} from "@ark-ui/react/tree-view";
import { useLoaderData } from "@tanstack/react-router";
import { ChevronRight, File } from "lucide-react";
import { useMemo, useState } from "react";
import {
	mapModvizOutputToTreeCollection,
	type TreeNodeData,
} from "~/components/tree-view/map-modviz-output-to-tree-collection";
import { Input } from "~/components/ui/input";

const TreeNode = (props: TreeView.NodeProviderProps<TreeNodeData>) => {
	const { node, indexPath } = props;

	return (
		<TreeView.NodeProvider key={node.id} node={node} indexPath={indexPath}>
			{node.children?.length ? (
				<TreeView.Branch onClick={() => console.log(indexPath, node)}>
					<TreeView.BranchControl className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[state=open]:text-slate-900 dark:data-[state=open]:text-slate-100">
						<TreeView.BranchIndicator className="flex h-4 w-4 shrink-0 items-center justify-center">
							<ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-data-[state=open]:rotate-90 group-data-[state=open]:text-slate-600" />
						</TreeView.BranchIndicator>
						<TreeView.BranchText className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 group-data-[state=open]:text-slate-900 dark:group-data-[state=open]:text-slate-100">
							<span className="font-medium">{node.name}</span>
						</TreeView.BranchText>
					</TreeView.BranchControl>
					<TreeView.BranchContent className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-4 dark:border-slate-700/60">
						<TreeView.BranchIndentGuide />
						{node.children.map((child, index) => (
							<TreeNode
								key={child.id}
								node={child}
								indexPath={[...indexPath, index]}
							/>
						))}
					</TreeView.BranchContent>
				</TreeView.Branch>
			) : (
				<TreeView.Item
					onClick={() => console.log(indexPath, node)}
					className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 data-[selected]:bg-blue-50 dark:data-[selected]:bg-blue-900/30 data-[selected]:text-blue-700 dark:data-[selected]:text-blue-300 data-[selected]:shadow-sm data-[selected]:ring-1 data-[selected]:ring-blue-200 dark:data-[selected]:ring-blue-800/30"
				>
					<div className="flex h-4 w-4 shrink-0 items-center justify-center">
						<div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-data-[selected]:bg-blue-500" />
					</div>
					<TreeView.ItemText className="flex items-center gap-2.5 text-slate-600 dark:text-slate-400 group-data-[selected]:text-blue-700 dark:group-data-[selected]:text-blue-300">
						<File className="h-4 w-4 text-slate-400 group-data-[selected]:text-blue-500" />
						<span>{node.name}</span>
					</TreeView.ItemText>
				</TreeView.Item>
			)}
		</TreeView.NodeProvider>
	);
};

export function TreeViewBasic(props: {
	entryNodeId: string;
	initialCollection: TreeCollection<TreeNodeData>;
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
		defaultExpandedValue: [props.entryNodeId],
	});

	return (
		<div className="w-full">
			<Input placeholder="Search" onChange={(e) => filter(e.target.value)} />
			<TreeView.RootProvider value={treeView}>
				{/* collection={collection}
				className="w-full"
				defaultExpandedValue={[props.entryNodeId]}
			> */}
				<TreeView.Tree>
					{collection.rootNode.children?.map((node, index) => (
						<TreeNode key={node.id} node={node} indexPath={[index]} />
					))}
				</TreeView.Tree>
			</TreeView.RootProvider>
		</div>
	);
}
