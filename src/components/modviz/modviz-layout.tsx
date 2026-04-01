import { Link, useRouter } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	BarChart3,
	Boxes,
	FolderTree,
	GitBranchPlus,
	Network,
	RefreshCw,
	Route,
	Settings,
	SquareStack,
	Trello,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { useJsonUpdates } from "~/hooks/use-json-updates";
import { cn } from "~/lib/utils";
import {
	getActiveSnapshotSelection,
	setActiveSnapshotSelection,
	useModvizBundle,
} from "~/utils/modviz-data";

const navigationItems = [
	{ to: "/", label: "Overview", icon: Boxes },
	{ to: "/graph", label: "Bubble graph", icon: Network },
	{ to: "/compare", label: "Compare", icon: ArrowLeftRight },
	{ to: "/summary", label: "Summary", icon: BarChart3 },
	{ to: "/imports", label: "Import search", icon: GitBranchPlus },
	{ to: "/trace", label: "Trace", icon: Route },
	{ to: "/explorer", label: "Explorer", icon: FolderTree },
	{ to: "/hierarchy", label: "Hierarchy", icon: SquareStack },
	{ to: "/treemap", label: "Treemap", icon: Trello },
] as const;

export function ModvizLayout(props: PropsWithChildren<{
	title?: string;
	description?: string;
	actions?: ReactNode;
	projectTitle?: string | null;
}>) {
	const bundle = useModvizBundle();
	const router = useRouter();
	const { isRefreshing, status } = useJsonUpdates();
	const activeSelection = getActiveSnapshotSelection();
	const [customGraphPath, setCustomGraphPath] = useState(activeSelection.graphPath);
	const activeGraphPath = status?.graphPath ?? bundle.setup.graphPath;
	const graphFileName = activeGraphPath.split(/[\\/]/).at(-1) ?? "modviz.json";
	const activeHistorySnapshot = useMemo(
		() => bundle.history.find((snapshot) => snapshot.graphPath === activeGraphPath) ?? null,
		[bundle.history, activeGraphPath],
	);
	const liveSyncLabel = isRefreshing ? "Refreshing graph data" : "Live JSON sync";
	const liveSyncTone = isRefreshing
		? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200"
		: "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200";

	const applySelection = async (selection?: { snapshotId?: string; graphPath?: string }) => {
		setActiveSnapshotSelection(selection);
		await router.invalidate();
	};

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.12),_transparent_22%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.96))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_20%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.98))]">
			<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
				<header className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.65)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<div>
								<h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
									Modviz {props.projectTitle ? `- ${props.projectTitle}` : ""}
								</h1>
								<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
									{props.description}
								</p>
							</div>
						</div>
						{props.actions ? <div className="shrink-0">{props.actions}</div> : null}
						<Link
							to="/configure"
							className="absolute right-4 top-5 inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-slate-50/90 px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-600 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-sky-500/70 dark:hover:text-sky-200"
							activeProps={{
								className:
									"inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium whitespace-nowrap text-sky-700 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
							}}
						>
							<Settings className="size-4" />
							<span>Configure</span>
						</Link>
					</div>
					<section className="mt-5 rounded-[24px] border border-slate-200/70 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
						<div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto]">
							<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
								<span>Active snapshot</span>
								<select
									className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"
									value={activeHistorySnapshot?.id ?? ""}
									onChange={(event) => {
										const value = event.currentTarget.value;
										setCustomGraphPath("");
										void applySelection(value ? { snapshotId: value } : undefined);
									}}
								>
									<option value="">Default watched file</option>
									{bundle.history.map((snapshot) => (
										<option key={snapshot.id} value={snapshot.id}>
											{snapshot.label || snapshot.id}
										</option>
									))}
								</select>
							</label>
							<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
								<span>Custom graph path</span>
								<input
									className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none"
									placeholder="/absolute/path/to/another-modviz.json"
									value={customGraphPath}
									onChange={(event) => setCustomGraphPath(event.currentTarget.value)}
								/>
							</label>
							<div className="flex items-end gap-2">
								<button
									type="button"
									className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium shadow-xs"
									onClick={() => void applySelection({ graphPath: customGraphPath })}
									disabled={!customGraphPath.trim()}
								>
									Use path
								</button>
								<button
									type="button"
									className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-medium shadow-xs"
									onClick={() => {
										setCustomGraphPath("");
										void applySelection();
									}}
								>
									Reset
								</button>
							</div>
						</div>
					</section>
					<nav className="mt-5 flex flex-wrap gap-2">
						{navigationItems.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										"inline-flex items-center gap-2 rounded-full border border-slate-200/70 px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-600 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500/70 dark:hover:text-sky-200",
									)}
									activeProps={{
										className:
											"inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500 text-white shadow-sm whitespace-nowrap dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950",
									}}
								>
									<Icon className="size-4" />
									<span>{item.label}</span>
								</Link>
							);
						})}
						</nav>
					<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
						<div
							className={cn(
								"inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium",
								liveSyncTone,
							)}
						>
							<RefreshCw className={cn("size-3.5", isRefreshing ? "animate-spin" : "")} />
							<span>{liveSyncLabel}</span>
						</div>
						<span>
							Watching {graphFileName}
							{status?.hasLlm ? " with LLM companion data." : "."}
						</span>
						{activeHistorySnapshot ? (
							<span>Active history snapshot: {activeHistorySnapshot.id}</span>
						) : activeSelection.graphPath ? (
							<span>Custom path override active.</span>
						) : null}
					</div>
				</header>
				<main className="min-h-0 flex-1 py-6">{props.children}</main>
			</div>
		</div>
	);
}
