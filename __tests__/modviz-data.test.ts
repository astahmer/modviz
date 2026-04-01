import { expect, test } from "vitest";
import { getExternalPackageName } from "~/utils/modviz-data";
import type { VizNode } from "../mod/types";

const createNode = (path: string, packageName?: string): VizNode => ({
	name: path.split("/").at(-1) ?? path,
	path,
	type: "external",
	package: packageName
		? {
				name: packageName,
				path: packageName,
			}
		: undefined,
	cluster: undefined,
	imports: [],
	exports: [],
	unusedExports: [],
	importees: [],
	importedBy: [],
	isBarrelFile: false,
	chain: [],
});

test("getExternalPackageName handles relative node_modules paths", () => {
	expect(getExternalPackageName(createNode("node_modules/zod/index.js"))).toBe("zod");
	expect(getExternalPackageName(createNode("node_modules/date-fns/format.js"))).toBe("date-fns");
});

test("getExternalPackageName handles scoped packages", () => {
	expect(getExternalPackageName(createNode("node_modules/@tanstack/react-router/dist/index.js"))).toBe(
		"@tanstack/react-router",
	);
});

test("getExternalPackageName handles pnpm nested node_modules paths", () => {
	expect(
		getExternalPackageName(
			createNode("node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/lodash.js"),
		),
	).toBe("lodash");
});

test("getExternalPackageName ignores bogus package metadata", () => {
	expect(
		getExternalPackageName(
			createNode("node_modules/lodash/lodash.js", "node_modules"),
		),
	).toBe("lodash");
	expect(
		getExternalPackageName(
			createNode("node_modules/lodash/lodash.js", "lodash"),
		),
	).toBe("lodash");
});
