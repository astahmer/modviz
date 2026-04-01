import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeftRight, FolderClock, Terminal } from "lucide-react";
import type { ModvizDataBundle } from "~/utils/modviz-data";

export function SetupView(props: { bundle: ModvizDataBundle }) {
	const tone =
		props.bundle.setup.status === "invalid"
			? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
			: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200";

	return (
		<div className="space-y-6">
			<section className={`rounded-[24px] border p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] ${tone}`}>
				<div className="flex items-start gap-4">
					<div className="rounded-2xl bg-white/70 p-3 dark:bg-slate-950/30">
						<AlertTriangle className="size-5" />
					</div>
					<div className="space-y-3">
						<div>
							<h2 className="text-lg font-semibold">No active modviz snapshot</h2>
							<p className="mt-2 text-sm leading-6 opacity-90">{props.bundle.setup.message}</p>
						</div>
						<div className="rounded-2xl border border-current/15 bg-white/70 px-4 py-3 font-mono text-xs dark:bg-slate-950/30">
							pnpm exec modviz analyze ./src/index.ts --ui --snapshot-name=first-run
						</div>
						<div className="flex flex-wrap gap-2">
							<Link to="/configure" className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/80 px-4 py-2 text-sm font-medium dark:bg-slate-950/30">
								<Terminal className="size-4" />
								Open command builder
							</Link>
							{props.bundle.history.length > 0 ? (
								<Link to="/compare" search={{ baselineSnapshot: "" }} className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/80 px-4 py-2 text-sm font-medium dark:bg-slate-950/30">
									<ArrowLeftRight className="size-4" />
									Open compare with history
								</Link>
							) : null}
						</div>
					</div>
				</div>
			</section>

			<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
				<div className="flex items-center gap-3">
					<div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
						<FolderClock className="size-5" />
					</div>
					<div>
						<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Named snapshot history</h3>
						<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Saved runs can be loaded in Compare even before a current graph is active.
						</p>
					</div>
				</div>
				<div className="mt-4 space-y-2">
					{props.bundle.history.length === 0 ? (
						<p className="text-sm text-slate-500 dark:text-slate-400">No named snapshots saved yet.</p>
					) : (
						props.bundle.history.slice(0, 12).map((snapshot) => (
							<div key={snapshot.id} className="rounded-2xl bg-slate-50/90 px-4 py-3 dark:bg-slate-900/70">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="font-medium text-slate-900 dark:text-slate-100">{snapshot.id}</p>
										<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
											{snapshot.totalNodes} nodes{snapshot.generatedAt ? ` • ${new Date(snapshot.generatedAt).toLocaleString()}` : ""}
										</p>
									</div>
									<Link to="/compare" search={{ baselineSnapshot: snapshot.id }} className="text-sm font-medium text-sky-700 dark:text-sky-300">
										Use in compare
									</Link>
								</div>
							</div>
						))
					)}
				</div>
			</section>
		</div>
	);
}
