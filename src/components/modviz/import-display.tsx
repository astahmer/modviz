import { Code2, List } from "lucide-react";
import { useMemo, useState } from "react";
import type { VizImport } from "../../../mod/types";
import { Button } from "~/components/ui/button";

type ImportBlock = {
	module: string;
	code: string;
};

type ImportDisplayProps = {
	imports: VizImport[] | ImportBlock[];
	emptyMessage?: string;
	showViewToggle?: boolean;
};

export function ImportDisplay(props: ImportDisplayProps) {
	const [viewMode, setViewMode] = useState<"code" | "table">("code");
	const isFormatted = Array.isArray(props.imports) && props.imports.length > 0 && "code" in props.imports[0];
	const blocks = useMemo(() => {
		if (isFormatted) {
			return props.imports as ImportBlock[];
		}
		return formatImportBlocks(props.imports as VizImport[]);
	}, [props.imports, isFormatted]);

	const tableData = useMemo(() => {
		const rows: Array<{ module: string; name: string }> = [];
		for (const block of blocks) {
			const names = extractNamesFromCode(block.code);
			for (const name of names) {
				rows.push({ module: block.module, name });
			}
		}
		return rows.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));
	}, [blocks]);

	if (blocks.length === 0) {
		return (
			<p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500 dark:bg-slate-950/80 dark:text-slate-400">
				{props.emptyMessage || "No imports found."}
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{props.showViewToggle !== false && (
				<div className="flex gap-2">
					<Button
						size="sm"
						variant={viewMode === "code" ? "default" : "outline"}
						onClick={() => setViewMode("code")}
						className="gap-2"
					>
						<Code2 className="size-3" />
						Code
					</Button>
					<Button
						size="sm"
						variant={viewMode === "table" ? "default" : "outline"}
						onClick={() => setViewMode("table")}
						className="gap-2"
					>
						<List className="size-3" />
						Table
					</Button>
				</div>
			)}

			{viewMode === "code" ? (
				<div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
					<pre className="overflow-x-auto text-sm leading-6 text-slate-800 dark:text-slate-100">
						<code>{blocks[0]?.code}</code>
					</pre>
				</div>
			) : (
				<div className="overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-800">
					<table className="w-full text-sm">
						<thead className="border-b border-slate-200/70 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/80">
							<tr>
								<th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Module</th>
								<th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300">Name</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
							{tableData.map((row, idx) => (
								<tr key={`${idx}`} className="hover:bg-sky-50/30 dark:hover:bg-sky-500/10">
									<td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
										{row.module}
									</td>
									<td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-100">
										{row.name}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function formatImportBlocks(matches: VizImport[]) {
	const grouped = new Map<
		string,
		{ names: Set<string>; hasBareImport: boolean }
	>();

	for (const match of matches) {
		const current = grouped.get(match.module) ?? {
			names: new Set<string>(),
			hasBareImport: false,
		};

		const importName = match.name || match.declaration;
		if (importName) {
			current.names.add(importName);
		} else {
			current.hasBareImport = true;
		}

		grouped.set(match.module, current);
	}

	const importLines: string[] = [];

	Array.from(grouped.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.forEach(([module, details]) => {
			const names = Array.from(details.names).sort((left, right) =>
				left.localeCompare(right),
			);

			if (!names.length) {
				importLines.push(`import ${JSON.stringify(module)};`);
				return;
			}

			const importBody =
				names.length === 1
					? `{ ${names[0]} }`
					: `{
	${names.join(",\n\t")}
}`;

			importLines.push(`import ${importBody} from ${JSON.stringify(module)};`);
			if (details.hasBareImport) {
				importLines.push(`import ${JSON.stringify(module)};`);
			}
		});

	return [
		{
			module: "imports",
			code: importLines.join("\n"),
		},
	];
}

function extractNamesFromCode(code: string): string[] {
	// Extract import names from code like: import { Name1, Name2 } from "module"
	const match = code.match(/import\s+(?:\{([^}]+)\})?/);
	if (!match) return [];
	if (!match[1]) return [];

	return match[1]
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
}
