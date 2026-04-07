import { createFileRoute } from "@tanstack/react-router";
import { getModvizJsonStatus } from "~/utils/modviz-server";

export const Route = createFileRoute("/api/json-status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				return Response.json(
					getModvizJsonStatus({
						graphPath: url.searchParams.get("graphPath"),
						snapshotId: url.searchParams.get("snapshotId"),
					}),
				);
			},
		},
	},
});
