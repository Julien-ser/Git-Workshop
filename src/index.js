/**
 * GDG Network Graph
 * 
 * A visual network graph showing contributors and their connections.
 * Built with D3.js for the visualization.
 * 
 * @see https://d3js.org/ - D3.js documentation
 */

// =============================================================================
// SETUP & CONFIGURATION
// =============================================================================

// Get the container dimensions for responsive sizing
const graphContainer = document.querySelector('.graph-container');
const width = graphContainer.clientWidth;
const height = graphContainer.clientHeight;

// Create the main SVG element where the graph will be drawn
const svg = d3.select("#network-graph")
    .attr("width", width)
    .attr("height", height);

// Create a group element for zoom/pan transformations
const g = svg.append("g");

// Enable zoom and pan behavior (scroll to zoom, drag to pan)
const zoom = d3.zoom()
    .scaleExtent([0.5, 3]) // Min 50% zoom, max 300% zoom
    .on("zoom", function () {
        g.attr("transform", d3.event.transform);
    });

svg.call(zoom);

// Select the tooltip element for showing contributor details
const tooltip = d3.select(".tooltip");

// =============================================================================
// TOOLTIP POSITIONING
// =============================================================================

/**
 * Calculates the best position for the tooltip to avoid overlapping the node
 * and stay within the viewport bounds.
 */
function positionTooltip(x, y, isDetailed = false, nodeRadius = 8) {
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode ? tooltipNode.offsetWidth : (isDetailed ? 280 : 180);
    const tooltipHeight = tooltipNode ? tooltipNode.offsetHeight : (isDetailed ? 200 : 60);
    const padding = 12;
    const gap = 16;

    // Try positioning above the node first
    let left = x - (tooltipWidth / 2);
    let top = y - nodeRadius - tooltipHeight - gap;

    // Keep tooltip within horizontal bounds
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));

    // If not enough space above, position below
    if (top < padding) {
        top = y + nodeRadius + gap;
    }

    // If still not enough space, position to the side
    if (top + tooltipHeight > window.innerHeight - padding) {
        top = Math.max(padding, y - tooltipHeight / 2);
        left = x + nodeRadius + gap;
        if (left + tooltipWidth > window.innerWidth - padding) {
            left = x - nodeRadius - tooltipWidth - gap;
        }
    }

    return { left, top };
}

// =============================================================================
// DATA LOADING & PROCESSING
// =============================================================================

