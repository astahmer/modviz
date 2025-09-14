export interface ModvizOutput {
	metadata: VizMetadata;
	nodes: VizNode[];
	imports: string[];
}

export interface VizNode {
	name: string;
	path: string;
	type: string;
	package?: {
		path: string;
		name: string;
	};
	cluster?: string;
	imports: VizImport[];
	exports: VizExport[];
	unusedExports: any[];
	importees: string[];
	importedBy: string[];
	isBarrelFile: boolean;
	chain: string[][];
}

export interface VizExport {
	kind: string;
	name: string;
	declaration: VizDeclaration;
}

interface VizDeclaration {
	name: string;
	module: string;
}

export interface VizImport {
	name: string;
	declaration: string;
	kind: string;
	module: string;
	isTypeOnly: boolean;
	attributes?: any[];
}

interface VizPackage {
	path: string;
	name: string;
}
interface VizMetadata {
	entrypoints: string[];
	basePath: string;
	totalFiles: number;
	generatedAt: string;
	nodeModulesCount: number;
	packages: VizPackage[];
}
