import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
}

export interface ParseResult {
	errors: Array<{ message: string }>;
	module: {
		staticImports: Array<{
			moduleRequest: { value: string };
			start: number;
			end: number;
			entries: Array<{ isType: boolean }>;
		}>;
		staticExports: Array<{
			start: number;
			end: number;
			entries: Array<{ moduleRequest?: { value: string }; isType: boolean }>;
		}>;
		dynamicImports: Array<{
			moduleRequest: { start: number; end: number };
			start: number;
			end: number;
		}>;
		hasModuleSyntax: boolean;
	};
}

export class ParseWorkerPool {
	private workers: Worker[] = [];
	private pending = new Map<number, PendingRequest>();
	private nextId = 0;
	private currentWorker = 0;

	constructor(count?: number) {
		const numWorkers = count ?? availableParallelism();
		const ext = import.meta.url.endsWith(".ts") ? "ts" : "js";
		const workerPath = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			`./parse-worker.${ext}`,
		);

		for (let i = 0; i < numWorkers; i++) {
			const worker = new Worker(workerPath);
			worker.on("message", (msg: { id: number; result?: unknown; error?: string }) => {
				const pending = this.pending.get(msg.id);
				if (!pending) return;
				this.pending.delete(msg.id);
				if (msg.error) {
					pending.reject(new Error(msg.error));
				} else {
					pending.resolve(msg.result);
				}
			});
			worker.on("error", (error) => {
				for (const [_id, pending] of this.pending) {
					pending.reject(error);
				}
				this.pending.clear();
			});
			this.workers.push(worker);
		}
	}

	async parse(filename: string, source: string, lang: string): Promise<ParseResult> {
		const id = this.nextId++;
		const worker = this.workers[this.currentWorker % this.workers.length];
		this.currentWorker++;

		const promise = new Promise<ParseResult>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
		});

		worker.postMessage({ id, filename, source, lang });
		return promise;
	}

	get size(): number {
		return this.workers.length;
	}

	terminate(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = [];
		this.pending.clear();
	}
}
