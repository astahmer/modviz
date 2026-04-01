// TODO flame graph / show "hot spots" = problematic files (= introducing too many transitive imports)
// TODO a way to show files that trigger transitive imports going through another package

export interface ModvizOutput {
	metadata: VizMetadata;
	nodes: VizNode[];
	imports: string[];
}

export interface ModvizLlmOutput {
	format: "modviz-llm-v1";
	metadata: VizMetadata & {
		pathFormat: "relative-to-basePath";
	};
	summary: LlmSummary;
	hotspots: LlmHotspot[];
	barrelFiles: LlmBarrelFileReport[];
	externalDependencies: LlmExternalDependencyReport[];
	externalPackages: LlmExternalPackageReport[];
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

export interface VizMetadata {
	entrypoints: string[];
	basePath: string;
	totalFiles: number;
	generatedAt: string;
	nodeModulesCount: number;
	packages: VizPackage[];
}

export interface LlmSummary {
	totalNodes: number;
	internalNodes: number;
	barrelFiles: number;
	externalDependencies: number;
	externalPackages: number;
	nodesWithMultipleOrigins: number;
	topHotspots: Array<{
		path: string;
		displayPath: string;
		reachableModulesCount: number;
		reachableNodeModulesCount: number;
		directImporterCount: number;
		isBarrelFile: boolean;
	}>;
	topExternalPackagesBySourceCount: Array<{
		packageName: string;
		sourceCount: number;
		moduleCount: number;
	}>;
}

export interface LlmHotspot {
	path: string;
	displayPath: string;
	type: string;
	isBarrelFile: boolean;
	directImporterCount: number;
	directImporters: string[];
	directImporteeCount: number;
	originChains: string[][];
	reachableModulesCount: number;
	reachableInternalModulesCount: number;
	reachableNodeModulesCount: number;
	reachableBarrelFilesCount: number;
	topExternalPackages: string[];
	signals: string[];
}

export interface LlmExternalDependencyReport {
	path: string;
	displayPath: string;
	packageName?: string;
	directImporterCount: number;
	directImporters: string[];
	originChains: string[][];
	introducedThrough: Array<{
		path: string;
		originChains: string[][];
	}>;
	barrelSources: string[];
}

export interface LlmBarrelFileReport {
	path: string;
	displayPath: string;
	directImporterCount: number;
	directImporters: string[];
	originChains: string[][];
	impact: {
		directImporteeCount: number;
		reachableModulesCount: number;
		reachableInternalModulesCount: number;
		reachableNodeModulesCount: number;
		reachableBarrelFilesCount: number;
	};
	nodeModulesIntroduced: Array<{
		path: string;
		packageName?: string;
		chainsFromBarrel: string[][];
	}>;
}

export interface LlmSourceGroup {
	kind: "workspace-package" | "file";
	label: string;
	paths: string[];
}

export interface LlmExternalPackageReport {
	packageName: string;
	modulePaths: string[];
	sourceCount: number;
	sourceGroupCount: number;
	sources: string[];
	originChains: string[][];
	barrelSources: string[];
	sourceGroups: LlmSourceGroup[];
}
