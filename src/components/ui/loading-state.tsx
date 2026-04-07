import { LoaderCircle } from "lucide-react";

export function LoadingState(props: { label: string; description?: string; className?: string }) {
	return (
		<div
			className={[
				"flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 text-center",
				props.className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div className="rounded-full border border-sky-200 bg-sky-50 p-3 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
				<LoaderCircle className="size-5 animate-spin" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-slate-700 dark:text-slate-200">{props.label}</p>
				{props.description ? (
					<p className="text-xs text-slate-500 dark:text-slate-400">{props.description}</p>
				) : null}
			</div>
		</div>
	);
}
