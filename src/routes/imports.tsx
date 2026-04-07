import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { ImportSearchView } from "~/components/modviz/import-search-view";
import { SetupView } from "~/components/modviz/setup-view";
import { isModvizBundleReady, useModvizBundle } from "~/utils/modviz-data";

const importSearchSchema = z.object({
	module: z.string().catch(""),
	symbol: z.string().catch(""),
	include: z.string().catch(""),
	exclude: z.string().catch(""),
	mode: z.enum(["contains", "exact", "regex"]).catch("contains"),
	scope: z.enum(["all", "workspace", "external"]).catch("all"),
	preset: z.string().catch(""),
});

export const Route = createFileRoute("/imports")({
	ssr: false,
	validateSearch: (search) => importSearchSchema.parse(search),
	component: ImportsRoute,
});

function ImportsRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Import Search"
			description="Search by imported module or symbol, then scope the results to monorepo packages, folders, or specific files with include and exclude filters."
		>
			{isModvizBundleReady(bundle) ? (
				<ImportSearchView
					bundle={bundle}
					search={search}
					onSearchChange={(patch) =>
						navigate({
							replace: true,
							search: (previous) => ({ ...previous, ...patch }),
						})
					}
				/>
			) : (
				<SetupView bundle={bundle} />
			)}
		</ModvizLayout>
	);
}
