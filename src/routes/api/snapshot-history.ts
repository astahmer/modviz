import { json } from "@tanstack/react-start";
import { createServerFileRoute } from "@tanstack/react-start/server";
import { listSnapshotHistory } from "../../../mod/snapshot-history.ts";

export const ServerRoute = createServerFileRoute("/api/snapshot-history").methods({
	GET: async () => {
		return json(listSnapshotHistory());
	},
});
