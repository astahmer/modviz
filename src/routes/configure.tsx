import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Play, LoaderCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { fetchModvizBundle } from "~/utils/modviz-data";

export const Route = createFileRoute("/configure")({
	ssr: false,
	loader: () => fetchModvizBundle(),
	component: ConfigureRoute,
});

function ConfigureRoute() {
	const bundle = Route.useLoaderData();
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	// Form state for command builder
	const [outputFile, setOutputFile] = useState("modviz.json");
	const [enableLlm, setEnableLlm] = useState(false);
	const [ignoreDynamic, setIgnoreDynamic] = useState(false);
	const [nodeModules, setNodeModules] = useState(false);
	const [packageQuery, setPackageQuery] = useState("");
	const [nodeQuery, setNodeQuery] = useState("");

	const buildCommand = () => {
		const envVarName = import.meta.env.modvizPath ? "MODVIZ_PATH" : "modviz-path";
		const basePath = import.meta.env.modvizPath || "./path/to/project";
		let cmd = `pnpm exec modviz ${basePath}`;

		if (outputFile && outputFile !== "modviz.json") {
			cmd += ` --output-file=${outputFile}`;
		}
		if (enableLlm) cmd += ` --llm`;
		if (ignoreDynamic) cmd += ` --ignore-dynamic`;
		if (nodeModules) cmd += ` --node-modules`;
		if (packageQuery) cmd += ` --package=${packageQuery}`;
		if (nodeQuery) cmd += ` --node=${nodeQuery}`;

		return cmd;
	};

	const copyToClipboard = (text: string, index: number) => {
		navigator.clipboard.writeText(text);
		setCopiedIndex(index);
		setTimeout(() => setCopiedIndex(null), 2000);
	};

	const runCommand = async () => {
		const cmd = buildCommand();
		setIsRunning(true);
		try {
			await navigator.clipboard.writeText(cmd);
			setCopiedIndex(0);
			setTimeout(() => setCopiedIndex(null), 2000);
		} catch (error) {
			console.error("Failed to copy command:", error);
		} finally {
			setIsRunning(false);
		}
	};

	const cmd = buildCommand();

	return (
		<ModvizLayout>
			<div className="max-w-3xl space-y-6">
				<div>
					<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
						Command Configuration
					</h1>
					<p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
						Configure and run the analyzer from your terminal.
					</p>
				</div>

				{/* Command Editor */}
				<section className="rounded-[16px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
						Build Command
					</h2>
					<div className="space-y-4">
						{/* Output file */}
						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Output File
							</label>
							<Input
								value={outputFile}
								onChange={(e) => setOutputFile(e.target.value)}
								placeholder="modviz.json"
								className="mt-1"
							/>
						</div>

						{/* Flags as checkboxes */}
						<div className="space-y-2">
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={enableLlm}
									onChange={(e) => setEnableLlm(e.target.checked)}
									className="rounded"
								/>
								<span className="text-xs font-medium text-slate-700 dark:text-slate-300">
									Enable LLM analysis (--llm)
								</span>
							</label>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={ignoreDynamic}
									onChange={(e) => setIgnoreDynamic(e.target.checked)}
									className="rounded"
								/>
								<span className="text-xs font-medium text-slate-700 dark:text-slate-300">
									Ignore dynamic imports (--ignore-dynamic)
								</span>
							</label>
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={nodeModules}
									onChange={(e) => setNodeModules(e.target.checked)}
									className="rounded"
								/>
								<span className="text-xs font-medium text-slate-700 dark:text-slate-300">
									Include node_modules (--node-modules)
								</span>
							</label>
						</div>

						{/* Query fields */}
						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Filter package (optional)
							</label>
							<Input
								value={packageQuery}
								onChange={(e) => setPackageQuery(e.target.value)}
								placeholder="e.g., @namespace/package"
								className="mt-1 text-xs"
							/>
						</div>

						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Filter node (optional)
							</label>
							<Input
								value={nodeQuery}
								onChange={(e) => setNodeQuery(e.target.value)}
								placeholder="e.g., src/utils"
								className="mt-1 text-xs"
							/>
						</div>

						{/* Command display & actions */}
						<div className="pt-2 border-t border-slate-200 dark:border-slate-800">
							<p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
								Run this command in your terminal:
							</p>
							<div className="flex items-center gap-2">
								<code className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 overflow-x-auto">
									{cmd}
								</code>
								<Button
									size="sm"
									variant="outline"
									onClick={() => copyToClipboard(cmd, 0)}
									disabled={isRunning}
									className="shrink-0"
									title="Copy command"
								>
									{copiedIndex === 0 ? "✓" : <Copy className="size-3.5" />}
								</Button>
								<Button
									size="sm"
									onClick={runCommand}
									disabled={isRunning}
									className="shrink-0 gap-1.5 bg-sky-600 hover:bg-sky-700"
									title="Copy command to clipboard"
								>
									{isRunning ? (
										<LoaderCircle className="size-3.5 animate-spin" />
									) : (
										<>
											<Play className="size-3.5" />
											Run
										</>
									)}
								</Button>
							</div>
						</div>
					</div>
				</section>

				{/* Current dataset info */}
				<section className="rounded-[16px] border border-slate-200/70 bg-white/90 p-4 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
						Current Dataset
					</h2>
					<div className="grid gap-3 grid-cols-2 sm:grid-cols-4 text-xs">
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">Nodes</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.totalNodes.toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">Workspace</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.workspaceNodes.toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">Packages</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{bundle.summary.overview.workspacePackages.toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">LLM Report</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{bundle.summary.hasLlm ? "✓" : "—"}
							</p>
						</div>
					</div>
				</section>
			</div>
		</ModvizLayout>
	);
}
