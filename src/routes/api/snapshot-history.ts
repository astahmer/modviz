import { createFileRoute } from "@tanstack/react-router";
import { listSnapshotHistory } from "../../../mod/snapshot-history.ts";

export const Route = createFileRoute("/api/snapshot-history")({
	server: {
		handlers: {
			GET: async () => Response.json(listSnapshotHistory()),
		},
	},
});
