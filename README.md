# 📊 Dependency Graph Visualizer

An interactive web-based tool for visualizing module dependency graphs using `@thepassle/module-graph`.

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
pnpm run modviz src/index.ts
```

### Generate graph data only (no UI)
```bash
pnpm run modviz src/index.ts --output-only
```

### Launch UI with existing data
```bash
pnpm run modviz --serve ./module-graph.json
```

### Use custom port
```bash
pnpm run modviz src/index.ts --port=4000
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

## 📝 Output Format

The generated `module-graph.json` contains:

```json
{
  "nodes": [
    {
      "id": "src/index.ts",
      "label": "index.ts",
      "path": "src/index.ts",
      "size": 1234,
      "type": "entry",
      "imports": ["./utils", "./components"],
      "exports": ["main", "init"],
      "isBarrelFile": false,
      "unusedExports": []
    }
  ],
  "edges": [
    {
      "source": "src/index.ts",
      "target": "src/utils.ts",
      "type": "import"
    }
  ],
  "metadata": {
    "entryPoint": "src/index.ts",
    "totalFiles": 25,
    "generatedAt": "2025-01-10T...",
    "nodeModulesCount": 5
  }
}
```

## 🎯 Use Cases

- **Refactoring**: Identify unused exports and circular dependencies
- **Code Review**: Understand module relationships and import patterns
- **Architecture Analysis**: Visualize your project's dependency structure
- **Bundle Analysis**: See which external dependencies are actually used
- **Documentation**: Generate visual documentation of your codebase structure
