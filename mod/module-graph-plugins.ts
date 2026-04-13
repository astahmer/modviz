import path from "node:path";
import type { Plugin } from "@astahmer/module-graph";

const WINDOWS_ABSOLUTE_PATH_RE = /^[A-Za-z]:[\\/]/;
const ANALYZABLE_SOURCE_EXTENSIONS = new Set([
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
	".json",
	".node",
]);

function findSpecifierSuffixIndex(importee: string) {
	const queryIndex = importee.indexOf("?");
	const hashIndex = importee.indexOf("#");

	if (queryIndex === -1) {
		return hashIndex;
	}

	if (hashIndex === -1) {
		return queryIndex;
	}

	return Math.min(queryIndex, hashIndex);
}

function isFileLikeImportSpecifier(importee: string) {
	return (
		importee.startsWith("./") ||
		importee.startsWith("../") ||
		importee.startsWith("/") ||
		WINDOWS_ABSOLUTE_PATH_RE.test(importee)
	);
}

export function sanitizeImportSpecifierForAnalysis(importee: string) {
	const suffixIndex = findSpecifierSuffixIndex(importee);
	if (suffixIndex === -1) {
		return importee;
	}

	const cleanedImportee = importee.slice(0, suffixIndex);
	if (!cleanedImportee || !isFileLikeImportSpecifier(cleanedImportee)) {
		return importee;
	}

	return cleanedImportee;
}

export function shouldSkipImportForAnalysis(importee: string) {
	const sanitizedImportee = sanitizeImportSpecifierForAnalysis(importee);
	if (sanitizedImportee === importee) {
		return false;
	}

	const extension = path.extname(sanitizedImportee).toLowerCase();
	return extension.length > 0 && !ANALYZABLE_SOURCE_EXTENSIONS.has(extension);
}

export const sanitizeFileImportSuffixPlugin: Plugin = {
	name: "sanitize-file-import-suffix",
	handleImport({ importee }) {
		if (shouldSkipImportForAnalysis(importee)) {
			return false;
		}

		const sanitizedImportee = sanitizeImportSpecifierForAnalysis(importee);
		return sanitizedImportee === importee ? undefined : sanitizedImportee;
	},
};
