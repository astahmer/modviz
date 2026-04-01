import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ExternalLink, FileCode2, Folder, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { VizNode } from "../../../mod/types";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ImportDisplay } from "~/components/modviz/import-display";
import {
	filterNodesByScope,
	getWorkspacePackageNames,
	type ModvizDataBundle,
	type ModvizScope,
} from "~/utils/modviz-data";

type ReadyBundle = ModvizDataBundle & {
	graph: NonNullable<ModvizDataBundle["graph"]>;
};

type ExplorerSearch = {
	q: string;
	selected: string;
	scope: ModvizScope;
};

type TreeNode = {
	id: string;
	label: string;
	path: string;
	kind: "folder" | "file";
	children: TreeNode[];
	file?: VizNode;
};

const defaultGraphSearch = {
	adjustSizes: false,
	cluster: "",
	externalGrouping: "package" as const,
	focus: "",
	gravity: 0,
	hideClusterLabels: false,
	iterations: 0,
	linLogMode: false,
	nodeSizeScale: 0,
	outboundAttractionDistribution: true,
	scalingRatio: 0,
	scope: "all" as const,
	strongGravityMode: false,
};

const defaultImportSearch = {
	exclude: "",
	include: "",
	mode: "contains" as const,
	module: "",
	preset: "",
	scope: "all" as const,
	symbol: "",
};

export function ExplorerView(props: {
	bundle: ReadyBundle;
	search: ExplorerSearch;
	onSearchChange: (patch: Partial<ExplorerSearch>) => void;
}) {
	const { graph } = props.bundle;
	const workspacePackageNames = useMemo(
		() => getWorkspacePackageNames(graph),
		[graph],
	);
	const scopedNodes = useMemo(
		() => filterNodesByScope(graph.nodes, workspacePackageNames, props.search.scope),
		[graph.nodes, props.search.scope, workspacePackageNames],
	);
	const tree = useMemo(() => buildFileTree(scopedNodes), [scopedNodes]);
	const selectedNode = useMemo(
		() =>
			scopedNodes.find((node) => node.path === props.search.selected) ??
				scopedNodes[0] ??
				null,
		[props.search.selected, scopedNodes],
	);
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
		new Set(selectedNode ? getAncestorPaths(selectedNode.path) : []),
	);

	useEffect(() => {
		if (!selectedNode) {
			return;
		}

		setExpandedPaths(
			(previous) => new Set([...previous, ...getAncestorPaths(selectedNode.path)]),
		);
	}, [selectedNode]);

	const normalizedQuery = props.search.q.trim().toLowerCase();
	const visibleTree = useMemo(
		() => filterTree(tree, normalizedQuery),
		[normalizedQuery, tree],
	);

	return (
		<div className="flex h-screen flex-col gap-6 lg:flex-row lg:h-auto">
			<section className="flex flex-col rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70 lg:w-[35%]">
				<div className="flex flex-wrap gap-2">
					{([
						["all", "All files"],
						["workspace", "Monorepo"],
						["external", "node_modules"],
					] as const).map(([value, label]) => (
						<Button
							key={value}
							variant={props.search.scope === value ? "default" : "outline"}
							size="sm"
							onClick={() => props.onSearchChange({ scope: value, selected: "" })}
						>
							{label}
						</Button>
					))}
				</div>
				<div className="mt-4 flex gap-3">
					<Input
						placeholder="Search file or folder path"
						value={props.search.q}
						onChange={(event) =>
							props.onSearchChange({ q: event.currentTarget.value })
						}
					/>
					<Button
						variant="outline"
						onClick={() => setExpandedPaths(new Set())}
					>
						Collapse
					</Button>
					<Button
						variant="outline"
						onClick={() =>
							setExpandedPaths(new Set(flattenFolderPaths(visibleTree)))
						}
					>
						Expand
					</Button>
				</div>
				<div className="mt-4 flex-1 overflow-auto">
					<div className="space-y-1 pr-2">
						{visibleTree.children.map((child) => (
							<FileTreeItem
								key={child.id}
								node={child}
								expandedPaths={expandedPaths}
								selectedPath={selectedNode?.path ?? ""}
								onToggle={(path) => {
									setExpandedPaths((previous) => {
										const next = new Set(previous);
										if (next.has(path)) {
											next.delete(path);
										} else {
											next.add(path);
										}
										return next;
									});
								}}
								onSelect={(path) => {
									setExpandedPaths(
										(previous) => new Set([...previous, ...getAncestorPaths(path)]),
									);
									props.onSearchChange({ selected: path });
								}}
							/>
						))}
					</div>
				</div>
			</section>

			<section className="flex flex-col rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70 lg:w-[65%] lg:overflow-y-auto">
				{selectedNode ? (
					<div className="space-y-6">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
								Selected file
							</p>
							<h2 className="mt-2 break-words text-lg font-semibold text-slate-900 dark:text-slate-100 sm:text-xl">
								{selectedNode.path}
							</h2>
							<p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
								{selectedNode.package?.name
									? `${selectedNode.package.name} • `
									: ""}
								{selectedNode.cluster ?? selectedNode.type}
							</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<Link
								to="/graph"
								search={{
									...defaultGraphSearch,
									focus: selectedNode.path,
									scope: selectedNode.path.includes("node_modules")
										? "external"
										: "workspace",
								}}
								className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
							>
									<ExternalLink className="size-4" />
									Open in graph
								</Link>
								<Link
									to="/imports"
									search={{
										...defaultImportSearch,
										include: selectedNode.path,
										scope: selectedNode.path.includes("node_modules")
											? "external"
											: "workspace",
									}}
									className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
								>
									<ExternalLink className="size-4" />
									Use as importer filter
								</Link>
								<Link
									to="/trace"
									search={{ package: "", node: selectedNode.path, limit: 10 }}
									className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
								>
									<ExternalLink className="size-4" />
									Trace origins
								</Link>
							</div>

						<div className="grid gap-4 md:grid-cols-3">
							<Metric label="Direct imports" value={selectedNode.imports.length} />
							<Metric label="Imported by" value={selectedNode.importedBy.length} />
							<Metric label="Exports" value={selectedNode.exports.length} />
						</div>

						<CollapsibleSection title="Imports" description="Grouped into import statements so scanning looks closer to the source file.">
							<ImportDisplay imports={selectedNode.imports} emptyMessage="No direct imports recorded for this file." showViewToggle />
						</CollapsibleSection>

						<CollapsibleSection title="Imported by" description="Direct inbound edges into this file.">
							<ImportedByCard
								items={selectedNode.importedBy}
								onSelect={(path) => props.onSearchChange({ selected: path })}
							/>
						</CollapsibleSection>
					</div>
				) : (
					<div className="flex min-h-[24rem] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
						No file matched the current explorer scope.
					</div>
				)}
			</section>
		</div>
	);
}

