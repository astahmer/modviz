import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { fileURLToPath, pathToFileURL } from "node:url";

type RuntimeFetchHandler = (request: Request) => Promise<Response> | Response;

type RuntimeServerModule = {
	default?: {
		fetch?: RuntimeFetchHandler;
	};
};

type NodeRequestInit = RequestInit & {
	duplex?: "half";
};

export const resolveProductionRuntimePaths = (fromImportUrl: string) => {
	const currentDir = fileURLToPath(new URL(".", fromImportUrl));
	const candidatePackageRoots = [path.resolve(currentDir, ".."), path.resolve(currentDir, "../..")];
	const packageRoot =
		candidatePackageRoots.find((candidate) => existsSync(path.join(candidate, "package.json"))) ??
		path.resolve(currentDir, "..");
	const packagedRuntimeRoot = path.join(packageRoot, "dist");

	return {
		packageRoot,
		packagedRuntimeRoot,
		runtimeClientRoot: path.join(packagedRuntimeRoot, "client"),
		runtimeHostBuildEntry: path.join(packagedRuntimeRoot, "mod", "runtime-host.js"),
		runtimeHostSourceEntry: path.join(packageRoot, "mod", "runtime-host.ts"),
		runtimeServerEntry: path.join(packagedRuntimeRoot, "server", "server.js"),
	};
};

const STATIC_CONTENT_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json; charset=utf-8",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

const isDirectExecution = (importUrl: string) => {
	const argvPath = process.argv[1];
	if (!argvPath) {
		return false;
	}

	return pathToFileURL(path.resolve(argvPath)).href === importUrl;
};

const createRequestFromNode = (request: IncomingMessage, port: number) => {
	const forwardedProto = request.headers["x-forwarded-proto"];
	const protocol =
		typeof forwardedProto === "string" && forwardedProto.trim().length > 0
			? forwardedProto.split(",")[0]!.trim()
			: "http";
	const host = request.headers.host ?? `localhost:${port}`;
	const url = new URL(request.url ?? "/", `${protocol}://${host}`);
	const headers = new Headers();

	for (const [key, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) {
			for (const headerValue of value) {
				headers.append(key, headerValue);
			}
			continue;
		}

		if (typeof value === "string") {
			headers.set(key, value);
		}
	}

	const method = request.method ?? "GET";
	const hasBody = !["GET", "HEAD"].includes(method.toUpperCase());
	const body = hasBody ? (Readable.toWeb(request) as unknown as BodyInit) : undefined;
	const requestInit: NodeRequestInit = {
		body,
		duplex: hasBody ? "half" : undefined,
		headers,
		method,
	};

	return new Request(url, requestInit as RequestInit);
};

const getContentType = (filePath: string) =>
	STATIC_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";

const resolveStaticAssetPath = (clientRoot: string, pathname: string) => {
	const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");
	if (!relativePath) {
		return null;
	}

	const absoluteClientRoot = path.resolve(clientRoot);
	const candidatePath = path.resolve(absoluteClientRoot, relativePath);
	if (
		candidatePath !== absoluteClientRoot &&
		!candidatePath.startsWith(`${absoluteClientRoot}${path.sep}`)
	) {
		return null;
	}

	if (!existsSync(candidatePath)) {
		return null;
	}

	const stat = statSync(candidatePath);
	if (!stat.isFile()) {
		return null;
	}

	return {
		filePath: candidatePath,
		stat,
	};
};

const tryServeStaticAsset = async (
	request: IncomingMessage,
	response: ServerResponse,
	clientRoot: string,
	port: number,
) => {
	const method = (request.method ?? "GET").toUpperCase();
	if (method !== "GET" && method !== "HEAD") {
		return false;
	}

	const requestUrl = new URL(
		request.url ?? "/",
		`http://${request.headers.host ?? `localhost:${port}`}`,
	);
	if (path.posix.extname(requestUrl.pathname) === "") {
		return false;
	}

	const asset = resolveStaticAssetPath(clientRoot, requestUrl.pathname);
	if (!asset) {
		return false;
	}

	response.statusCode = 200;
	response.setHeader("content-length", String(asset.stat.size));
	response.setHeader("content-type", getContentType(asset.filePath));
	response.setHeader(
		"cache-control",
		requestUrl.pathname.startsWith("/assets/")
			? "public, max-age=31536000, immutable"
			: "public, max-age=3600",
	);

	if (method === "HEAD") {
		response.end();
		return true;
	}

	await pipeline(createReadStream(asset.filePath), response);
	return true;
};

const writeResponseToNode = async (
	request: IncomingMessage,
	response: Response,
	nodeResponse: ServerResponse,
) => {
	nodeResponse.statusCode = response.status;
	nodeResponse.statusMessage = response.statusText;

	const responseHeaders = response.headers as Headers & {
		getSetCookie?: () => string[];
	};
	const setCookieValues = responseHeaders.getSetCookie?.() ?? [];

	response.headers.forEach((value, key) => {
		if (key.toLowerCase() === "set-cookie" && setCookieValues.length > 0) {
			return;
		}

		nodeResponse.setHeader(key, value);
	});

	if (setCookieValues.length > 0) {
		nodeResponse.setHeader("set-cookie", setCookieValues);
	}

	if (!response.body || request.method?.toUpperCase() === "HEAD") {
		nodeResponse.end();
		return;
	}

	await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), nodeResponse);
};

const handleNodeRequest = async (
	fetchHandler: RuntimeFetchHandler,
	request: IncomingMessage,
	response: ServerResponse,
	clientRoot: string,
	port: number,
) => {
	try {
		if (await tryServeStaticAsset(request, response, clientRoot, port)) {
			return;
		}

		const runtimeRequest = createRequestFromNode(request, port);
		const runtimeResponse = await fetchHandler(runtimeRequest);
		await writeResponseToNode(request, runtimeResponse, response);
	} catch (error) {
		console.error(error);
		if (!response.headersSent) {
			response.statusCode = 500;
			response.setHeader("content-type", "text/plain; charset=utf-8");
		}
		response.end("Internal Server Error");
	}
};

export async function startRuntimeHost(options?: { port?: number }) {
	const runtimePaths = resolveProductionRuntimePaths(import.meta.url);
	if (!existsSync(runtimePaths.runtimeServerEntry)) {
		throw new Error(
			[
				`Expected bundled TanStack server module at ${runtimePaths.runtimeServerEntry}.`,
				"Run `pnpm build` before starting the production UI.",
			].join(" "),
		);
	}

	const port = options?.port ?? Number.parseInt(process.env.PORT ?? "3000", 10);
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error(`Invalid PORT value: ${process.env.PORT ?? String(options?.port)}`);
	}

	const serverModule = (await import(
		pathToFileURL(runtimePaths.runtimeServerEntry).href
	)) as RuntimeServerModule;
	const fetchHandler = serverModule.default?.fetch;
	if (typeof fetchHandler !== "function") {
		throw new Error(
			[
				`Expected ${runtimePaths.runtimeServerEntry} to export a default fetch handler.`,
				"The production UI build is incomplete or incompatible with the current launcher.",
			].join(" "),
		);
	}

	const server = createServer((request, response) => {
		void handleNodeRequest(fetchHandler, request, response, runtimePaths.runtimeClientRoot, port);
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, () => resolve());
	});

	const shutdown = () => {
		server.close();
		server.closeAllConnections?.();
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);

	await new Promise<void>((resolve, reject) => {
		server.once("close", () => resolve());
		server.once("error", reject);
	});
}

if (isDirectExecution(import.meta.url)) {
	void startRuntimeHost().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
