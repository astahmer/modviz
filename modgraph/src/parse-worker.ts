import { parentPort } from "node:worker_threads";
import { parseSync } from "oxc-parser";

if (parentPort) {
	parentPort.on("message", (msg: { id: number; filename: string; source: string; lang: string }) => {
		try {
			const result = parseSync(msg.filename, msg.source, { lang: msg.lang as "js" | "jsx" | "ts" | "tsx" });
			parentPort!.postMessage({ id: msg.id, result });
		} catch (error) {
			parentPort!.postMessage({
				id: msg.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
}
