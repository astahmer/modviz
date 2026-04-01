import { FloatingPanel } from "@ark-ui/react/floating-panel";
import { Portal } from "@ark-ui/react/portal";
import { RotateCcw, Settings2, X } from "lucide-react";
import type { GraphLayoutSettings } from "~/components/graph/common/graph-layout-settings";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

function NumberField(props: {
	label: string;
	value: number;
	min: number;
	max?: number;
	step?: number;
	onChange: (value: number) => void;
	help: string;
}) {
	return (
		<label className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
			<span className="flex items-center justify-between gap-3 font-medium">
				<span>{props.label}</span>
				<span className="text-xs text-slate-500 dark:text-slate-400">
					{props.value}
				</span>
			</span>
			<Input
				type="number"
				value={String(props.value)}
				min={props.min}
				max={props.max}
				step={props.step}
				onChange={(event) => props.onChange(Number(event.currentTarget.value))}
			/>
			<p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
				{props.help}
			</p>
		</label>
	);
}

function ToggleField(props: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	help: string;
}) {
	return (
		<label className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
			<input
				type="checkbox"
				className="mt-1 size-4 rounded border-slate-300"
				checked={props.checked}
				onChange={(event) => props.onChange(event.currentTarget.checked)}
			/>
			<span>
				<span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
					{props.label}
				</span>
				<span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
					{props.help}
				</span>
			</span>
		</label>
	);
}

export function GraphSettingsPanel(props: {
	open: boolean;
	settings: GraphLayoutSettings;
	onOpenChange: (open: boolean) => void;
	onSettingsChange: (settings: GraphLayoutSettings) => void;
	onReset: () => void;
}) {
	const updateSetting = <K extends keyof GraphLayoutSettings>(
		key: K,
		value: GraphLayoutSettings[K],
	) => {
		props.onSettingsChange({
			...props.settings,
			[key]: value,
		});
	};

	if (!props.open) return null;

	return (
		<FloatingPanel.Root
			open
			defaultSize={{ width: 420, height: 640 }}
			minSize={{ width: 360, height: 520 }}
			persistRect
			lazyMount
		>
			<Portal>
				<FloatingPanel.Positioner className="z-50">
					<FloatingPanel.Content className="flex h-full flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.75)] dark:border-slate-800 dark:bg-slate-950">
						<FloatingPanel.DragTrigger>
							<FloatingPanel.Header className="flex cursor-move items-center justify-between border-b border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
								<div className="flex items-center gap-2">
									<div className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
										<Settings2 className="size-4" />
									</div>
									<div>
										<FloatingPanel.Title className="text-sm font-semibold text-slate-900 dark:text-slate-100">
											Graph settings
										</FloatingPanel.Title>
										<p className="text-xs text-slate-500 dark:text-slate-400">
											Layout controls for cluster spacing, gravity, and legibility.
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={props.onReset}>
										<RotateCcw className="size-4" />
										Reset
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => props.onOpenChange(false)}
									>
										<X className="size-4" />
									</Button>
								</div>
							</FloatingPanel.Header>
						</FloatingPanel.DragTrigger>
						<FloatingPanel.Body className="flex-1 overflow-y-auto px-4 py-4">
							<div className="space-y-5">
								<NumberField label="Iterations" value={props.settings.iterations} min={10} max={500} step={10} onChange={(value) => updateSetting("iterations", Math.max(10, value || 10))} help="Higher values let ForceAtlas2 settle longer before the graph renders." />
								<NumberField label="Gravity" value={props.settings.gravity} min={0} max={1500} step={1} onChange={(value) => updateSetting("gravity", Math.max(0, value || 0))} help="Pulls nodes back toward the center. Lower gravity spreads clusters out more." />
								<NumberField label="Scaling ratio" value={props.settings.scalingRatio} min={1} max={500} step={1} onChange={(value) => updateSetting("scalingRatio", Math.max(1, value || 1))} help="Primary spacing control. Higher values increase separation between nodes and clusters." />
								<NumberField label="Node size scale" value={props.settings.nodeSizeScale} min={0.5} max={4} step={0.1} onChange={(value) => updateSetting("nodeSizeScale", Math.max(0.5, Number(value.toFixed(1)) || 1))} help="Amplifies the node size derived from inbound edge count." />
								<div className="grid gap-3">
									<ToggleField label="Strong gravity mode" checked={props.settings.strongGravityMode} onChange={(checked) => updateSetting("strongGravityMode", checked)} help="Keeps distant nodes from drifting too far out of frame." />
									<ToggleField label="LinLog mode" checked={props.settings.linLogMode} onChange={(checked) => updateSetting("linLogMode", checked)} help="Often improves community separation in clustered graphs." />
									<ToggleField label="Adjust sizes" checked={props.settings.adjustSizes} onChange={(checked) => updateSetting("adjustSizes", checked)} help="Uses node size during layout to reduce collisions." />
									<ToggleField label="Outbound attraction distribution" checked={props.settings.outboundAttractionDistribution} onChange={(checked) => updateSetting("outboundAttractionDistribution", checked)} help="Balances attraction when hubs create too much pull." />
									<ToggleField label="Hide cluster labels" checked={props.settings.hideClusterLabels} onChange={(checked) => updateSetting("hideClusterLabels", checked)} help="Useful when labels cover dense areas during exploration." />
								</div>
							</div>
						</FloatingPanel.Body>
					</FloatingPanel.Content>
				</FloatingPanel.Positioner>
			</Portal>
		</FloatingPanel.Root>
	);
}
