import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const sourceRuntimeDir = path.join(packageRoot, ".output");
const targetRuntimeDir = path.join(packageRoot, "dist", "runtime");

if (!existsSync(sourceRuntimeDir)) {
	throw new Error(`Expected Vite build output at ${sourceRuntimeDir}`);
}

rmSync(targetRuntimeDir, { force: true, recursive: true });
mkdirSync(targetRuntimeDir, { recursive: true });

for (const entryName of ["nitro.json", "public", "server"]) {
	cpSync(
		path.join(sourceRuntimeDir, entryName),
		path.join(targetRuntimeDir, entryName),
		{ recursive: true },
	);
}

console.log(`Packaged production runtime into ${path.relative(packageRoot, targetRuntimeDir)}`);
