import path from "node:path";
import type { Workspace } from "find-workspaces";
import MagicString from "magic-string";
import { resolveImports } from "resolve-pkg-maps";
import type { Plugin } from "@astahmer/module-graph";

export const inlinePackageJsonImportsPlugin = (
	workspaceList: Array<{
		relativePath: string;
		absolutePath: string;
		name: string;
		imports: Workspace["package"]["imports"];
	}>,
): Plugin => ({
	name: "inline-package.json-imports",
	transformSource: ({ filename, source }) => {
		// return source;
		const pkg = workspaceList.find((workspace) => filename.startsWith(workspace.absolutePath));
		if (!pkg) return source;

		const importFromRegex = /import\s+.*?from\s+['"](.{3,}?)['"]/gi;
		const fileDeps = [...source.matchAll(importFromRegex)];
		if (!fileDeps.length) return; // No deps

		const packageJsonImports = fileDeps.filter((match) => {
			const moduleSpecifier = match[1];
			if (moduleSpecifier[0] === "#") {
				return true;
			}

			return false;
		});
		if (!packageJsonImports.length) return source;

		const magicString = new MagicString(source);

		packageJsonImports.map((match) => {
			const moduleSpecifier = match[1];
			const [resolved] = resolveImports(pkg.imports ?? {}, moduleSpecifier, []);
			if (!resolved) return;

			const resolvedPath = path.relative(
				path.dirname(filename),
				path.join(pkg.absolutePath, resolved.replace(pkg.relativePath, "")),
			);

			magicString.update(
				match.index!,
				match.index! + match[0].length,
				match[0].replace(moduleSpecifier, resolvedPath),
			);
			return moduleSpecifier;
		});

		return magicString.toString();
	},
});
