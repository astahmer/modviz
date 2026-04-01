import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, FileUp, RotateCcw } from "lucide-react";
import type { ModvizOutput, ModvizSnapshotHistoryItem } from "../../../mod/types";
import { Button } from "~/components/ui/button";
import {
	buildModvizGraphComparison,
	type ChangedNodeSummary,
} from "~/utils/modviz-compare";
import { formatNumber } from "~/utils/formatting";
import { fetchSnapshotGraph } from "~/utils/modviz-data";

type SnapshotState = {
	graph: ModvizOutput;
	label: string;
};

type SnapshotSlot = "baseline" | "current";

const formatSnapshotOptionLabel = (snapshot: ModvizSnapshotHistoryItem) => {
	const generatedLabel = snapshot.generatedAt
		? new Date(snapshot.generatedAt).toLocaleString()
		: null;

	return generatedLabel
		? `${snapshot.label || snapshot.id} • ${generatedLabel}`
		: snapshot.label || snapshot.id;
};

const isModvizOutput = (value: unknown): value is ModvizOutput => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<ModvizOutput>;
	return Boolean(
		candidate.metadata &&
			Array.isArray(candidate.nodes) &&
			Array.isArray(candidate.imports),
	);
};

const deltaLabel = (baseline: number, current: number) => {
	const delta = current - baseline;
	const sign = delta > 0 ? "+" : "";
	return `${sign}${formatNumber.format(delta)}`;
};

const parseSnapshotFile = async (file: File) => {
	const raw = JSON.parse(await file.text()) as unknown;
	if (!isModvizOutput(raw)) {
		throw new Error("The selected file is not a valid modviz graph JSON snapshot.");
	}

	return {
		graph: raw,
		label: file.name,
	} satisfies SnapshotState;
};

function SnapshotCard(props: {
	description: string;
	label: string;
	onFileChange: (file: File) => void;
	secondaryAction?: React.ReactNode;
	snapshot: SnapshotState | null;
	title: string;
}) {
	return (
		<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
						{props.title}
					</p>
					<h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
						{props.snapshot?.label ?? props.label}
					</h2>
					<p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
						{props.description}
					</p>
				</div>
				{props.secondaryAction}
			</div>
			<label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/10 dark:hover:text-sky-200">
				<FileUp className="size-4" />
				<span>Load JSON snapshot</span>
				<input
					accept="application/json,.json"
					className="sr-only"
					type="file"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0];
						if (file) {
							props.onFileChange(file);
						}
						event.currentTarget.value = "";
					}}
				/>
			</label>
			{props.snapshot ? (
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					<MetricCard label="Nodes" value={props.snapshot.graph.nodes.length} />
					<MetricCard
						label="Edges"
						value={props.snapshot.graph.nodes.reduce(
							(sum, node) => sum + node.importees.length,
							0,
						)}
					/>
					<MetricCard
						label="Generated"
						valueLabel={new Date(
							props.snapshot.graph.metadata.generatedAt,
						).toLocaleString()}
					/>
				</div>
			) : null}
		</section>
	);
}

function MetricCard(props: { label: string; value?: number; valueLabel?: string }) {
	return (
		<div className="rounded-[20px] bg-slate-50/90 p-4 dark:bg-slate-900/70">
			<p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<p className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
				{props.valueLabel ?? formatNumber.format(props.value ?? 0)}
			</p>
		</div>
	);
}

function DeltaCard(props: {
	baseline: number;
	current: number;
	label: string;
	note: string;
}) {
	const delta = props.current - props.baseline;
	const tone =
		delta === 0
			? "text-slate-500 dark:text-slate-400"
			: delta > 0
				? "text-emerald-600 dark:text-emerald-300"
				: "text-rose-600 dark:text-rose-300";

	return (
		<div className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<div className="mt-3 flex items-end justify-between gap-4">
				<div>
					<p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
						{formatNumber.format(props.current)}
					</p>
					<p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
						was {formatNumber.format(props.baseline)}
					</p>
				</div>
				<p className={`text-sm font-semibold ${tone}`}>{deltaLabel(props.baseline, props.current)}</p>
			</div>
			<p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
				{props.note}
			</p>
		</div>
	);
}

