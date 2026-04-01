import { Link } from "@tanstack/react-router";
import { BarChart3, Boxes, FolderTree, GitBranchPlus, Network, Settings, SquareStack, Trello } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "~/lib/utils";

const navigationItems = [
	{ to: "/", label: "Overview", icon: Boxes },
	{ to: "/graph", label: "Bubble graph", icon: Network },
	{ to: "/summary", label: "Summary", icon: BarChart3 },
	{ to: "/imports", label: "Import search", icon: GitBranchPlus },
	{ to: "/explorer", label: "Explorer", icon: FolderTree },
	{ to: "/hierarchy", label: "Hierarchy", icon: SquareStack },
	{ to: "/treemap", label: "Treemap", icon: Trello },
	{ to: "/configure", label: "Configure", icon: Settings },
] as const;

export function ModvizLayout(props: PropsWithChildren<{
	title?: string;
	description?: string;
	actions?: ReactNode;
}>) {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.12),_transparent_22%),linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(248,250,252,0.96))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_22%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.16),_transparent_20%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.98))]">
			<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
				<header className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.65)] backdrop-blur dark:border-white/10 dark:bg-slate-950/70">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
								modviz workspace
							</p>
							<div>
								<h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
									{props.title}
								</h1>
								<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
									{props.description}
								</p>
							</div>
						</div>
						{props.actions ? <div className="shrink-0">{props.actions}</div> : null}
					</div>
					<nav className="mt-5 flex flex-wrap gap-2">
						{navigationItems.map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.to}
									to={item.to}
									className={cn(
										"inline-flex items-center gap-2 rounded-full border border-slate-200/70 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-sky-500/70 dark:hover:text-sky-200",
									)}
									activeProps={{
										className:
											"inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500 text-white shadow-sm dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950",
									}}
								>
									<Icon className="size-4" />
									<span>{item.label}</span>
								</Link>
							);
						})}
					</nav>
				</header>
				<main className="min-h-0 flex-1 py-6">{props.children}</main>
			</div>
		</div>
	);
}
