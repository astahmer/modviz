import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { getModvizJsonStatus } from "~/utils/modviz-server";

export const ServerRoute = createServerFileRoute("/api/json-status").methods({
	GET: async ({ request }) => {
		const url = new URL(request.url);
		return json(
			getModvizJsonStatus({
				graphPath: url.searchParams.get("graphPath"),
				snapshotId: url.searchParams.get("snapshotId"),
			}),
		);
	},
});
