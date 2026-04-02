import "@react-sigma/core/lib/style.css";
import "@react-sigma/graph-search/lib/style.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAtom } from "@xstate/store/react";
import { Command, defaultFilter } from "cmdk";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { currentNodeIdAtom } from "~/components/graph/common/use-graph-atoms";
import { Button } from "~/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
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

type FilteredNodeRow = {
	cluster: string;
	keywords: string[];
	node: VizNode;
	showClusterHeading: boolean;
	showSeparator: boolean;
};

const buildNodeKeywords = (node: VizNode) =>
	[
		node.name,
		node.package?.name,
		node.cluster,
		node.path,
		...node.path.split("/"),
	].filter(Boolean) as string[];

const getFilteredNodeRows = (
	nodesByClusterMap: Map<string, VizNode[]>,
	search: string,
): FilteredNodeRow[] => {
	const normalizedSearch = search.trim();
	const filteredClusters = Array.from(nodesByClusterMap.entries())
		.map(([cluster, nodeList]) => {
			const filteredNodes = nodeList
				.map((node) => {
					const keywords = buildNodeKeywords(node);
					const score = normalizedSearch ? defaultFilter(node.path, normalizedSearch, keywords) : 1;

					return {
						keywords,
						node,
						score,
					};
				})
				.filter((entry) => entry.score > 0);

			if (normalizedSearch) {
				filteredNodes.sort(
					(left, right) => right.score - left.score || left.node.path.localeCompare(right.node.path),
				);
			}

			return {
				cluster,
				filteredNodes,
				maxScore: Math.max(...filteredNodes.map((entry) => entry.score), 0),
			};
		})
		.filter((entry) => entry.filteredNodes.length > 0);

	if (normalizedSearch) {
		filteredClusters.sort(
			(left, right) => right.maxScore - left.maxScore || left.cluster.localeCompare(right.cluster),
		);
	}

	return filteredClusters.flatMap(({ cluster, filteredNodes }) =>
		filteredNodes.map((entry, index) => ({
			cluster,
			keywords: entry.keywords,
			node: entry.node,
			showClusterHeading: index === 0,
			showSeparator: index === filteredNodes.length - 1,
		})),
	);
};

const getNextSelectedValue = ({
	event,
	filteredRows,
	selectedValue,
}: {
	event: React.KeyboardEvent<HTMLInputElement>;
	filteredRows: FilteredNodeRow[];
	selectedValue: string | undefined;
}) => {
	if (filteredRows.length === 0) {
		return undefined;
	}

	const currentIndex = filteredRows.findIndex((row) => row.node.path === selectedValue);

	switch (event.key) {
		case "ArrowDown":
			return filteredRows[currentIndex >= 0 ? (currentIndex + 1) % filteredRows.length : 0]?.node.path;
		case "ArrowUp":
			return filteredRows[
				currentIndex >= 0 ? (currentIndex - 1 + filteredRows.length) % filteredRows.length : filteredRows.length - 1
			]?.node.path;
		case "Home":
			return filteredRows[0]?.node.path;
		case "End":
			return filteredRows.at(-1)?.node.path;
		default:
			return undefined;
	}
};

function NodeCommandList(props: GraphCommandMenuProps & { onClose?: () => void }) {
	const nodesByClusterMap = useNodesByClusterMap(props.nodes);
	const [search, setSearch] = useState("");
	const [selectedValue, setSelectedValue] = useState<string | undefined>(undefined);
	const listRef = useRef<HTMLDivElement>(null);

	const filteredRows = useMemo(
		() => getFilteredNodeRows(nodesByClusterMap, search),
		[nodesByClusterMap, search],
	);

	const selectedIndex = useMemo(
		() => filteredRows.findIndex((row) => row.node.path === selectedValue),
		[filteredRows, selectedValue],
	);

	const rowVirtualizer = useVirtualizer({
		count: filteredRows.length,
		estimateSize: () => 68,
		getItemKey: (index) => filteredRows[index]?.node.path ?? index,
		getScrollElement: () => listRef.current,
		overscan: 10,
	});

	useEffect(() => {
		if (filteredRows.length === 0) {
			setSelectedValue(undefined);
			props.onHighlight(undefined);
			return;
		}

		if (selectedValue && filteredRows.some((row) => row.node.path === selectedValue)) {
			return;
		}

		setSelectedValue(filteredRows[0]?.node.path);
	}, [filteredRows, props.onHighlight, selectedValue]);

	useEffect(() => {
		if (selectedIndex < 0) {
			return;
		}

		rowVirtualizer.scrollToIndex(selectedIndex, {
			align: "auto",
		});
	}, [rowVirtualizer, selectedIndex]);

	const virtualRows = rowVirtualizer.getVirtualItems();

	return (
		<Command loop shouldFilter={false} value={selectedValue} onValueChange={setSelectedValue}>
			<CommandInput
				placeholder="Type a command or search..."
				value={search}
				onValueChange={setSearch}
				onKeyDown={(event) => {
					const nextSelectedValue = getNextSelectedValue({
						event,
						filteredRows,
						selectedValue,
					});

					if (!nextSelectedValue) {
						return;
					}

					event.preventDefault();
					setSelectedValue(nextSelectedValue);
					props.onHighlight(nextSelectedValue);
				}}
			/>
			<CommandList ref={listRef}>
				<CommandEmpty>No results found.</CommandEmpty>
				{filteredRows.length === 0 ? null : (
					<div
						className="relative"
						style={{
							height: `${rowVirtualizer.getTotalSize()}px`,
						}}
					>
						{virtualRows.map((virtualRow) => {
							const row = filteredRows[virtualRow.index];

							if (!row) {
								return null;
							}

							return (
								<div
									key={virtualRow.key}
									data-index={virtualRow.index}
									ref={rowVirtualizer.measureElement}
									className="absolute left-0 top-0 w-full"
									style={{
										transform: `translateY(${virtualRow.start}px)`,
									}}
								>
									{row.showClusterHeading ? (
										<div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
											{row.cluster}
										</div>
									) : null}
									<CommandItem
										value={row.node.path}
										keywords={row.keywords}
										onMouseEnter={() => {
											setSelectedValue(row.node.path);
											props.onHighlight(row.node.path);
										}}
										onSelect={(value) => {
											props.onSelect(value);
											props.onClose?.();
										}}
									>
										<div className="flex min-w-0 flex-col">
											<span className="truncate">{row.node.name}</span>
											<span className="truncate text-xs text-slate-500">{row.node.path}</span>
										</div>
									</CommandItem>
									{row.showSeparator ? <CommandSeparator alwaysRender /> : null}
								</div>
							);
						})}
					</div>
				)}
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
					className="max-w-100 w-full justify-between"
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
