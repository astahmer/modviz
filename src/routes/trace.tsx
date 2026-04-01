import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ModvizLayout } from "~/components/modviz/modviz-layout";
import { SetupView } from "~/components/modviz/setup-view";
import { TraceView } from "~/components/modviz/trace-view";
import { isModvizBundleReady, useModvizBundle } from "~/utils/modviz-data";

const traceSearchSchema = z.object({
	limit: z.coerce.number().catch(10),
	node: z.string().catch(""),
	package: z.string().catch(""),
});

export const Route = createFileRoute("/trace")({
	ssr: false,
	validateSearch: (search) => traceSearchSchema.parse(search),
	component: TraceRoute,
});

function TraceRoute() {
	const bundle = useModvizBundle();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<ModvizLayout
			projectTitle={bundle.projectTitle}
			title="Trace"
			description="Explain why a dependency or module is present by reading the stored origin chains in the current snapshot."
		>
			{isModvizBundleReady(bundle) ? (
				<TraceView
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