// Load contributor data from data.json
// Cache busting: append timestamp to bypass browser/CDN caching
const cacheBuster = new Date().getTime();
d3.json(`./data.json?v=${cacheBuster}`, function (error, data) {
    if (error) {
        console.error("Error loading data:", error);
        alert("Error loading data.json. Please make sure the file exists.");
        return;
    }

    // Transform raw data into node objects
    // Only 'name' is required - all other fields are optional
    const nodes = data.map((person, index) => ({
        id: person.name.toLowerCase().replace(/\s+/g, '-'),
        name: person.name,
        website: person.website || null,
        linkedIn: person.linkedIn || null,
        gitHub: person.gitHub || null,
        graduationYear: person.graduationYear || null,
        professionalEmail: person.professionalEmail || null,
        index: index,
        // Start nodes spread out across the canvas (not all in center)
        x: width * 0.2 + Math.random() * width * 0.3,
        y: height * 0.2 + Math.random() * height * 0.3
    }));

    // =========================================================================
    // SIDEBAR POPULATION
    // =========================================================================

    const peopleList = d3.select("#people-list");

    // Create a card in the sidebar for each contributor
    peopleList.selectAll(".person-card")
        .data(nodes)
        .enter()
        .append("div")
        .attr("class", "person-card")
        .attr("data-id", d => d.id)
        .html(d => {
            // Build links HTML only for fields that exist
            let linksHtml = '';
            if (d.website) linksHtml += `<a href="${d.website}" target="_blank" onclick="event.stopPropagation()">Web</a>`;
            if (d.linkedIn) linksHtml += `<a href="${d.linkedIn}" target="_blank" onclick="event.stopPropagation()">LinkedIn</a>`;
            if (d.gitHub) linksHtml += `<a href="${d.gitHub}" target="_blank" onclick="event.stopPropagation()">GitHub</a>`;

            return `
                <div class="person-name">${d.name}</div>
                ${d.graduationYear ? `<div class="person-details"><span class="year">Class of ${d.graduationYear}</span></div>` : ''}
                ${linksHtml ? `<div class="person-links">${linksHtml}</div>` : ''}
            `;
        })
        .on("click", function (d, i, nodes) {
            // Highlight selected card
            d3.selectAll(".person-card").classed("active", false);
            d3.select(this).classed("active", true);

            // Show detailed tooltip with contributor info
            const cardRect = nodes[i].getBoundingClientRect();
            showDetailedTooltip(d, cardRect.right, cardRect.top);
        });

    // =========================================================================
    // NETWORK CONNECTIONS
    // =========================================================================

    const links = [];

    // Group contributors by graduation year
    const yearGroups = new Map();
    nodes.forEach(node => {
        const year = node.graduationYear || 'unknown';
        if (!yearGroups.has(year)) {
            yearGroups.set(year, []);
        }
        yearGroups.get(year).push(node);
    });

    // Each graduation year forms its own independent cycle
    yearGroups.forEach((groupNodes) => {
        if (groupNodes.length === 1) {
            // Single node - no connections needed
            return;
        }

        if (groupNodes.length === 2) {
            // Two nodes - just connect them
            links.push({
                source: groupNodes[0].id,
                target: groupNodes[1].id
            });
            return;
        }

        // 3+ nodes - create a cycle (connect in a ring)
        for (let i = 0; i < groupNodes.length; i++) {
            const nextIndex = (i + 1) % groupNodes.length;
            links.push({
                source: groupNodes[i].id,
                target: groupNodes[nextIndex].id
            });
        }
    });

    // =========================================================================
    // FORCE SIMULATION
    // =========================================================================

    const graph = { nodes, links };

    // Create the physics simulation that positions nodes
    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(120))
        .force("charge", d3.forceManyBody().strength(-150))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(40));

    // =========================================================================
    // RENDER GRAPH ELEMENTS
    // =========================================================================

    // Draw the connection lines
    const link = g.append("g")
        .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .enter().append("line")
        .attr("class", "link");

    // Draw the node groups (circle + label)
    const node = g.append("g")
        .attr("class", "nodes")
        .selectAll("g")
        .data(graph.nodes)
        .enter().append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Add circles to represent each contributor
    node.append("circle")
        .attr("r", 8)
        .on("click", function (d) {
            d3.event.stopPropagation();

            // Clear active state from all nodes and add to clicked one
            d3.selectAll(".node").classed("active", false);
            d3.select(this.parentNode).classed("active", true);

            // Highlight corresponding sidebar card
            d3.selectAll(".person-card").classed("active", false);
            d3.select(`.person-card[data-id="${d.id}"]`).classed("active", true);

            // Show detailed tooltip
            const circleRect = this.getBoundingClientRect();
            const nodeX = circleRect.left + circleRect.width / 2;
            const nodeY = circleRect.top;
            showDetailedTooltip(d, nodeX, nodeY);
        })
        .on("mouseover", function (d) {
            if (!tooltip.classed("detailed")) {
                const circleRect = this.getBoundingClientRect();
                const nodeX = circleRect.left + circleRect.width / 2;
                const nodeY = circleRect.top;

                const hoverContent = d.graduationYear
                    ? `<div class="name">${d.name}</div><div class="year">Class of ${d.graduationYear}</div>`
                    : `<div class="name">${d.name}</div>`;
                tooltip.html(hoverContent);

                requestAnimationFrame(() => {
                    const pos = positionTooltip(nodeX, nodeY, false);
                    tooltip
                        .style("left", pos.left + "px")
                        .style("top", pos.top + "px")
                        .classed("visible", true);
                });
            }
        })
        .on("mouseout", function () {
            if (!tooltip.classed("detailed")) {
                tooltip.classed("visible", false);
            }
        });

    // Add name labels below each node
    node.append("text")
        .attr("dy", 25)
        .attr("text-anchor", "middle")
        .text(d => d.name);

    // =========================================================================
    // SIMULATION UPDATES
    // =========================================================================

    simulation.nodes(graph.nodes).on("tick", ticked);
    simulation.force("link").links(graph.links);

    // Update element positions on each simulation tick
    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("transform", d => `translate(${d.x},${d.y})`);
    }

    // =========================================================================
    // DRAG HANDLERS
    // =========================================================================

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
});

// =============================================================================
// SHARED TOOLTIP HELPER
// =============================================================================

/**
 * Shows the detailed tooltip with all contributor information.
 */
