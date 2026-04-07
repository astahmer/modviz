import type { ReactNode } from "react";

export function Card(props: { children: ReactNode; className?: string }) {
	const baseClass =
		"rounded-[16px] border border-slate-200/70 bg-white/90 shadow-[0_16px_50px_-32px_rgba(15,23,42,0.55)] dark:border-slate-800 dark:bg-slate-950/70";
	return <div className={`${baseClass} ${props.className || ""}`}>{props.children}</div>;
}

export function StatCard(props: { label: string; value: number; detail: string }) {
	return (
		<Card className="p-5">
			<p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
				{props.label}
			</p>
			<div className="mt-3 flex items-end justify-between gap-4">
				<p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
					{props.value.toLocaleString()}
				</p>
				<p className="max-w-[14rem] text-right text-xs leading-5 text-slate-500 dark:text-slate-400">
					{props.detail}
				</p>
			</div>
		</Card>
	);
}
