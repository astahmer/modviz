import "@react-sigma/core/lib/style.css";
import "@react-sigma/graph-search/lib/style.css";
import { useAtom } from "@xstate/store/react";
import { Command } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { focusedNodeIdAtom } from "~/components/graph/common/use-graph-atoms";
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
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import type { ModvizOutput, VizNode } from "../../../mod/types";

export function GraphCommandMenuDialog(props: {
	nodes: ModvizOutput["nodes"];
	onHighlight: (value: string | undefined) => void;
	onSelect: (value: string | undefined) => void;
}) {
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

	const nodesByClusterMap = useNodesByClusterMap(props.nodes);

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<Command loop>
				<CommandInput
					placeholder="Type a command or search..."
					onKeyDown={(e) => {
						if (!e.key.startsWith("Arrow")) return;
						// item that is currently on focused (selected) either by mouse hover or keyboard navigation
						const item = document.querySelector(
							'[cmdk-item][data-selected="true"]',
						) as HTMLElement | undefined;
						if (!item) return;

						props.onHighlight(item?.dataset.value);
						// this will dispatch an event that the cmdk library will listen to (then onSelect) will be executed
						// const event = new Event('cmdk-item-select');
						// item.dispatchEvent(event);
					}}
				/>
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					{Array.from(nodesByClusterMap.entries()).map(
						([cluster, nodeList]) => (
							<CommandGroup key={cluster} heading={cluster}>
								{nodeList.map((node) => (
									<CommandItem
										key={node.path}
										value={node.path}
										onMouseEnter={() => {
											props.onHighlight(node.path);
										}}
										onSelect={(value) => {
											props.onSelect(value);
											setOpen(false);
										}}
									>
										{node.name}
									</CommandItem>
								))}
								<CommandSeparator />
							</CommandGroup>
						),
					)}
				</CommandList>
			</Command>
		</CommandDialog>
	);
}

export function GraphCommandMenu(props: {
	nodes: ModvizOutput["nodes"];
	onHighlight: (value: string | undefined) => void;
	onSelect: (value: string | undefined) => void;
}) {
	const [open, setOpen] = useState(false);

	const nodesByClusterMap = useNodesByClusterMap(props.nodes);
	const focusedValue = useAtom(focusedNodeIdAtom);
	const focusedNode = props.nodes.find((node) => node.path === focusedValue);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className="w-full justify-between max-w-[400px]"
				>
					{focusedNode?.name ?? "Find a node..."}
					<ChevronsUpDown className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-full p-0">
				<Command loop>
					<CommandInput
						placeholder="Type a command or search..."
						onKeyDown={(e) => {
							if (!e.key.startsWith("Arrow")) return;
							// item that is currently on focused (selected) either by mouse hover or keyboard navigation
							const item = document.querySelector(
								'[cmdk-item][data-selected="true"]',
							) as HTMLElement | undefined;
							if (!item) return;

							props.onHighlight(item?.dataset.value);
							// this will dispatch an event that the cmdk library will listen to (then onSelect) will be executed
							// const event = new Event('cmdk-item-select');
							// item.dispatchEvent(event);
						}}
					/>
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						{Array.from(nodesByClusterMap.entries()).map(
							([cluster, nodeList]) => (
								<CommandGroup key={cluster} heading={cluster}>
									{nodeList.map((node) => (
										<CommandItem
											key={node.path}
											value={node.path}
											onMouseEnter={() => {
												props.onHighlight(node.path);
											}}
											onSelect={(currentValue) => {
												props.onSelect(currentValue);
												setOpen(false);
											}}
										>
											{node.name}
										</CommandItem>
									))}
									<CommandSeparator />
								</CommandGroup>
							),
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

const useNodesByClusterMap = (nodes: ModvizOutput["nodes"]) => {
	const nodesByClusterMap = useMemo(() => {
		const map = new Map<string, VizNode[]>();
		nodes.forEach((node) => {
			if (node.cluster) {
				const nodes = map.get(node.cluster) ?? [];
				nodes.push(node);
				map.set(node.cluster, nodes);
			}
		});
		return map;
	}, [nodes]);

	return nodesByClusterMap;
};
