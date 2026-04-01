import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { useModvizBundle } from "~/utils/modviz-data";

type CommandBuilderState = {
	launchUi: boolean;
	outputFile: string;
	enableLlm: boolean;
	enableAiAnalysis: boolean;
	ignoreDynamic: boolean;
	llmModel: string;
	nodeModules: boolean;
	packageQuery: string;
	nodeQuery: string;
	snapshotName: string;
};

const defaultCommandBuilderState: CommandBuilderState = {
	launchUi: true,
	outputFile: "modviz.json",
	enableLlm: false,
	enableAiAnalysis: false,
	ignoreDynamic: false,
	llmModel: "gpt-4.1-mini",
	nodeModules: false,
	packageQuery: "",
	nodeQuery: "",
	snapshotName: "",
};

const quoteCliValue = (value: string) =>
	/\s/.test(value) ? JSON.stringify(value) : value;

const buildAnalyzeCommand = (
	entryFile: string,
	config: CommandBuilderState,
) => {
	const parts = ["pnpm", "exec", "modviz", "analyze", quoteCliValue(entryFile)];

	if (
		config.outputFile &&
		config.outputFile !== defaultCommandBuilderState.outputFile
	) {
		parts.push(`--output-file=${quoteCliValue(config.outputFile)}`);
	}
	if (config.launchUi) {
		parts.push("--ui");
	}
	if (config.enableLlm) {
		parts.push("--llm");
	}
	if (config.enableAiAnalysis) {
		parts.push("--llm-analyze");
	}
	if (config.enableAiAnalysis && config.llmModel.trim()) {
		parts.push(`--llm-model=${quoteCliValue(config.llmModel.trim())}`);
	}
	if (config.ignoreDynamic) {
		parts.push("--ignore-dynamic");
	}
	if (config.nodeModules) {
		parts.push("--node-modules");
	}
	if (config.snapshotName.trim()) {
		parts.push(`--snapshot-name=${quoteCliValue(config.snapshotName.trim())}`);
	}
	if (config.packageQuery.trim()) {
		parts.push(`--package=${quoteCliValue(config.packageQuery.trim())}`);
	}
	if (config.nodeQuery.trim()) {
		parts.push(`--node=${quoteCliValue(config.nodeQuery.trim())}`);
	}

	return parts.join(" ");
};

export const Route = createFileRoute("/configure")({
	ssr: false,
	component: ConfigureRoute,
});

function ConfigureRoute() {
	const bundle = useModvizBundle();
	const [config, setConfig] = useState(defaultCommandBuilderState);
	const [didCopy, setDidCopy] = useState(false);

	const updateConfig = <K extends keyof CommandBuilderState>(
		key: K,
		value: CommandBuilderState[K],
	) => {
		setConfig((current) => ({ ...current, [key]: value }));
	};

	const copyToClipboard = async (text: string) => {
		await navigator.clipboard.writeText(text);
		setDidCopy(true);
		window.setTimeout(() => setDidCopy(false), 2000);
	};

	const cmd = useMemo(() => {
		const basePath = bundle.graph?.metadata.entrypoints[0] || "./src/index.ts";
		return buildAnalyzeCommand(basePath, config);
	}, [bundle.graph?.metadata.entrypoints, config]);
	const summary = bundle.summary;
	const toggleFields = [
		{
			key: "launchUi" as const,
			label: "Launch web UI after analyze (--ui)",
		},
		{
			key: "enableLlm" as const,
			label: "Enable LLM analysis (--llm)",
		},
		{
			key: "enableAiAnalysis" as const,
			label: "Generate AI summary (--llm-analyze)",
		},
		{
			key: "ignoreDynamic" as const,
			label: "Ignore dynamic imports (--ignore-dynamic)",
		},
		{
			key: "nodeModules" as const,
			label: "Include node_modules (--node-modules)",
		},
	] as const;

	return (
		<ModvizLayout projectTitle={bundle.projectTitle}>
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
								value={config.outputFile}
								onChange={(e) => updateConfig("outputFile", e.target.value)}
								placeholder="modviz.json"
								className="mt-1"
							/>
						</div>

						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Snapshot name (optional)
							</label>
							<Input
								value={config.snapshotName}
								onChange={(e) => updateConfig("snapshotName", e.target.value)}
								placeholder="before-refactor"
								className="mt-1"
							/>
						</div>

						<div className="space-y-2">
							{toggleFields.map((field) => (
								<label key={field.key} className="flex cursor-pointer items-center gap-2">
									<input
										type="checkbox"
										checked={config[field.key]}
										onChange={(e) => updateConfig(field.key, e.target.checked)}
										className="rounded"
									/>
									<span className="text-xs font-medium text-slate-700 dark:text-slate-300">
										{field.label}
									</span>
								</label>
							))}
						</div>

						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								AI model (optional)
							</label>
							<Input
								value={config.llmModel}
								onChange={(e) => updateConfig("llmModel", e.target.value)}
								placeholder="gpt-4.1-mini"
								className="mt-1 text-xs"
								disabled={!config.enableAiAnalysis}
							/>
						</div>

						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Filter package (optional)
							</label>
							<Input
								value={config.packageQuery}
								onChange={(e) => updateConfig("packageQuery", e.target.value)}
								placeholder="e.g., @namespace/package"
								className="mt-1 text-xs"
							/>
						</div>

						<div>
							<label className="text-xs font-medium text-slate-700 dark:text-slate-300">
								Filter node (optional)
							</label>
							<Input
								value={config.nodeQuery}
								onChange={(e) => updateConfig("nodeQuery", e.target.value)}
								placeholder="e.g., src/utils"
								className="mt-1 text-xs"
							/>
						</div>

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
									onClick={() => void copyToClipboard(cmd)}
									className="shrink-0 gap-1.5"
									title="Copy command"
								>
									{didCopy ? (
										<>
											<Check className="size-3.5" />
											Copied
										</>
									) : (
										<>
											<Copy className="size-3.5" />
											Copy command
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
								{(summary?.overview.totalNodes ?? 0).toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">Workspace</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{(summary?.overview.workspaceNodes ?? 0).toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">Packages</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{(summary?.overview.workspacePackages ?? 0).toLocaleString()}
							</p>
						</div>
						<div>
							<p className="font-semibold text-slate-500 dark:text-slate-400">LLM Report</p>
							<p className="text-lg font-bold text-slate-900 dark:text-slate-100">
								{summary?.hasLlm ? "✓" : "—"}
							</p>
						</div>
					</div>
					{bundle.setup.status !== "ready" ? (
						<p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{bundle.setup.message}</p>
					) : null}
				</section>
			</div>
		</ModvizLayout>
	);
}