function Metric(props: { label: string; value: number }) {
	return (
		<div className="rounded-[20px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
			<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
				{props.value}
			</p>
		</div>
	);
}

function CollapsibleSection(props: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(true);
	return (
		<div className="rounded-[24px] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-3 text-left"
			>
				<ChevronDown
					className={`size-5 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
				/>
				<div className="flex-1">
					<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
						{props.title}
					</h3>
					<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
						{props.description}
					</p>
				</div>
			</button>
			{isOpen && <div className="mt-4">{props.children}</div>}
		</div>
	);
}

function ImportedByCard(props: {
	items: string[];
	onSelect: (path: string) => void;
}) {
	return (
		<div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
			{props.items.length ? (
				props.items.map((item) => (
					<button
						key={item}
						type="button"
						onClick={() => props.onSelect(item)}
						className="flex w-full items-center gap-2 rounded-2xl bg-white px-3 py-3 text-left text-sm text-slate-700 hover:bg-sky-50 hover:text-sky-800 dark:bg-slate-950/80 dark:text-slate-200 dark:hover:bg-sky-500/10 dark:hover:text-sky-200"
					>
						<FileCode2 className="size-4 shrink-0" />
						<span className="truncate">{item}</span>
					</button>
				))
			) : (
				<p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
					No inbound importers recorded for this file.
				</p>
			)}
		</div>
	);
}

function FileTreeItem(props: {
	node: TreeNode;
	expandedPaths: Set<string>;
	selectedPath: string;
	onToggle: (path: string) => void;
	onSelect: (path: string) => void;
	depth?: number;
}) {
	const depth = props.depth ?? 0;
	const isExpanded = props.expandedPaths.has(props.node.path);

	if (props.node.kind === "file") {
		return (
			<button
				type="button"
				onClick={() => props.onSelect(props.node.path)}
				className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${props.selectedPath === props.node.path ? "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"}`}
				style={{ paddingLeft: `${depth * 16 + 12}px` }}
			>
				<FileCode2 className="size-4 shrink-0" />
				<span className="truncate">{props.node.label}</span>
			</button>
		);
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => props.onToggle(props.node.path)}
				className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
				style={{ paddingLeft: `${depth * 16 + 12}px` }}
			>
				{isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
				{isExpanded ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
				<span className="truncate">{props.node.label}</span>
			</button>
			{isExpanded ? (
				<div className="space-y-1">
					{props.node.children.map((child) => (
						<FileTreeItem
							key={child.id}
							node={child}
							expandedPaths={props.expandedPaths}
							selectedPath={props.selectedPath}
							onToggle={props.onToggle}
							onSelect={props.onSelect}
							depth={depth + 1}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function buildFileTree(nodes: VizNode[]): TreeNode {
	const root: TreeNode = {
		id: "root",
		label: "root",
		path: "",
		kind: "folder",
		children: [],
	};

	for (const node of nodes) {
		const segments = node.path.split("/").filter(Boolean);
		let cursor = root;
		let currentPath = "";

		segments.forEach((segment, index) => {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const isFile = index === segments.length - 1;
			let child = cursor.children.find(
				(existing) => existing.label === segment && existing.kind === (isFile ? "file" : "folder"),
			);

			if (!child) {
				child = {
					id: currentPath,
					label: segment,
					path: currentPath,
					kind: isFile ? "file" : "folder",
					children: [],
					file: isFile ? node : undefined,
				};
				cursor.children.push(child);
				cursor.children.sort((left, right) => {
					if (left.kind !== right.kind) {
						return left.kind === "folder" ? -1 : 1;
					}
					return left.label.localeCompare(right.label);
				});
			}

			cursor = child;
		});
	}

	return root;
}

function filterTree(node: TreeNode, query: string): TreeNode {
	if (!query) {
		return node;
	}

	if (node.kind === "file") {
		return node.path.toLowerCase().includes(query)
			? node
			: { ...node, children: [] };
	}

	const children = node.children
		.map((child) => filterTree(child, query))
		.filter((child) => child.kind === "file" ? child.path.toLowerCase().includes(query) : child.children.length || child.path.toLowerCase().includes(query));

	return { ...node, children };
}

function flattenFolderPaths(node: TreeNode): string[] {
	if (node.kind === "file") {
		return [];
	}

	return [node.path, ...node.children.flatMap(flattenFolderPaths)];
}

function getAncestorPaths(path: string) {
	const segments = path.split("/").filter(Boolean);
	return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}
