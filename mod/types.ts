export interface ModvizOutput {
	metadata: VizMetadata;
	nodes: VizNode[];
	edges: VizEdge[];
	imports: string[];
}

interface VizEdge {
	source: string;
	target: string;
}

interface VizNode {
	name: string;
	path: string;
	type: string;
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

interface VizMetadata {
	entryPoint: string;
	totalFiles: number;
	generatedAt: string;
	nodeModulesCount: number;
}
