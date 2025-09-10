import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};

export async function startServer(
	userPort: number | undefined,
	dataFile?: string,
) {
	const webUIPath = join(__dirname, "../web-ui");

	const server = createServer((req, res) => {
		const address = server.address();
		const port = typeof address === "string" ? address : address?.port;
		const url = new URL(req.url!, `http://localhost:${port}`);
		let filePath = url.pathname;

		// Handle API routes
		if (filePath === "/api/graph-data") {
			handleGraphDataAPI(res, dataFile);
			return;
		}

		// Handle static files
		if (filePath === "/") {
			filePath = "/index.html";
		}

		const fullPath = join(webUIPath, filePath);

		if (!existsSync(fullPath)) {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("Not Found");
			return;
		}

		const ext = filePath.substring(filePath.lastIndexOf("."));
		const contentType = MIME_TYPES[ext] || "text/plain";

		try {
			const content = readFileSync(fullPath);
			res.writeHead(200, { "Content-Type": contentType });
			res.end(content);
		} catch (error) {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal Server Error");
		}
	});

	server.listen(userPort ?? 0, () => {
		const address = server.address();
		const port = typeof address === "string" ? address : address?.port;
		const url = `http://localhost:${port}`;
		console.log(`🌐 Web UI available at: ${url}`);

		// Try to open browser automatically
		const open = async () => {
			try {
				const { exec } = await import("node:child_process");
				exec(`open ${url}`); // macOS specific, could add cross-platform logic
			} catch (error) {
				console.log(`💡 Open your browser to: ${url}`);
			}
		};

		open();
	});

	return server;
}

function handleGraphDataAPI(res: any, dataFile?: string) {
	const headers = {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};

	if (!dataFile || !existsSync(dataFile)) {
		res.writeHead(404, headers);
		res.end(JSON.stringify({ error: "Graph data not found" }));
		return;
	}

	try {
		const data = readFileSync(dataFile, "utf-8");
		res.writeHead(200, headers);
		res.end(data);
	} catch (error) {
		res.writeHead(500, headers);
		res.end(JSON.stringify({ error: "Failed to load graph data" }));
	}
}
