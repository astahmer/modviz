import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Play } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { LoadingState } from "~/components/ui/loading-state";
import { fetchModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/configure")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: ConfigureRoute,
});

function ConfigureRoute() {
	const bundle = Route.useLoaderData();
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

	const buildCommand = () => {
		const envVarName = import.meta.env.modvizPath ? "MODVIZ_PATH" : "modviz-path";
		const cmd = `pnpm exec modviz ${import.meta.env.modvizPath || "./path/to/project"}`;
		return cmd;
	};

	const outputCommand = `modviz-output.json`;

	const copyToClipboard = (text: string, index: number) => {
		navigator.clipboard.writeText(text);
		setCopiedIndex(index);
		setTimeout(() => setCopiedIndex(null), 2000);
	};

	return (
		<ModvizLayout>
			<div className="space-y-8 max-w-4xl">
				<div>
					<h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
						Command Configuration
					</h1>
					<p className="mt-2 text-slate-600 dark:text-slate-400">
						Re-run the analysis or modify flags to generate fresh module graph data.
					</p>
				</div>

				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
						Current Configuration
					</h2>
					<p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
						This shows how the current graph was generated. Modify and run to refresh your analysis.
					</p>

					<div className="mt-6 space-y-4">
						<div>
							<label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
								Build Command
							</label>
							<div className="mt-2 flex items-center gap-2">
								<code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
									{buildCommand()}
								</code>
								<Button
									size="sm"
									variant="outline"
									onClick={() => copyToClipboard(buildCommand(), 0)}
								>
									{copiedIndex === 0 ? "✓" : <Copy className="size-4" />}
								</Button>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
								Output File
							</label>
							<div className="mt-2 flex items-center gap-2">
								<code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
									{outputCommand}
								</code>
								<Button
									size="sm"
									variant="outline"
									onClick={() => copyToClipboard(outputCommand, 1)}
								>
									{copiedIndex === 1 ? "✓" : <Copy className="size-4" />}
								</Button>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
								Optional LLM Report
							</label>
							<div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
								<p>To enable hotspot analysis, generate an LLM-powered report:</p>
								<code className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
									modviz-output.llm.json
								</code>
								<p className="mt-2">
									The LLM report should contain transitive import analysis and hotspot
									recommendations alongside the base graph output.
								</p>
							</div>
						</div>
					</div>
				</section>

				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-6 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
						Current Dataset
					</h2>
					<div className="mt-4 grid gap-4 md:grid-cols-2">
						<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Total Nodes
							</p>
							<p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.totalNodes.toLocaleString()}
							</p>
							<p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
								{bundle.summary.overview.workspaceNodes.toLocaleString()} workspace,{" "}
								{bundle.summary.overview.externalNodes.toLocaleString()} external
							</p>
						</div>
						<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Packages
							</p>
							<p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.workspacePackages.toLocaleString()}
							</p>
							<p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
								workspace + {bundle.summary.overview.externalPackages.toLocaleString()} external
							</p>
						</div>
						<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Barrel Files
							</p>
							<p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.barrelFiles.toLocaleString()}
							</p>
						</div>
						<div className="rounded-lg bg-slate-50/80 p-4 dark:bg-slate-900/50">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								LLM Report
							</p>
							<p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">
								{bundle.summary.hasLlm ? "✓" : "—"}
							</p>
							<p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
								{bundle.summary.hasLlm ? "Loaded" : "Not found"}
							</p>
						</div>
					</div>
				</section>

				<section className="rounded-[24px] border border-amber-200/70 bg-amber-50/80 p-6 dark:border-amber-900/30 dark:bg-amber-950/30">
					<h3 className="font-semibold text-amber-900 dark:text-amber-100">
						💡 How to refresh the analysis
					</h3>
					<ol className="mt-3 space-y-2 text-sm leading-6 text-amber-800 dark:text-amber-200">
						<li>
							<strong>1. Run the build command</strong> in your terminal from the project root
								to generate a fresh <code>modviz-output.json</code>.
						</li>
						<li>
							<strong>2. Optional: Generate LLM insights</strong> to unlock hotspot analysis and
								transitive import rankings.
						</li>
						<li>
							<strong>3. Reload this page</strong> or navigate to any view to see updated results.
						</li>
					</ol>
				</section>
			</div>
		</ModvizLayout>
	);
}
