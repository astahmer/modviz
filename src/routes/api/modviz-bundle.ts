import { createFileRoute } from "@tanstack/react-router";
import { loadModvizBundle } from "~/utils/modviz-server";

export const Route = createFileRoute("/api/modviz-bundle")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					return Response.json(
						loadModvizBundle({
							graphPath: url.searchParams.get("graphPath"),
							snapshotId: url.searchParams.get("snapshotId"),
						}),
					);
				} catch (error) {
					return Response.json(
						{
							error: error instanceof Error ? error.message : "Failed to load modviz bundle.",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
