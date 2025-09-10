class DependencyGraphVisualizer {
	constructor() {
		this.data = null;
		this.filteredData = null;
		this.simulation = null;
		this.svg = null;
		this.width = 0;
		this.height = 0;
		this.zoom = null;

		this.filters = {
			search: "",
			nodeTypes: {
				entry: true,
				internal: true,
				external: true,
				barrel: true,
			},
			maxDepth: 10,
		};

		this.init();
	}

	init() {
		this.setupEventListeners();
		this.setupSVG();
		this.loadGraphData();
	}

	setupEventListeners() {
		// File import
		const fileInput = document.getElementById("file-input");
		const importBtn = document.getElementById("import-btn");

		importBtn.addEventListener("click", () => fileInput.click());
		fileInput.addEventListener("change", (e) => this.handleFileImport(e));

		// Filters
		document.getElementById("search-input").addEventListener("input", (e) => {
			this.filters.search = e.target.value.toLowerCase();
			this.applyFilters();
		});

		document.getElementById("depth-filter").addEventListener("input", (e) => {
			this.filters.maxDepth = parseInt(e.target.value);
			document.getElementById("depth-value").textContent = e.target.value;
			this.applyFilters();
		});

		// Node type filters
		["entry", "internal", "external", "barrel"].forEach((type) => {
			document
				.getElementById(`type-${type}`)
				.addEventListener("change", (e) => {
					this.filters.nodeTypes[type] = e.target.checked;
					this.applyFilters();
				});
		});

		// Layout controls
		document.getElementById("layout-select").addEventListener("change", (e) => {
			this.changeLayout(e.target.value);
		});

		document.getElementById("center-graph").addEventListener("click", () => {
			this.centerGraph();
		});

		document.getElementById("reset-filters").addEventListener("click", () => {
			this.resetFilters();
		});

		// Node details panel
		document.getElementById("close-details").addEventListener("click", () => {
			document.getElementById("node-details").style.display = "none";
		});

		// Export functionality
		document.getElementById("export-btn").addEventListener("click", () => {
			this.exportGraph();
		});

		// Retry button
		document.getElementById("retry-btn").addEventListener("click", () => {
			this.loadGraphData();
		});
	}

	setupSVG() {
		const container = document.querySelector(".visualization-area");
		this.width = container.clientWidth;
		this.height = container.clientHeight;

		this.svg = d3
			.select("#graph-svg")
			.attr("width", this.width)
			.attr("height", this.height);

		// Setup zoom
		this.zoom = d3
			.zoom()
			.scaleExtent([0.1, 4])
			.on("zoom", (event) => {
				this.svg.select(".graph-container").attr("transform", event.transform);
			});

		this.svg.call(this.zoom);

		// Create container for graph elements
		this.svg.append("g").attr("class", "graph-container");

		// Handle window resize
		window.addEventListener("resize", () => {
			this.handleResize();
		});
	}

	async loadGraphData() {
		this.showLoading(true);
		this.hideError();

		try {
			const response = await fetch("/api/graph-data");
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			this.data = await response.json();
			this.processData();
			this.showLoading(false);
			document.getElementById("export-btn").disabled = false;
		} catch (error) {
			console.error("Failed to load graph data:", error);
			this.showError(error.message);
			this.showLoading(false);
		}
	}

	handleFileImport(event) {
		const file = event.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				this.data = JSON.parse(e.target.result);
				this.processData();
				this.hideError();
				document.getElementById("export-btn").disabled = false;
			} catch (error) {
				this.showError("Invalid JSON file format");
			}
		};
		reader.readAsText(file);
	}

	processData() {
		if (!this.data) return;

		// Calculate node depths
		this.calculateDepths();

		// Apply initial filters
		this.applyFilters();

		// Update statistics
		this.updateStatistics();

		// Render graph
		this.renderGraph();
	}

	calculateDepths() {
		const { nodes, edges } = this.data;
		const depthMap = new Map();
		const entryNodes = nodes.filter((n) => n.type === "entry");

		// BFS to calculate depths
		const queue = entryNodes.map((n) => ({ id: n.id, depth: 0 }));
		entryNodes.forEach((n) => depthMap.set(n.id, 0));

		while (queue.length > 0) {
			const { id, depth } = queue.shift();

			const outgoingEdges = edges.filter((e) => e.source === id);
			for (const edge of outgoingEdges) {
				if (!depthMap.has(edge.target)) {
					depthMap.set(edge.target, depth + 1);
					queue.push({ id: edge.target, depth: depth + 1 });
				}
			}
		}

		// Assign depths to nodes
		nodes.forEach((node) => {
			node.depth = depthMap.get(node.id) || 0;
		});
	}

	applyFilters() {
		if (!this.data) return;

		const { nodes, edges } = this.data;

		// Filter nodes
		const filteredNodes = nodes.filter((node) => {
			// Search filter
			if (
				this.filters.search &&
				!node.path.toLowerCase().includes(this.filters.search)
			) {
				return false;
			}

			// Node type filter
			if (!this.filters.nodeTypes[node.type]) {
				return false;
			}

			// Depth filter
			if (node.depth > this.filters.maxDepth) {
				return false;
			}

			return true;
		});

		const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

		// Filter edges (only show edges between visible nodes)
		const filteredEdges = edges.filter(
			(edge) =>
				filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target),
		);

		this.filteredData = {
			nodes: filteredNodes,
			edges: filteredEdges,
			metadata: this.data.metadata,
		};

		this.updateStatistics();
		this.renderGraph();
	}

	renderGraph() {
		if (!this.filteredData) return;

		const { nodes, edges } = this.filteredData;
		const container = this.svg.select(".graph-container");

		// Clear existing elements
		container.selectAll("*").remove();

		// Create simulation
		this.simulation = d3
			.forceSimulation(nodes)
			.force(
				"link",
				d3
					.forceLink(edges)
					.id((d) => d.id)
					.distance(80),
			)
			.force("charge", d3.forceManyBody().strength(-200))
			.force("center", d3.forceCenter(this.width / 2, this.height / 2))
			.force("collision", d3.forceCollide().radius(25));

		// Create links
		const link = container
			.append("g")
			.selectAll("line")
			.data(edges)
			.join("line")
			.attr("class", "link");

		// Create nodes
		const node = container
			.append("g")
			.selectAll("g")
			.data(nodes)
			.join("g")
			.attr("class", (d) => `node ${d.type}`)
			.call(this.drag());

		// Add circles to nodes
		node
			.append("circle")
			.attr("r", (d) => Math.max(8, Math.min(20, Math.sqrt(d.size / 100))))
			.on("click", (event, d) => this.showNodeDetails(d))
			.on("mouseover", (event, d) => this.showTooltip(event, d))
			.on("mouseout", () => this.hideTooltip());

		// Add labels to nodes
		node
			.append("text")
			.attr("class", "node-label")
			.text((d) => d.label)
			.attr("dy", "0.35em");

		// Update positions on simulation tick
		this.simulation.on("tick", () => {
			link
				.attr("x1", (d) => d.source.x)
				.attr("y1", (d) => d.source.y)
				.attr("x2", (d) => d.target.x)
				.attr("y2", (d) => d.target.y);

			node.attr("transform", (d) => `translate(${d.x},${d.y})`);
		});
	}

	drag() {
		return d3
			.drag()
			.on("start", (event, d) => {
				if (!event.active) this.simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on("drag", (event, d) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on("end", (event, d) => {
				if (!event.active) this.simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});
	}

	showNodeDetails(node) {
		const panel = document.getElementById("node-details");
		const title = document.getElementById("node-title");
		const fileInfo = document.getElementById("file-info");
		const importsList = document.getElementById("imports-list");
		const exportsList = document.getElementById("exports-list");
		const unusedExportsSection = document.getElementById(
			"unused-exports-section",
		);
		const unusedExportsList = document.getElementById("unused-exports-list");

		title.textContent = node.label;

		// File info
		fileInfo.innerHTML = `
      <div class="detail-item">
        <span class="detail-label">Path:</span>
        <span class="detail-value">${node.path}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Type:</span>
        <span class="detail-value">${node.type}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Size:</span>
        <span class="detail-value">${node.size} chars</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Depth:</span>
        <span class="detail-value">${node.depth}</span>
      </div>
      ${node.isBarrelFile ? '<div class="detail-item"><span class="detail-label">Barrel file:</span><span class="detail-value">Yes</span></div>' : ""}
    `;

		// Imports
		if (node.imports && node.imports.length > 0) {
			importsList.innerHTML = `<ul class="detail-list">${node.imports.map((imp) => `<li>${imp}</li>`).join("")}</ul>`;
		} else {
			importsList.innerHTML =
				'<p style="color: #64748b; font-style: italic;">No imports</p>';
		}

		// Exports
		if (node.exports && node.exports.length > 0) {
			exportsList.innerHTML = `<ul class="detail-list">${node.exports.map((exp) => `<li>${exp}</li>`).join("")}</ul>`;
		} else {
			exportsList.innerHTML =
				'<p style="color: #64748b; font-style: italic;">No exports</p>';
		}

		// Unused exports
		if (node.unusedExports && node.unusedExports.length > 0) {
			unusedExportsSection.style.display = "block";
			unusedExportsList.innerHTML = `<ul class="detail-list">${node.unusedExports.map((exp) => `<li style="color: #f59e0b;">${exp}</li>`).join("")}</ul>`;
		} else {
			unusedExportsSection.style.display = "none";
		}

		panel.style.display = "block";
	}

	showTooltip(event, node) {
		const tooltip = document.getElementById("tooltip");
		tooltip.innerHTML = `
      <strong>${node.label}</strong><br>
      <small>${node.path}</small><br>
      Type: ${node.type}<br>
      Imports: ${node.imports?.length || 0}<br>
      Exports: ${node.exports?.length || 0}
    `;

		tooltip.style.left = event.pageX + 10 + "px";
		tooltip.style.top = event.pageY - 10 + "px";
		tooltip.classList.add("visible");
	}

	hideTooltip() {
		const tooltip = document.getElementById("tooltip");
		tooltip.classList.remove("visible");
	}

	changeLayout(layoutType) {
		if (!this.simulation) return;

		// Stop current simulation
		this.simulation.stop();

		switch (layoutType) {
			case "force":
				this.simulation
					.force(
						"link",
						d3
							.forceLink(this.filteredData.edges)
							.id((d) => d.id)
							.distance(80),
					)
					.force("charge", d3.forceManyBody().strength(-200))
					.force("center", d3.forceCenter(this.width / 2, this.height / 2));
				break;

			case "hierarchy":
				this.simulation
					.force(
						"link",
						d3
							.forceLink(this.filteredData.edges)
							.id((d) => d.id)
							.distance(100),
					)
					.force("charge", d3.forceManyBody().strength(-100))
					.force("y", d3.forceY((d) => d.depth * 80 + 50).strength(0.8))
					.force("x", d3.forceX(this.width / 2).strength(0.1));
				break;

			case "circular":
				const nodes = this.filteredData.nodes;
				const radius = Math.min(this.width, this.height) / 3;
				nodes.forEach((node, i) => {
					const angle = (2 * Math.PI * i) / nodes.length;
					node.fx = this.width / 2 + radius * Math.cos(angle);
					node.fy = this.height / 2 + radius * Math.sin(angle);
				});
				this.simulation.force("charge", null).force("center", null);
				break;
		}

		this.simulation.alpha(1).restart();
	}

	centerGraph() {
		if (!this.svg) return;

		const transition = this.svg.transition().duration(750);
		this.svg.call(
			this.zoom.transform,
			d3.zoomIdentity.translate(0, 0).scale(1),
		);
	}

	resetFilters() {
		this.filters = {
			search: "",
			nodeTypes: {
				entry: true,
				internal: true,
				external: true,
				barrel: true,
			},
			maxDepth: 10,
		};

		// Update UI
		document.getElementById("search-input").value = "";
		document.getElementById("depth-filter").value = "10";
		document.getElementById("depth-value").textContent = "10";
		["entry", "internal", "external", "barrel"].forEach((type) => {
			document.getElementById(`type-${type}`).checked = true;
		});

		this.applyFilters();
	}

	updateStatistics() {
		if (!this.data || !this.filteredData) return;

		document.getElementById("total-files").textContent = this.data.nodes.length;
		document.getElementById("visible-files").textContent =
			this.filteredData.nodes.length;
		document.getElementById("external-deps").textContent =
			this.data.nodes.filter((n) => n.type === "external").length;
	}

	exportGraph() {
		if (!this.filteredData) return;

		const dataStr = JSON.stringify(this.filteredData, null, 2);
		const dataBlob = new Blob([dataStr], { type: "application/json" });
		const url = URL.createObjectURL(dataBlob);

		const link = document.createElement("a");
		link.href = url;
		link.download = "filtered-dependency-graph.json";
		link.click();

		URL.revokeObjectURL(url);
	}

	handleResize() {
		const container = document.querySelector(".visualization-area");
		this.width = container.clientWidth;
		this.height = container.clientHeight;

		this.svg.attr("width", this.width).attr("height", this.height);

		if (this.simulation) {
			this.simulation
				.force("center", d3.forceCenter(this.width / 2, this.height / 2))
				.restart();
		}
	}

	showLoading(show) {
		document.getElementById("loading").style.display = show ? "flex" : "none";
	}

	showError(message) {
		document.getElementById("error-message").textContent = message;
		document.getElementById("error").style.display = "flex";
		this.showLoading(false);
	}

	hideError() {
		document.getElementById("error").style.display = "none";
	}
}

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	new DependencyGraphVisualizer();
});
