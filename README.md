# Dependency Graph Visualizer

An interactive CLI and web UI for visualizing module dependency graphs and spotting import hotspots.

## 🚀 Features

- **Interactive Graph Visualization**: Force-directed, hierarchical, and circular layouts
- **Smart Filtering**: Search by filename, filter by node type, or limit by import depth
- **Snapshot Comparison**: Compare two graph JSON snapshots to see added or removed modules, edges, and packages
- **Named Snapshot History**: Save runs into a history directory and reload them in the UI compare view or from the CLI
- **File Import/Export**: Load existing graph data or export filtered views
- **Node Inspection**: Detailed view of imports, exports, and unused exports
- **Dependency Trace View**: Explain why a package or module is present by reading captured origin chains
- **TypeScript Support**: Fully supports TypeScript projects with proper resolution

## 📦 Installation

```bash
# Install dependencies
pnpm add -D modviz
```

## 🛠️ Usage

### Analyze and launch the web UI
```bash
pnpm run modviz analyze src/index.ts --ui
```

This serves the prebuilt production UI from `dist/runtime` and launches the packaged Node server instead of rebuilding with Vite on every run.
The UI also polls the graph JSON file timestamp and refreshes automatically when the snapshot changes on disk.

Build the packaged runtime once as the library author:

```bash
pnpm run build
```

### Generate graph data only (no UI)
```bash
pnpm run modviz analyze src/index.ts
```

### Launch UI with existing data
```bash
pnpm run modviz serve ./modviz.json
```

### Use custom port
```bash
pnpm run modviz analyze src/index.ts --ui --port=4000
```

### Generate LLM-oriented reports for barrel and import analysis
```bash
pnpm run modviz analyze src/index.ts --llm --node-modules
```

### Generate an AI-written engineering summary from the structured LLM report
```bash
MODVIZ_LLM_API_KEY=... pnpm run modviz analyze src/index.ts --llm-analyze --llm-model=gpt-4.1-mini
```

### Focus outputs on one package or node when the summary is not enough
```bash
pnpm run modviz analyze src/index.ts --node-modules --package=googleapis
pnpm run modviz analyze src/index.ts --node-modules --node=src/adapter-rest/register-app-routes.ts
```

### Save named snapshots to history
```bash
pnpm run modviz analyze src/index.ts --snapshot-name=before-refactor
pnpm run modviz analyze src/index.ts --snapshot-name=after-refactor
```

### Report on an existing graph or named snapshot
```bash
pnpm run modviz report --summary
pnpm run modviz report --package=react
pnpm run modviz report --snapshot=2026-04-01t10-00-00-before-refactor --node=src/routes/index.ts
pnpm run modviz report --list-snapshots
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

### Snapshot Comparison
- **Baseline vs current**: Upload a previous graph snapshot and compare it to the currently served graph
- **History-backed compare**: Load named snapshots directly from `.modviz/history` without uploading files
- **Delta tables**: Review added or removed modules, direct edges, and package presence
- **Node-level changes**: See which files changed the most by inbound, outbound, and import-statement counts

### Trace View
- **Package trace**: Ask why `react`, `zod`, or any external package is present
- **Node trace**: Follow stored origin chains into one file or module
- **CLI parity**: The same trace queries work in `modviz report`

### Empty-state Boot Flow
- **Graceful startup**: If `modviz.json` is missing or invalid, the UI opens into a setup screen instead of failing the app boot
- **History-first recovery**: Compare can still load named snapshots even when no current graph is active

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

When you add `--llm-analyze`, modviz also writes:

- `modviz.llm.ai.md`: an AI-generated engineering summary using the Vercel AI SDK with an OpenAI-compatible API key

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

## CLI commands and flags

- `analyze <entryFile>`: generate a new graph snapshot
- `serve [dataFile]`: launch the UI for an existing graph snapshot
- `report`: inspect an existing graph snapshot or a named history snapshot

- `--ui`: launch the browser UI after generating the graph
- `--output-file=<file>`: choose the base output filename
- `--graph-file=<file>`: choose the graph file used by `report`
- `--llm`: also emit LLM-oriented JSON and Markdown companion reports
- `--llm-analyze`: also generate an AI-written Markdown summary from the structured LLM report
- `--llm-model=<model>`: choose the OpenAI-compatible model for `--llm-analyze`
- `--llm-base-url=<url>`: choose the OpenAI-compatible base URL for `--llm-analyze`
- `--package=<name>`: focus the outputs on one external package and print a drilldown
- `--node=<path>`: focus the outputs on one node path or display path and print a drilldown
- `--limit=<n>`: limit list output in drilldowns
- `--node-modules`: keep `node_modules` in the analyzed graph instead of excluding them
- `--ignore-dynamic`: ignore dynamic imports
- `--module-lexer=rs|es`: choose the import parser
- `--port=<port>`: choose the UI server port
- `--snapshot-name=<name>`: save the generated graph into `.modviz/history` as a named snapshot
- `--snapshot=<id>`: use a named snapshot from history for `report`
- `--list-snapshots`: print the named snapshot history

## Use Cases

- **Refactoring**: Identify unused exports and circular dependencies
- **Code Review**: Understand module relationships and import patterns
- **Architecture Analysis**: Visualize your project's dependency structure
- **Bundle Analysis**: See which external dependencies are actually used
- **Documentation**: Generate visual documentation of your codebase structure
- **Change Review**: Compare snapshots before and after a refactor to confirm which dependency edges moved
