# Dependency Graph Visualizer

An interactive CLI and web UI for visualizing module dependency graphs and spotting import hotspots.

## 🚀 Features

- **Interactive Graph Visualization**: Force-directed, hierarchical, and circular layouts
- **Smart Filtering**: Search by filename, filter by node type, or limit by import depth
- **File Import/Export**: Load existing graph data or export filtered views
- **Node Inspection**: Detailed view of imports, exports, and unused exports
- **TypeScript Support**: Fully supports TypeScript projects with proper resolution

## 📦 Installation

```bash
# Install dependencies
pnpm add -D modviz
```

## 🛠️ Usage

### Generate graph and launch web UI
```bash
pnpm run cli -- src/index.ts --ui
```

### Generate graph data only (no UI)
```bash
pnpm run cli -- src/index.ts
```

### Launch UI with existing data
```bash
pnpm run cli -- --serve ./modviz.json
```

### Use custom port
```bash
pnpm run cli -- src/index.ts --ui --port=4000
```

### Generate LLM-oriented reports for barrel and import analysis
```bash
pnpm run cli -- src/index.ts --llm --node-modules
```

### Focus outputs on one package or node when the summary is not enough
```bash
pnpm run cli -- src/index.ts --node-modules --package=googleapis
pnpm run cli -- src/index.ts --node-modules --node=src/adapter-rest/register-app-routes.ts
```

## 🎨 Web UI Features

### Graph Visualization
- **Force-directed layout**: Natural clustering of related modules
- **Hierarchical layout**: Shows import hierarchy and depth
- **Circular layout**: Arranges nodes in a circle for better overview

### Filtering Options
- **Search**: Find files by name or path
- **Node Types**: Toggle visibility of entry files, internal files, external dependencies, and barrel files
- **Depth Filter**: Limit visualization to N levels of imports

### Node Types
- 🟢 **Entry**: Your main entry points
- 🔵 **Internal**: Your project files
- 🟠 **External**: NPM dependencies (entry points only)
- 🟣 **Barrel**: Files that primarily re-export other modules

### Interaction
- **Click nodes**: View detailed information about imports, exports, and unused exports
- **Drag**: Rearrange graph layout
- **Zoom/Pan**: Navigate large graphs
- **Export**: Save filtered graph data as JSON

## 🔧 Configuration

The tool automatically detects TypeScript projects and applies appropriate plugins:
- TypeScript source code analysis
- Import/export analysis
- Barrel file detection
- Unused export detection

## Output Files

The default output file is `modviz.json`, which is the UI-oriented graph payload.

When you add `--llm`, modviz also writes:

- `modviz.llm.json`: structured analysis of hotspots, barrel files, external dependencies, and origin chains
- `modviz.llm.md`: compact Markdown summary intended to be pasted into an LLM or shared in code review

The `modviz.llm.json` file is designed to answer questions such as:

- which barrel files fan out to the most modules?
- which `node_modules` entries are introduced from multiple sources?
- what import chains lead from the entrypoint to a problematic dependency?

When the compact Markdown summary is too short, you can focus the written outputs and ask for a focused drilldown directly from the CLI:

- `--package=<name>`: focus the saved JSON and LLM outputs on one external package, and print the full source groups, representative modules, and origin chains
- `--node=<path>`: focus the saved JSON and LLM outputs on one internal or external node, and print the direct importers, origin chains, and hotspot metrics
- `--limit=<n>`: cap the length of each printed list in the drilldown output

The generated `modviz.json` contains:

```json
{
  "metadata": {
    "entrypoints": ["src/index.ts"],
    "basePath": "/repo",
    "totalFiles": 25,
    "generatedAt": "2026-04-01T00:00:00.000Z",
    "nodeModulesCount": 5,
    "packages": []
  },
  "nodes": [
    {
      "name": "index.ts",
      "path": "src/index.ts",
      "type": "entry",
      "imports": [],
      "exports": [],
      "isBarrelFile": false,
      "unusedExports": [],
      "importees": ["src/utils.ts"],
      "importedBy": [],
      "chain": [["src/index.ts"]]
    }
  ],
  "imports": ["src/utils.ts"]
}
```

## CLI flags

- `--ui`: launch the browser UI after generating the graph
- `--serve`: launch the UI from an existing JSON graph file
- `--output-file=<file>`: choose the base output filename
- `--llm`: also emit LLM-oriented JSON and Markdown companion reports
- `--package=<name>`: focus the outputs on one external package and print a drilldown
- `--node=<path>`: focus the outputs on one node path or display path and print a drilldown
- `--limit=<n>`: limit list output in drilldowns
- `--node-modules`: keep `node_modules` in the analyzed graph instead of excluding them
- `--ignore-dynamic`: ignore dynamic imports
- `--module-lexer=rs|es`: choose the import parser
- `--port=<port>`: choose the UI server port

## Use Cases

- **Refactoring**: Identify unused exports and circular dependencies
- **Code Review**: Understand module relationships and import patterns
- **Architecture Analysis**: Visualize your project's dependency structure
- **Bundle Analysis**: See which external dependencies are actually used
- **Documentation**: Generate visual documentation of your codebase structure
