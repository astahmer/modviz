import "@react-sigma/core/lib/style.css";
import "@react-sigma/graph-search/lib/style.css";
import { useAtom } from "@xstate/store/react";
import { Command } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { currentNodeIdAtom } from "~/components/graph/common/use-graph-atoms";
import { Button } from "~/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import type { ModvizOutput, VizNode } from "../../../mod/types";
import { getExternalPackageName } from "~/utils/modviz-data";

type GraphCommandMenuProps = {
	nodes: ModvizOutput["nodes"];
	onHighlight: (value: string | undefined) => void;
	onSelect: (value: string | undefined) => void;
};

const getActiveCommandItemValue = () => {
	const item = document.querySelector('[cmdk-item][data-selected="true"]') as
		| HTMLElement
		| undefined;
	return item?.dataset.value;
};

const handleArrowKeyHighlight = (onHighlight: (value: string | undefined) => void) => {
	return (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!event.key.startsWith("Arrow")) {
			return;
		}

		onHighlight(getActiveCommandItemValue());
	};
};

// TODO virtualize list
function NodeCommandList(props: GraphCommandMenuProps & { onClose?: () => void }) {
	const nodesByClusterMap = useNodesByClusterMap(props.nodes);

	return (
		<Command loop>
			<CommandInput
				placeholder="Type a command or search..."
				onKeyDown={handleArrowKeyHighlight(props.onHighlight)}
			/>
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				{Array.from(nodesByClusterMap.entries()).map(([cluster, nodeList]) => (
					<CommandGroup key={cluster} heading={cluster}>
						{nodeList.map((node) => (
							<CommandItem
								key={node.path}
								value={node.path}
								keywords={
									[
										node.name,
										node.package?.name,
										node.cluster,
										node.path,
										...node.path.split("/"),
									].filter(Boolean) as string[]
								}
								onMouseEnter={() => {
									props.onHighlight(node.path);
								}}
								onSelect={(value) => {
									props.onSelect(value);
									props.onClose?.();
								}}
							>
								<div className="flex min-w-0 flex-col">
									<span className="truncate">{node.name}</span>
									<span className="truncate text-xs text-slate-500">{node.path}</span>
								</div>
							</CommandItem>
						))}
						<CommandSeparator />
					</CommandGroup>
				))}
			</CommandList>
		</Command>
	);
}

export function GraphCommandMenuDialog(props: GraphCommandMenuProps) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	if (!open) return null;

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<NodeCommandList {...props} onClose={() => setOpen(false)} />
		</CommandDialog>
	);
}

export function GraphCommandMenu(props: GraphCommandMenuProps) {
	const [open, setOpen] = useState(false);

	const currentNodeId = useAtom(currentNodeIdAtom);
	const currentNode = props.nodes.find((node) => node.path === currentNodeId);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between max-w-[400px]"
				>
					{currentNode?.name ?? "Find or change current node..."}
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-full p-0">
				<NodeCommandList {...props} onClose={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}

const useNodesByClusterMap = (nodes: ModvizOutput["nodes"]) => {
	const nodesByClusterMap = useMemo(() => {
		const map = new Map<string, VizNode[]>();
		nodes.forEach((node) => {
			const group = node.path.includes("node_modules")
				? `node_modules/${getExternalPackageName(node)}`
				: (node.cluster ?? node.package?.name ?? "workspace");
			const existingNodes = map.get(group) ?? [];
			existingNodes.push(node);
			map.set(group, existingNodes);
		});

		for (const [, groupedNodes] of map) {
			groupedNodes.sort((left, right) => left.path.localeCompare(right.path));
		}
		return new Map(
			Array.from(map.entries()).sort((left, right) => left[0].localeCompare(right[0])),
		);
	}, [nodes]);

	return nodesByClusterMap;
};
