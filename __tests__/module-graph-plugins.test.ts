import { expect, test } from "vitest";
import {
	sanitizeFileImportSuffixPlugin,
	sanitizeImportSpecifierForAnalysis,
	shouldSkipImportForAnalysis,
} from "../mod/module-graph-plugins.ts";

test("sanitizeImportSpecifierForAnalysis strips bundler query suffixes from relative asset imports", () => {
	expect(sanitizeImportSpecifierForAnalysis("./icons/najar-cross.svg?component")).toBe(
		"./icons/najar-cross.svg",
	);
	expect(sanitizeImportSpecifierForAnalysis("../styles/app.css?inline#css")).toBe(
		"../styles/app.css",
	);
});

test("sanitizeImportSpecifierForAnalysis strips suffixes from absolute file paths", () => {
	expect(
		sanitizeImportSpecifierForAnalysis(
			"/Users/example/project/src/icons/najar-cross.svg?component",
		),
	).toBe("/Users/example/project/src/icons/najar-cross.svg");
	expect(sanitizeImportSpecifierForAnalysis("C:/repo/src/icon.svg?component")).toBe(
		"C:/repo/src/icon.svg",
	);
});

test("sanitizeImportSpecifierForAnalysis leaves non-file specifiers untouched", () => {
	expect(sanitizeImportSpecifierForAnalysis("react")).toBe("react");
	expect(sanitizeImportSpecifierForAnalysis("virtual:icons?component")).toBe(
		"virtual:icons?component",
	);
	expect(sanitizeImportSpecifierForAnalysis("~/icons/najar-cross.svg?component")).toBe(
		"~/icons/najar-cross.svg?component",
	);
});

test("shouldSkipImportForAnalysis skips non-code assets after query sanitization", () => {
	expect(shouldSkipImportForAnalysis("./icons/najar-cross.svg?component")).toBe(true);
	expect(shouldSkipImportForAnalysis("../styles/app.css?inline")).toBe(true);
	expect(shouldSkipImportForAnalysis("./feature.tsx?worker")).toBe(false);
	expect(shouldSkipImportForAnalysis("./feature")).toBe(false);
});

test("sanitizeFileImportSuffixPlugin skips asset imports but preserves code imports", () => {
	expect(
		sanitizeFileImportSuffixPlugin.handleImport?.({
			importee: "./icons/najar-cross.svg?component",
			importer: "src/app.tsx",
			source: 'import Icon from "./icons/najar-cross.svg?component";',
		}),
	).toBe(false);

	expect(
		sanitizeFileImportSuffixPlugin.handleImport?.({
			importee: "./feature.tsx?raw",
			importer: "src/app.tsx",
			source: 'import Feature from "./feature.tsx?raw";',
		}),
	).toBe("./feature.tsx");
	});