function showDetailedTooltip(d, x, y) {
    let sections = '';
    if (d.graduationYear) sections += `<div class="tooltip-section"><strong>Graduation Year:</strong> ${d.graduationYear}</div>`;
    if (d.professionalEmail) sections += `<div class="tooltip-section"><strong>Email:</strong><br><a href="mailto:${d.professionalEmail}">${d.professionalEmail}</a></div>`;
    if (d.website) sections += `<div class="tooltip-section"><strong>Website:</strong><br><a href="${d.website}" target="_blank">${d.website}</a></div>`;
    if (d.linkedIn) sections += `<div class="tooltip-section"><strong>LinkedIn:</strong><br><a href="${d.linkedIn}" target="_blank">${d.linkedIn}</a></div>`;
    if (d.gitHub) sections += `<div class="tooltip-section"><strong>GitHub:</strong><br><a href="${d.gitHub}" target="_blank">${d.gitHub}</a></div>`;

    const content = `
        <div class="tooltip-header">${d.name}</div>
        ${sections}
        <div class="tooltip-close">Click anywhere to close</div>
    `;

    tooltip.html(content);

    requestAnimationFrame(() => {
        const pos = positionTooltip(x, y, true);
        tooltip
            .style("left", pos.left + "px")
            .style("top", pos.top + "px")
            .classed("visible", true)
            .classed("detailed", true);
    });
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

// Close detailed tooltip when clicking outside
document.addEventListener('click', function (event) {
    const tooltip = d3.select(".tooltip");
    if (tooltip.classed("detailed") && !event.target.closest('.node') && !event.target.closest('.person-card')) {
        tooltip.classed("visible", false).classed("detailed", false);
        d3.selectAll(".person-card").classed("active", false);
        d3.selectAll(".node").classed("active", false);
    }
});

// Reload on window resize to recalculate dimensions
window.addEventListener('resize', function () {
    location.reload();
});

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

const searchInput = document.getElementById('search-input');

/**
 * Fuzzy match - returns true if all characters in query appear in text (in order).
 * Example: "jc" matches "Joshua Choong"
 */
function fuzzyMatch(text, query) {
    text = text.toLowerCase();
    let queryIndex = 0;
    for (let i = 0; i < text.length && queryIndex < query.length; i++) {
        if (text[i] === query[queryIndex]) {
            queryIndex++;
        }
    }
    return queryIndex === query.length;
}

/**
 * Scores how well a name matches the query.
 * Higher score = better match.
 */
function getMatchScore(text, query) {
    text = text.toLowerCase();
    if (text.startsWith(query)) return 100;  // Best: starts with query
    if (text.includes(query)) return 50;     // Good: contains query
    if (fuzzyMatch(text, query)) return 25;  // OK: fuzzy match
    return 0;                                 // No match
}

// Search as user types
searchInput.addEventListener('input', function () {
    const query = this.value.toLowerCase().trim();
    const nodeElements = d3.selectAll('.node');
    const cardElements = d3.selectAll('.person-card');

    // Clear highlighting if search is empty
    if (query === '') {
        nodeElements.classed('search-match', false).classed('search-dim', false);
        cardElements.classed('search-match', false).classed('search-dim', false);
        return;
    }

    let firstMatch = null;
    let bestScore = 0;

    // Highlight matching nodes (match name OR graduation year)
    nodeElements.each(function (d) {
        const nameScore = getMatchScore(d.name, query);
        const yearScore = d.graduationYear ? getMatchScore(d.graduationYear, query) : 0;
        const score = Math.max(nameScore, yearScore);
        const isMatch = score > 0;
        d3.select(this)
            .classed('search-match', isMatch)
            .classed('search-dim', !isMatch);
    });

    // Highlight matching cards and find best match
    cardElements.each(function () {
        const card = d3.select(this);
        const name = card.select('.person-name').text();
        const yearEl = card.select('.person-details .year');
        const year = yearEl.empty() ? '' : yearEl.text();
        const nameScore = getMatchScore(name, query);
        const yearScore = getMatchScore(year, query);
        const score = Math.max(nameScore, yearScore);
        const isMatch = score > 0;

        card.classed('search-match', isMatch).classed('search-dim', !isMatch);

        if (isMatch && score > bestScore) {
            bestScore = score;
            firstMatch = this;
        }
    });

    // Auto-scroll to best match
    if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// Press Escape to clear search
searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        this.value = '';
        this.dispatchEvent(new Event('input'));
        this.blur();
    }
});