function ChangeList(props: {
	emptyMessage: string;
	items: string[];
	title: string;
}) {
	return (
		<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
				{props.title}
			</h3>
			<div className="mt-4 max-h-[20rem] space-y-2 overflow-auto pr-2">
				{props.items.length === 0 ? (
					<p className="text-sm text-slate-500 dark:text-slate-400">
						{props.emptyMessage}
					</p>
				) : (
					props.items.slice(0, 80).map((item) => (
						<div
							key={item}
							className="rounded-2xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
						>
							{item}
						</div>
					))
				)}
			</div>
		</section>
	);
}

function ChangedNodesTable(props: { rows: ChangedNodeSummary[] }) {
	return (
		<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
			<h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
				Modules with the largest direct-graph deltas
			</h3>
			<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
				Inbound edges, outbound edges, and import statement counts are compared per path.
			</p>
			<div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800">
				<table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
					<thead className="bg-slate-50/90 dark:bg-slate-900/80">
						<tr>
							<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Path
							</th>
							<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Inbound
							</th>
							<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Outbound
							</th>
							<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
								Imports
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/60">
						{props.rows.length === 0 ? (
							<tr>
								<td
									colSpan={4}
									className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400"
								>
									No direct node-level count changes were detected between these snapshots.
								</td>
							</tr>
						) : (
							props.rows.slice(0, 24).map((row) => (
								<tr key={row.path}>
									<td className="max-w-[32rem] truncate px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-200">
										{row.path}
									</td>
									<td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-200">
										{row.baselineIncoming} → {row.currentIncoming}
									</td>
									<td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-200">
										{row.baselineOutgoing} → {row.currentOutgoing}
									</td>
									<td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-200">
										{row.baselineImports} → {row.currentImports}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function CompareView(props: {
	baselineSnapshotId?: string;
	currentGraph: ModvizOutput | null;
	history: ModvizSnapshotHistoryItem[];
}) {
	const currentServerSnapshot = useMemo(
		() =>
			props.currentGraph
				? {
					graph: props.currentGraph,
					label: "Current served snapshot",
				}
				: null,
		[props.currentGraph],
	);
	const [baseline, setBaseline] = useState<SnapshotState | null>(null);
	const [current, setCurrent] = useState<SnapshotState | null>(currentServerSnapshot);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const comparison = useMemo(() => {
		if (!baseline || !current) {
			return null;
		}

		return buildModvizGraphComparison(baseline.graph, current.graph);
	}, [baseline, current]);

	const loadFileInto = async (slot: SnapshotSlot, file: File) => {
		try {
			setErrorMessage(null);
			const snapshot = await parseSnapshotFile(file);
			if (slot === "baseline") {
				setBaseline(snapshot);
				return;
			}

			setCurrent(snapshot);
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Failed to load the selected snapshot.",
			);
		}
	};

	const loadHistorySnapshot = async (slot: SnapshotSlot, snapshotId: string) => {
		try {
			setErrorMessage(null);
			const graph = await fetchSnapshotGraph(snapshotId);
			const snapshot = { graph, label: snapshotId } satisfies SnapshotState;
			if (slot === "baseline") {
				setBaseline(snapshot);
				return;
			}

			setCurrent(snapshot);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : `Failed to load snapshot ${snapshotId}.`);
		}
	};

	useEffect(() => {
		if (!props.baselineSnapshotId) {
			return;
		}

		void loadHistorySnapshot("baseline", props.baselineSnapshotId);
	}, [props.baselineSnapshotId]);

	return (
		<div className="space-y-6">
			{props.history.length > 0 ? (
				<section className="rounded-[24px] border border-slate-200/70 bg-white/90 p-5 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70">
					<div className="grid gap-4 lg:grid-cols-2">
						<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<span>Load baseline from history</span>
							<select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none" onChange={(event) => { if (event.currentTarget.value) void loadHistorySnapshot("baseline", event.currentTarget.value); }} defaultValue={props.baselineSnapshotId ?? ""}>
								<option value="">Choose snapshot…</option>
								{props.history.map((snapshot) => (
									<option key={snapshot.id} value={snapshot.id}>{formatSnapshotOptionLabel(snapshot)}</option>
								))}
							</select>
						</label>
						<label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
							<span>Load current from history</span>
							<select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none" onChange={(event) => { if (event.currentTarget.value) void loadHistorySnapshot("current", event.currentTarget.value); }} defaultValue="">
								<option value="">Choose snapshot…</option>
								{props.history.map((snapshot) => (
									<option key={snapshot.id} value={snapshot.id}>{formatSnapshotOptionLabel(snapshot)}</option>
								))}
							</select>
						</label>
					</div>
				</section>
			) : null}
			<section className="grid gap-4 xl:grid-cols-2">
				<SnapshotCard
					description="Load the older or baseline snapshot you want to compare against."
					label="No baseline snapshot loaded yet"
					onFileChange={(file) => void loadFileInto("baseline", file)}
					snapshot={baseline}
					title="Baseline"
				/>
				<SnapshotCard
					description="By default this uses the graph currently served by the modviz UI, but you can replace it with another JSON file."
					label={current?.label ?? "No current snapshot loaded yet"}
					onFileChange={(file) => void loadFileInto("current", file)}
					secondaryAction={
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setCurrent(currentServerSnapshot);
									setErrorMessage(null);
								}}
								disabled={!currentServerSnapshot}
							>
								<RotateCcw className="size-4" />
								Use served graph
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									if (!baseline || !current) {
										return;
									}

									setBaseline(current);
									setCurrent(baseline);
								}}
								disabled={!baseline || !current}
							>
								<ArrowLeftRight className="size-4" />
								Swap
							</Button>
						</div>
					}
					snapshot={current}
					title="Current"
				/>
			</section>

			{errorMessage ? (
				<section className="rounded-[24px] border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
					{errorMessage}
				</section>
			) : null}

			{comparison ? (
				<>
					<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
						<DeltaCard
							baseline={comparison.summary.baselineNodes}
							current={comparison.summary.currentNodes}
							label="Nodes"
							note="Module paths present in the compared snapshots."
						/>
						<DeltaCard
							baseline={comparison.summary.baselineEdges}
							current={comparison.summary.currentEdges}
							label="Edges"
							note="Direct import relationships between modules."
						/>
						<DeltaCard
							baseline={comparison.summary.baselineImportStatements}
							current={comparison.summary.currentImportStatements}
							label="Import statements"
							note="Raw import entries captured from source analysis."
						/>
						<DeltaCard
							baseline={comparison.summary.baselineExternalPackages}
							current={comparison.summary.currentExternalPackages}
							label="External packages"
							note="Distinct node_modules package names observed in the graph."
						/>
						<DeltaCard
							baseline={comparison.summary.baselineWorkspacePackages}
							current={comparison.summary.currentWorkspacePackages}
							label="Workspace packages"
							note="Monorepo package metadata embedded in the snapshot."
						/>
					</section>

					<ChangedNodesTable rows={comparison.changedNodes} />

					<section className="grid gap-4 xl:grid-cols-2">
						<ChangeList
							title="Added modules"
							items={comparison.addedNodes}
							emptyMessage="No new module paths were added."
						/>
						<ChangeList
							title="Removed modules"
							items={comparison.removedNodes}
							emptyMessage="No module paths were removed."
						/>
					</section>

					<section className="grid gap-4 xl:grid-cols-2">
						<ChangeList
							title="Added edges"
							items={comparison.addedEdges}
							emptyMessage="No direct import edges were added."
						/>
						<ChangeList
							title="Removed edges"
							items={comparison.removedEdges}
							emptyMessage="No direct import edges were removed."
						/>
					</section>

					<section className="grid gap-4 xl:grid-cols-2">
						<ChangeList
							title="Added packages"
							items={[
								...comparison.addedWorkspacePackages.map((item) => `workspace: ${item}`),
								...comparison.addedExternalPackages.map((item) => `external: ${item}`),
							]}
							emptyMessage="No workspace or external packages were added."
						/>
						<ChangeList
							title="Removed packages"
							items={[
								...comparison.removedWorkspacePackages.map((item) => `workspace: ${item}`),
								...comparison.removedExternalPackages.map((item) => `external: ${item}`),
							]}
							emptyMessage="No workspace or external packages were removed."
						/>
					</section>
				</>
			) : (
				<section className="rounded-[24px] border border-dashed border-slate-300 bg-white/80 p-8 text-sm leading-6 text-slate-500 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
					Load a baseline snapshot to compare it with the currently served graph or another uploaded JSON file.
				</section>
			)}
		</div>
	);
}
