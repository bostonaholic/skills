// Renders the C4 site from window.C4 (data.js) with D3. One file serves every page; the page's
// <body data-level> picks the view.
(function () {
  "use strict";

  const DATA = window.C4;
  const LEVEL = document.body.dataset.level;
  const ORDER = ["context", "containers", "components", "code"];
  const TYPE_LABEL = {
    person: "Person",
    system: "Software system",
    external: "External system",
    container: "Container",
    component: "Component",
    code: "Code",
  };
  // Where double-clicking an element of each type takes you, and the query naming it there.
  const DRILL = {
    system: () => "containers.html",
    container: (id) => `components.html?container=${encodeURIComponent(id)}`,
    component: (id) => `code.html?component=${encodeURIComponent(id)}`,
  };
  // Code labels stay visible when a view has this many nodes or fewer, or when zoomed in past
  // LABEL_ZOOM; beyond that they would overlap into an unreadable mass.
  const CODE_LABEL_LIMIT = 90;
  const LABEL_ZOOM = 1.25;
  // Synchronous warm-up ticks before the first paint, so the diagram opens settled instead of
  // exploding outward. Larger views get fewer ticks to keep the first paint under a second.
  const WARM_TICKS = (n) => (n > 1500 ? 60 : n > 500 ? 150 : 300);
  // The overview previews draw at most this many nodes, so a large code level stays cheap.
  const PREVIEW_LIMIT = 250;
  // Search lists this many matches; refine the query to see others.
  const SEARCH_LIMIT = 14;

  const $ = (selector) => document.querySelector(selector);
  const el = (id) => DATA.elements[id];
  const color = (type) => `var(--${type})`;
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  initTheme();
  markNav();
  if (!DATA) return fatal("data.js is missing or empty. Rebuild the site with build-c4-site.mjs.");
  if (typeof window.d3 === "undefined")
    return fatal(
      "D3 could not load from cdn.jsdelivr.net, so the diagrams cannot draw. Open the page with a network connection.",
    );
  if (LEVEL === "overview") renderOverview();
  else renderLevel(LEVEL);

  // ---------------------------------------------------------------- shared

  function initTheme() {
    const button = $("#theme-toggle");
    if (!button) return;
    button.addEventListener("click", () => {
      const root = document.documentElement;
      const dark =
        root.dataset.theme === "dark" ||
        (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "light" : "dark";
      try {
        localStorage.setItem("c4-theme", root.dataset.theme);
      } catch {}
    });
  }

  function markNav() {
    const link = document.querySelector(`[data-nav="${LEVEL}"]`);
    if (link) link.setAttribute("aria-current", "page");
  }

  function fatal(message) {
    const main = document.querySelector("main");
    main.innerHTML = "";
    const box = document.createElement("div");
    box.className = "fatal";
    box.textContent = message;
    main.appendChild(box);
  }

  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "style") node.style.cssText = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat())
      if (child !== null && child !== undefined && child !== false)
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }

  function ancestors(id) {
    const chain = [];
    for (let e = el(el(id).parent); e; e = el(e.parent)) chain.unshift(e);
    return chain;
  }

  function belongsTo(id, scope) {
    for (let e = el(id); e; e = el(e.parent)) if (e.id === scope) return true;
    return false;
  }

  // ---------------------------------------------------------------- overview

  function renderOverview() {
    const counts = {};
    for (const e of Object.values(DATA.elements)) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const stats = $("#hero-stats");
    for (const [type, label] of [
      ["person", "People"],
      ["external", "External systems"],
      ["container", "Containers"],
      ["component", "Components"],
      ["code", "Code elements"],
    ])
      stats.append(
        h(
          "div",
          {},
          h("dt", {}, h("span", { class: "dot", style: `--c:${color(type)}` }), label),
          h("dd", {}, (counts[type] ?? 0).toLocaleString()),
        ),
      );

    const cards = $("#level-cards");
    const rows = $("#cycle-rows");
    const accent = {
      context: "system",
      containers: "container",
      components: "component",
      code: "code",
    };
    for (const level of ORDER) {
      const view = DATA.levels[level];
      const core = view.nodes.filter((n) => n.core).length;
      const svg = d3.create("svg").attr("class", "preview").attr("aria-hidden", "true");
      const card = h(
        "a",
        { class: "level-card", href: view.file, style: `--c:${color(accent[level])}` },
        svg.node(),
        h(
          "div",
          { class: "body" },
          h("span", { class: "tag" }, `Level ${view.number}`),
          h("h3", {}, view.title),
          h("p", {}, view.summary),
          h(
            "div",
            { class: "metrics" },
            h("span", { class: "chip" }, plural(core, "element")),
            h("span", { class: "chip" }, plural(view.edges.length, "dependency", "dependencies")),
            level === "context"
              ? null
              : h(
                  "span",
                  { class: view.cycles.length ? "chip cycle" : "chip" },
                  plural(view.cycles.length, "cycle"),
                ),
          ),
        ),
      );
      cards.append(card);
      drawPreview(svg, view);

      if (level === "context") continue;
      const inCycle = view.nodes.filter((n) => n.cycle).length;
      const largest = view.cycles.reduce((max, c) => Math.max(max, c.nodes.length), 0);
      rows.append(
        h(
          "tr",
          {},
          h("td", {}, h("strong", {}, `${view.number} · ${view.title}`)),
          h("td", { class: view.cycles.length ? "num-cycle" : "none" }, view.cycles.length),
          h("td", { class: inCycle ? "" : "none" }, `${inCycle} of ${core}`),
          h("td", { class: largest ? "" : "none" }, largest ? plural(largest, "element") : "–"),
          h(
            "td",
            {},
            h(
              "a",
              { href: view.cycles.length ? `${view.file}?cyclesOnly=1` : view.file },
              view.cycles.length ? "Show cycles →" : "Open →",
            ),
          ),
        ),
      );
    }
  }

  function drawPreview(svg, view) {
    const width = 300;
    const height = 150;
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");
    const nodes = view.nodes.slice(0, PREVIEW_LIMIT).map((n) => ({ ...n, type: el(n.id).type }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = view.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, cycle: e.cycle }));
    if (!nodes.length) return;
    const r = nodes.length > 120 ? 2.6 : nodes.length > 40 ? 4 : 7;
    const sim = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(r * 5),
      )
      .force("charge", d3.forceManyBody().strength(-r * 10))
      .force("x", d3.forceX(0).strength(0.08))
      .force("y", d3.forceY(0).strength(0.12))
      .force("collide", d3.forceCollide(r + 1.5))
      .stop();
    sim.tick(200);
    const [x0, x1] = d3.extent(nodes, (d) => d.x);
    const [y0, y1] = d3.extent(nodes, (d) => d.y);
    const scale = Math.min((width - 30) / (x1 - x0 || 1), (height - 30) / (y1 - y0 || 1), 2.2);
    const g = svg
      .append("g")
      .attr(
        "transform",
        `translate(${width / 2 - ((x0 + x1) / 2) * scale},${height / 2 - ((y0 + y1) / 2) * scale}) scale(${scale})`,
      );
    g.selectAll("line")
      .data(links)
      .join("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y)
      .attr("stroke", (d) => (d.cycle ? "var(--cycle)" : "var(--edge)"))
      .attr("stroke-width", 1.2 / scale)
      .attr("stroke-opacity", 0.9);
    g.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", r)
      .attr("fill", (d) => (d.core ? color(d.type) : "var(--outside)"))
      .attr("stroke", (d) => (d.cycle ? "var(--cycle)" : "none"))
      .attr("stroke-width", 2 / scale);
  }

  // ---------------------------------------------------------------- level pages

  function renderLevel(level) {
    const view = DATA.levels[level];
    const params = new URLSearchParams(location.search);
    const state = {
      scope: params.get("component") || params.get("container") || "",
      cycle: params.get("cycle") || null,
      cyclesOnly: params.get("cyclesOnly") === "1",
      showCycles: true,
      edgeLabels: level === "context" || level === "containers",
      selected: params.get("focus") || null,
      query: "",
    };
    if (state.scope && !el(state.scope)) state.scope = "";
    if (state.cycle && !view.cycles.some((c) => c.id === state.cycle)) state.cycle = null;

    const cycleById = new Map(view.cycles.map((c) => [c.id, c]));
    const nodeInfo = new Map(view.nodes.map((n) => [n.id, n]));
    const positions = new Map();

    $("#level-eyebrow").textContent = `Level ${view.number} of 4`;
    $("#level-summary").textContent = view.summary;
    $("#toggle-cycles-only").checked = state.cyclesOnly;
    $("#toggle-labels").checked = state.edgeLabels;
    document.title = `${view.title} · ${DATA.system.name}`;

    renderStats();
    renderLegend();
    renderFilter();
    renderCycleList();

    // --- SVG scaffold
    const svg = d3.select("#graph");
    const defs = svg.append("defs");
    for (const [id, cls] of [
      ["arrow", "marker-default"],
      ["arrow-cycle", "marker-cycle"],
      ["arrow-hi", "marker-hi"],
    ])
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 9)
        .attr("refY", 0)
        .attr("markerWidth", 7)
        .attr("markerHeight", 7)
        .attr("orient", "auto")
        .append("path")
        .attr("class", cls)
        .attr("d", "M0,-4.5L10,0L0,4.5Z");
    const root = svg.append("g");
    const hullLayer = root.append("g");
    const edgeLayer = root.append("g");
    const labelLayer = root.append("g");
    const nodeLayer = root.append("g");
    const zoom = d3
      .zoom()
      .scaleExtent([0.08, 4])
      .on("zoom", (event) => {
        root.attr("transform", event.transform);
        updateLabelVisibility(event.transform.k);
      });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("click", (event) => {
      if (event.target === svg.node()) select(null);
    });

    let sim = null;
    let graph = { nodes: [], edges: [] };
    let currentK = 1;

    // --- data for the current scope and modes

    function visibleGraph() {
      let core = view.nodes.filter((n) => n.core);
      if (state.cycle) core = core.filter((n) => n.cycle === state.cycle);
      else {
        if (state.scope) core = core.filter((n) => belongsTo(n.id, state.scope));
        if (state.cyclesOnly) core = core.filter((n) => n.cycle);
      }
      const coreIds = new Set(core.map((n) => n.id));
      const strict = Boolean(state.cycle || state.cyclesOnly);
      const edges = view.edges.filter((e) => {
        const s = coreIds.has(e.source);
        const t = coreIds.has(e.target);
        return strict ? s && t : s || t;
      });
      const ids = new Set(coreIds);
      for (const e of edges) ids.add(e.source).add(e.target);
      const nodes = [...ids].map((id) => {
        const element = el(id);
        const info = nodeInfo.get(id);
        // Outside: a core element of this level that the scope or cycle filter leaves out.
        const outside = Boolean(info?.core) && !coreIds.has(id);
        const node = {
          id,
          element,
          type: element.type,
          cycle: info?.cycle ?? null,
          outside,
          degree: 0,
        };
        Object.assign(node, geometry(node));
        const saved = positions.get(id);
        // Cycle views lay out from scratch; their few nodes would stay bunched otherwise.
        if (saved && !strict) Object.assign(node, saved);
        return node;
      });
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const links = edges.map((e) => ({
        ...e,
        source: byId.get(e.source),
        target: byId.get(e.target),
      }));
      for (const l of links) {
        l.source.degree += 1;
        l.target.degree += 1;
      }
      for (const n of nodes) if (n.type === "code") Object.assign(n, geometry(n));
      const pairs = new Set(edges.map((e) => `${e.source}\u0000${e.target}`));
      for (const l of links) l.bidirectional = pairs.has(`${l.target.id}\u0000${l.source.id}`);
      return { nodes, edges: links, byId };
    }

    function geometry(node) {
      if (node.type === "code") {
        const r = 6 + Math.min(9, Math.sqrt(node.degree || 0) * 1.8);
        return { shape: "circle", r, w: r * 2, h: r * 2 };
      }
      const name = node.element.name;
      const w = Math.max(132, Math.min(232, name.length * 7.6 + 36));
      const h = node.type === "person" ? 70 : node.type === "component" ? 58 : 64;
      return { shape: node.type === "person" ? "person" : "box", w, h, r: Math.hypot(w, h) / 2 };
    }

    // Each node's group: the boundary drawn around it and the centroid it is pulled toward.
    function groupOf(node) {
      if (node.outside || !nodeInfo.get(node.id)?.core) return null;
      if (level === "containers") return node.type === "container" ? DATA.system.id : null;
      if (level === "components" || level === "code") return node.element.parent;
      return null;
    }

    // Layer people above and external systems below, as C4 diagrams conventionally do.
    function bandY(node) {
      if (level !== "context" && level !== "containers") return 0;
      if (node.type === "person") return -260;
      if (node.type === "external") return 260;
      return 0;
    }

    // --- drawing

    function draw(first) {
      if (sim) sim.stop();
      graph = visibleGraph();
      const { nodes, edges } = graph;
      $("#empty").hidden = nodes.length > 0;
      if (!nodes.length)
        $("#empty").textContent = state.cyclesOnly
          ? "No dependency cycles at this level."
          : "Nothing to show here. The model has no elements at this level.";
      renderBanner();

      const groups = d3.group(
        nodes.filter((n) => groupOf(n)),
        groupOf,
      );
      seedPositions(nodes, groups);
      const big = nodes.length > 400;
      // Code labels show at this size, so circles need room for their text.
      const labelled = nodes.length <= CODE_LABEL_LIMIT;

      sim = d3
        .forceSimulation(nodes)
        .force(
          "link",
          d3
            .forceLink(edges)
            .id((d) => d.id)
            .distance((l) => (l.source.r + l.target.r) * (level === "code" ? 1.3 : 1.15) + 40)
            .strength((l) => (groupOf(l.source) === groupOf(l.target) ? 0.35 : 0.08)),
        )
        .force(
          "charge",
          d3
            .forceManyBody()
            .strength((d) => (d.shape === "circle" ? (big ? -60 : labelled ? -240 : -140) : -900))
            .distanceMax(big ? 400 : 900),
        )
        .force(
          "collide",
          d3
            .forceCollide((d) =>
              d.shape === "circle" ? d.r + (labelled ? 30 : 10) : d.r * 0.95 + 14,
            )
            .iterations(2),
        )
        .force("group", groupForce(nodes, groups))
        .force("x", d3.forceX(0).strength(level === "code" ? 0.02 : 0.04))
        .force(
          "y",
          d3.forceY(bandY).strength((d) => (bandY(d) ? 0.25 : 0.04)),
        )
        .alphaDecay(0.035)
        .stop();
      sim.tick(first || nodes.some((n) => n.x === undefined) ? WARM_TICKS(nodes.length) : 40);

      renderHulls(groups);
      renderEdges(edges);
      renderNodes(nodes);
      ticked();
      sim.on("tick", ticked).alpha(0.08).restart();
      updateLabelVisibility(currentK);
      applyHighlight();
      if (state.selected && !graph.byId.has(state.selected)) state.selected = null;
      renderDetails();
      fit(first ? 0 : 450);
    }

    function seedPositions(nodes, groups) {
      const keys = [...groups.keys()];
      const columns = Math.ceil(Math.sqrt(keys.length || 1));
      const spacing = level === "code" ? 520 : 640;
      const centers = new Map(
        keys.map((key, i) => [
          key,
          {
            x: ((i % columns) - (columns - 1) / 2) * spacing,
            y:
              (Math.floor(i / columns) - (Math.ceil(keys.length / columns) - 1) / 2) *
              spacing *
              0.75,
          },
        ]),
      );
      for (const n of nodes) {
        if (n.x !== undefined) continue;
        const c = centers.get(groupOf(n)) ?? { x: 0, y: bandY(n) };
        n.x = c.x + (Math.random() - 0.5) * 200;
        n.y = c.y + (Math.random() - 0.5) * 200;
      }
    }

    // Pulls each node gently toward the centroid of its group, so boundaries stay compact.
    function groupForce(nodes, groups) {
      const strength = 0.12;
      const force = (alpha) => {
        for (const members of groups.values()) {
          if (members.length < 2) continue;
          const cx = d3.mean(members, (d) => d.x);
          const cy = d3.mean(members, (d) => d.y);
          for (const d of members) {
            d.vx += (cx - d.x) * strength * alpha;
            d.vy += (cy - d.y) * strength * alpha;
          }
        }
      };
      force.initialize = () => {};
      return force;
    }

    function renderHulls(groups) {
      const data = [...groups.entries()].map(([id, members]) => ({ id, members, element: el(id) }));
      const hulls = hullLayer
        .selectAll("g.hull-group")
        .data(data, (d) => d.id)
        .join((enter) => {
          const g = enter.append("g").attr("class", "hull-group");
          g.append("path").attr("class", "hull");
          g.append("text").attr("class", "hull-label");
          return g;
        });
      hulls.attr("style", (d) => `--c:${color(d.element.type)}`);
      hulls
        .select("text")
        .text(
          (d) => `${d.element.name}${d.element.technology ? ` [${d.element.technology}]` : ""}`,
        );
    }

    function renderEdges(edges) {
      edgeLayer
        .selectAll("g.edge-group")
        .data(edges, (d) => `${d.source.id}\u0000${d.target.id}`)
        .join((enter) => {
          const g = enter.append("g").attr("class", "edge-group");
          g.append("path").attr("class", "edge");
          g.append("path")
            .attr("class", "edge-hit")
            .on("mouseenter", (event, d) => {
              hoverEdge(d);
              showTooltip(event, edgeTooltip(d));
            })
            .on("mousemove", moveTooltip)
            .on("mouseleave", () => {
              hoverEdge(null);
              hideTooltip();
            });
          return g;
        })
        .select("path.edge")
        .classed("in-cycle", (d) => Boolean(d.cycle))
        .classed("peripheral", (d) => d.source.outside || d.target.outside);
      labelLayer
        .selectAll("text.edge-label")
        .data(
          edges.filter((e) => e.labels.length),
          (d) => `${d.source.id}\u0000${d.target.id}`,
        )
        .join("text")
        .attr("class", "edge-label")
        .attr("text-anchor", "middle")
        .text((d) => truncate(d.labels[0], 34) + (d.count > 1 ? ` (+${d.count - 1})` : ""));
    }

    function renderNodes(nodes) {
      const many = nodes.length > 220;
      const selection = nodeLayer
        .selectAll("g.node")
        .data(nodes, (d) => d.id)
        .join((enter) => {
          const g = enter
            .append("g")
            .attr("class", (d) => `node ${d.type}`)
            .attr("role", "button");
          g.each(function (d) {
            const node = d3.select(this);
            if (d.shape === "circle") {
              node.append("circle").attr("class", "ring");
              node.append("circle").attr("class", "shape");
              node.append("text").attr("class", "name");
              return;
            }
            node.append("rect").attr("class", "ring");
            if (d.shape === "person") node.append("circle").attr("class", "shape head");
            node.append("rect").attr("class", "shape");
            node.append("text").attr("class", "name").attr("text-anchor", "middle");
            node.append("text").attr("class", "meta").attr("text-anchor", "middle");
          });
          g.on("mouseenter", (event, d) => {
            hoverNode(d);
            showTooltip(event, nodeTooltip(d));
          })
            .on("mousemove", moveTooltip)
            .on("mouseleave", () => {
              hoverNode(null);
              hideTooltip();
            })
            .on("click", (event, d) => {
              event.stopPropagation();
              select(d.id);
            })
            .on("dblclick", (event, d) => {
              event.stopPropagation();
              drill(d.id);
            })
            .on("keydown", (event, d) => {
              if (event.key === "Enter") select(d.id);
            })
            .call(
              d3
                .drag()
                // A click that wobbles a few pixels still selects instead of dragging.
                .clickDistance(4)
                .on("start", (event, d) => {
                  if (!event.active) sim.alphaTarget(0.15).restart();
                  d.fx = d.x;
                  d.fy = d.y;
                })
                .on("drag", (event, d) => {
                  d.fx = event.x;
                  d.fy = event.y;
                })
                .on("end", (event) => {
                  if (!event.active) sim.alphaTarget(0);
                }),
            );
          return g;
        });

      selection
        .attr("style", (d) => `--c:${color(d.type)}`)
        .attr("tabindex", many ? null : 0)
        .attr("aria-label", (d) => `${TYPE_LABEL[d.type]} ${d.element.name}`)
        .classed("outside", (d) => d.outside)
        .classed("in-cycle", (d) => Boolean(d.cycle));

      selection.each(function (d) {
        const node = d3.select(this);
        if (d.shape === "circle") {
          node.selectAll("circle").attr("r", (_, i) => (i === 0 ? d.r + 4 : d.r));
          node
            .select("text.name")
            .attr("x", d.r + 6)
            .attr("y", 4)
            .text(truncate(d.element.name, 40));
          return;
        }
        const top = d.shape === "person" ? -d.h / 2 + 12 : -d.h / 2;
        const height = d.shape === "person" ? d.h - 12 : d.h;
        node
          .select("rect.ring")
          .attr("x", -d.w / 2 - 5)
          .attr("y", top - 5)
          .attr("width", d.w + 10)
          .attr("height", height + 10)
          .attr("rx", 16);
        node
          .select("rect.shape")
          .attr("x", -d.w / 2)
          .attr("y", top)
          .attr("width", d.w)
          .attr("height", height)
          .attr("rx", d.shape === "person" ? 22 : 12);
        if (d.shape === "person")
          node
            .select("circle.head")
            .attr("cx", 0)
            .attr("cy", -d.h / 2 + 4)
            .attr("r", 14);
        const meta = d.element.technology ? `[${d.element.technology}]` : TYPE_LABEL[d.type];
        node
          .select("text.name")
          .attr("y", top + height / 2 - 2)
          .text(truncate(d.element.name, 28));
        node
          .select("text.meta")
          .attr("y", top + height / 2 + 14)
          .text(truncate(meta, 34));
      });
    }

    // Endpoint on a node's border along the line toward (tx, ty).
    function border(node, tx, ty) {
      const dx = tx - node.x;
      const dy = ty - node.y;
      const len = Math.hypot(dx, dy) || 1;
      if (node.shape === "circle")
        return [node.x + (dx / len) * (node.r + 3), node.y + (dy / len) * (node.r + 3)];
      const hw = node.w / 2 + 4;
      const hh = node.h / 2 + 4;
      const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
      return [node.x + dx * Math.min(t, 1), node.y + dy * Math.min(t, 1)];
    }

    function edgePath(d) {
      const s = d.source;
      const t = d.target;
      if (!d.bidirectional) {
        const [x1, y1] = border(s, t.x, t.y);
        const [x2, y2] = border(t, s.x, s.y);
        d.mid = [(x1 + x2) / 2, (y1 + y2) / 2];
        return `M${x1},${y1}L${x2},${y2}`;
      }
      // Two-way pairs curve apart so both directions stay visible.
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = Math.min(60, len * 0.18);
      const cx = (s.x + t.x) / 2 + (-dy / len) * bend;
      const cy = (s.y + t.y) / 2 + (dx / len) * bend;
      const [x1, y1] = border(s, cx, cy);
      const [x2, y2] = border(t, cx, cy);
      d.mid = [0.25 * x1 + 0.5 * cx + 0.25 * x2, 0.25 * y1 + 0.5 * cy + 0.25 * y2];
      return `M${x1},${y1}Q${cx},${cy} ${x2},${y2}`;
    }

    function ticked() {
      const groups = edgeLayer.selectAll("g.edge-group");
      groups.each(function (d) {
        const path = edgePath(d);
        d3.select(this).selectAll("path").attr("d", path);
      });
      groups.select("path.edge").attr("marker-end", markerFor);
      labelLayer
        .selectAll("text.edge-label")
        .attr("x", (d) => d.mid?.[0] ?? 0)
        .attr("y", (d) => (d.mid?.[1] ?? 0) - 4);
      nodeLayer.selectAll("g.node").attr("transform", (d) => `translate(${d.x},${d.y})`);
      hullLayer.selectAll("g.hull-group").each(function (d) {
        const outline = hullPath(d.members);
        const g = d3.select(this);
        g.select("path").attr("d", outline.path);
        g.select("text").attr("x", outline.x).attr("y", outline.y);
      });
      for (const n of graph.nodes) positions.set(n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy });
    }

    function hullPath(members) {
      const pad = level === "code" ? 22 : 34;
      const points = [];
      for (const d of members) {
        if (d.shape === "circle") {
          const r = d.r + pad;
          for (let a = 0; a < 8; a++)
            points.push([
              d.x + r * Math.cos((a * Math.PI) / 4),
              d.y + r * Math.sin((a * Math.PI) / 4),
            ]);
        } else {
          const hw = d.w / 2 + pad;
          const hh = d.h / 2 + pad;
          points.push(
            [d.x - hw, d.y - hh],
            [d.x + hw, d.y - hh],
            [d.x + hw, d.y + hh],
            [d.x - hw, d.y + hh],
          );
        }
      }
      const hull = d3.polygonHull(points) ?? points;
      const top = d3.min(points, (p) => p[1]);
      const left = d3.min(points, (p) => p[0]);
      return {
        path: d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6))(hull),
        x: left + 14,
        y: top + 18,
      };
    }

    function markerFor(d) {
      if (d.highlighted)
        return d.cycle && state.showCycles ? "url(#arrow-cycle)" : "url(#arrow-hi)";
      return d.cycle && state.showCycles ? "url(#arrow-cycle)" : "url(#arrow)";
    }

    // --- highlight, hover, selection

    let hovered = null;
    let hoveredEdge = null;

    function hoverNode(d) {
      hovered = d ? d.id : null;
      applyHighlight();
    }

    function hoverEdge(d) {
      hoveredEdge = d;
      applyHighlight();
    }

    function applyHighlight() {
      const focus = hovered || state.selected;
      const svgNode = d3.select("#graph");
      svgNode.classed("show-cycles", state.showCycles);
      svgNode.classed("hide-edge-labels", !state.edgeLabels);
      const matches = matchSet();
      let lit = null;
      let litEdges = null;
      if (hoveredEdge) {
        lit = new Set([hoveredEdge.source.id, hoveredEdge.target.id]);
        litEdges = new Set([hoveredEdge]);
      } else if (focus && graph.byId.has(focus)) {
        lit = new Set([focus]);
        litEdges = new Set();
        for (const e of graph.edges)
          if (e.source.id === focus || e.target.id === focus) {
            litEdges.add(e);
            lit.add(e.source.id).add(e.target.id);
          }
      }
      nodeLayer
        .selectAll("g.node")
        .classed("dim", (d) => (lit ? !lit.has(d.id) : matches ? !matches.has(d.id) : false))
        .classed("hl", (d) => Boolean(lit && lit.has(d.id)))
        .classed("selected", (d) => d.id === state.selected)
        .classed("match", (d) => Boolean(matches && matches.has(d.id)));
      edgeLayer.selectAll("g.edge-group").each(function (d) {
        d.highlighted = Boolean(litEdges && litEdges.has(d));
        d3.select(this)
          .select("path.edge")
          .classed("hl", d.highlighted)
          .classed("dim", Boolean(lit) && !d.highlighted)
          .classed(
            "flow",
            Boolean(state.cycle && d.cycle === state.cycle) ||
              (d.highlighted && Boolean(d.cycle) && state.showCycles),
          )
          .attr("marker-end", markerFor(d));
      });
      labelLayer
        .selectAll("text.edge-label")
        .classed("dim", (d) => Boolean(lit) && !(litEdges && litEdges.has(d)));
      hullLayer.selectAll("g.hull-group").classed("dim", Boolean(lit));
    }

    function matchSet() {
      const q = state.query.trim().toLowerCase();
      if (!q) return null;
      return new Set(graph.nodes.filter((n) => matchesQuery(n.element, q)).map((n) => n.id));
    }

    function matchesQuery(element, q) {
      return [element.name, element.path, element.technology, element.id].some(
        (v) => v && v.toLowerCase().includes(q),
      );
    }

    function select(id, { center = false } = {}) {
      state.selected = id;
      applyHighlight();
      renderDetails();
      if (id && center) centerOn(id);
    }

    // Selects an element, widening the view first when the current scope hides it.
    function reveal(id) {
      if (!graph.byId.has(id)) {
        if (!nodeInfo.has(id)) {
          const target = levelFor(el(id).type);
          if (target) location.href = `${DATA.levels[target].file}?focus=${encodeURIComponent(id)}`;
          return;
        }
        state.cycle = null;
        state.cyclesOnly = false;
        $("#toggle-cycles-only").checked = false;
        if (state.scope && !belongsTo(id, state.scope)) state.scope = "";
        $("#filter").value = state.scope;
        state.selected = id;
        syncUrl();
        draw(false);
        renderCycleList();
      }
      select(id, { center: true });
    }

    function levelFor(type) {
      return {
        person: "context",
        external: "context",
        system: "context",
        container: "containers",
        component: "components",
        code: "code",
      }[type];
    }

    function drill(id) {
      const element = el(id);
      const next = DRILL[element.type];
      if (next && (element.children > 0 || element.type === "system")) location.href = next(id);
    }

    // --- zoom helpers

    function fit(duration) {
      const nodes = graph.nodes;
      if (!nodes.length) return;
      const box = svg.node().getBoundingClientRect();
      const x0 = d3.min(nodes, (d) => d.x - d.w / 2) - 60;
      const x1 = d3.max(nodes, (d) => d.x + d.w / 2) + 60;
      const y0 = d3.min(nodes, (d) => d.y - d.h / 2) - 60;
      const y1 = d3.max(nodes, (d) => d.y + d.h / 2) + 60;
      const k = Math.min(1.6, 0.94 * Math.min(box.width / (x1 - x0), box.height / (y1 - y0)));
      const transform = d3.zoomIdentity
        .translate(box.width / 2, box.height / 2)
        .scale(k)
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      (duration ? svg.transition().duration(duration) : svg).call(zoom.transform, transform);
    }

    function centerOn(id) {
      const d = graph.byId.get(id);
      if (!d) return;
      const box = svg.node().getBoundingClientRect();
      const k = Math.max(currentK, level === "code" ? 1.4 : 1);
      svg
        .transition()
        .duration(500)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .translate(box.width / 2, box.height / 2)
            .scale(k)
            .translate(-d.x, -d.y),
        );
    }

    function updateLabelVisibility(k) {
      currentK = k;
      const hide = level === "code" && graph.nodes.length > CODE_LABEL_LIMIT && k < LABEL_ZOOM;
      d3.select("#graph").classed("hide-code-labels", hide);
    }

    // --- tooltip

    const tooltip = $("#tooltip");

    function showTooltip(event, content) {
      tooltip.replaceChildren(content);
      tooltip.hidden = false;
      moveTooltip(event);
    }

    function moveTooltip(event) {
      const stage = tooltip.parentElement.getBoundingClientRect();
      const x = event.clientX - stage.left + 14;
      const y = event.clientY - stage.top + 14;
      const maxX = stage.width - tooltip.offsetWidth - 8;
      const maxY = stage.height - tooltip.offsetHeight - 8;
      tooltip.style.left = `${Math.min(x, maxX)}px`;
      tooltip.style.top = `${y > maxY ? y - tooltip.offsetHeight - 24 : y}px`;
    }

    function hideTooltip() {
      tooltip.hidden = true;
    }

    function nodeTooltip(d) {
      const e = d.element;
      const incoming = graph.edges.filter((x) => x.target.id === d.id).length;
      const outgoing = graph.edges.filter((x) => x.source.id === d.id).length;
      return h(
        "div",
        { style: `--c:${color(d.type)}` },
        h(
          "div",
          { class: "tt-type" },
          TYPE_LABEL[d.type],
          d.outside ? " · outside this scope" : "",
        ),
        h("strong", {}, e.name),
        e.technology ? h("div", { class: "tt-muted" }, `[${e.technology}]`) : null,
        e.description ? h("div", {}, truncate(e.description, 180)) : null,
        h("div", { class: "tt-muted" }, `${outgoing} out · ${incoming} in`),
        d.cycle ? h("div", { class: "tt-cycle" }, `In ${cycleName(d.cycle)}`) : null,
      );
    }

    function edgeTooltip(d) {
      return h(
        "div",
        {},
        h("strong", {}, `${d.source.element.name} → ${d.target.element.name}`),
        d.labels.length ? h("div", {}, d.labels.join("; ")) : null,
        d.technologies.length
          ? h("div", { class: "tt-muted" }, `[${d.technologies.join(", ")}]`)
          : null,
        d.count > 1
          ? h("div", { class: "tt-muted" }, `${d.count} relationships merged at this level`)
          : null,
        d.cycle ? h("div", { class: "tt-cycle" }, `Part of ${cycleName(d.cycle)}`) : null,
      );
    }

    const cycleName = (id) => {
      const c = cycleById.get(id);
      return c ? `cycle ${id.replace("cycle-", "#")} (${plural(c.nodes.length, "element")})` : id;
    };

    // --- panel

    function renderStats() {
      const core = view.nodes.filter((n) => n.core).length;
      const inCycle = view.nodes.filter((n) => n.cycle).length;
      const stats = $("#level-stats");
      stats.replaceChildren(
        h("div", {}, h("dt", {}, "elements"), h("dd", {}, core.toLocaleString())),
        h("div", {}, h("dt", {}, "dependencies"), h("dd", {}, view.edges.length.toLocaleString())),
      );
      if (level !== "context")
        stats.append(
          h(
            "div",
            { class: view.cycles.length ? "is-cycle" : "" },
            h("dt", {}, "cycles"),
            h("dd", {}, view.cycles.length),
          ),
          h(
            "div",
            { class: inCycle ? "is-cycle" : "" },
            h("dt", {}, "in a cycle"),
            h("dd", {}, inCycle),
          ),
        );
    }

    function renderLegend() {
      const types = [...new Set(view.nodes.map((n) => el(n.id).type))];
      const legend = $("#legend");
      for (const type of types)
        legend.append(
          h(
            "li",
            {},
            h("span", { class: "swatch", style: `--c:${color(type)}` }),
            TYPE_LABEL[type],
          ),
        );
      if (level !== "context")
        legend.append(
          h(
            "li",
            {},
            h("span", { class: "swatch line", style: "--c:var(--cycle)" }),
            "Cycle dependency",
          ),
        );
      legend.append(
        h("li", {}, h("span", { class: "swatch line", style: "--c:var(--edge)" }), "Dependency"),
      );
      if (level === "components" || level === "code")
        legend.append(h("li", {}, h("span", { class: "swatch dashed" }), "Outside scope"));
    }

    function renderFilter() {
      if (level !== "components" && level !== "code") return;
      const field = $("#filter-field");
      const select = $("#filter");
      field.hidden = false;
      $("#filter-label").textContent =
        level === "components" ? "Container" : "Container or component";
      const containers = Object.values(DATA.elements).filter((e) => e.type === "container");
      select.append(
        h("option", { value: "" }, level === "components" ? "All containers" : "Everything"),
      );
      for (const container of containers) {
        if (level === "components") {
          select.append(
            h("option", { value: container.id }, `${container.name} (${container.children})`),
          );
          continue;
        }
        const components = Object.values(DATA.elements).filter(
          (e) => e.type === "component" && e.parent === container.id,
        );
        const group = h("optgroup", { label: container.name });
        group.append(h("option", { value: container.id }, `All of ${container.name}`));
        for (const component of components)
          group.append(
            h("option", { value: component.id }, `${component.name} (${component.children})`),
          );
        select.append(group);
      }
      select.value = state.scope;
    }

    function renderCycleList() {
      const list = $("#cycles");
      const card = $("#cycles-card");
      if (level === "context") {
        card.hidden = true;
        return;
      }
      const count = $("#cycle-count");
      count.textContent = view.cycles.length;
      count.classList.toggle("zero", !view.cycles.length);
      $("#cycle-hint").textContent = view.cycles.length
        ? "Each entry is a set of elements that all reach one another. The path shows one loop through it; click to isolate the whole set."
        : "No element at this level depends, directly or indirectly, on itself.";
      list.replaceChildren();
      for (const cycle of view.cycles) {
        const names = cycle.path.map((id) => el(id).name);
        const path = [];
        names.forEach((name, i) => {
          if (i) path.push(h("span", { class: "arrow" }, " → "));
          path.push(name);
        });
        list.append(
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                "aria-pressed": String(state.cycle === cycle.id),
                onclick: () => setCycle(state.cycle === cycle.id ? null : cycle.id),
                onmouseenter: () => previewCycle(cycle),
                onmouseleave: () => previewCycle(null),
              },
              h(
                "span",
                { class: "cycle-meta" },
                h(
                  "span",
                  {},
                  `#${cycle.id.replace("cycle-", "")} · ${plural(cycle.nodes.length, "element")}`,
                ),
                h("span", {}, plural(cycle.edgeCount, "dependency", "dependencies")),
              ),
              h(
                "span",
                { class: "cycle-path" },
                path,
                cycle.nodes.length > cycle.path.length - 1
                  ? h(
                      "span",
                      { class: "more" },
                      ` · +${cycle.nodes.length - (cycle.path.length - 1)} more in the set`,
                    )
                  : null,
              ),
            ),
          ),
        );
      }
    }

    function previewCycle(cycle) {
      if (!cycle) return applyHighlight();
      const members = new Set(cycle.nodes);
      nodeLayer.selectAll("g.node").classed("dim", (d) => !members.has(d.id));
      edgeLayer
        .selectAll("g.edge-group")
        .select("path.edge")
        .classed("dim", (d) => d.cycle !== cycle.id);
    }

    function setCycle(id) {
      state.cycle = id;
      state.selected = null;
      syncUrl();
      draw(false);
      renderCycleList();
    }

    function renderBanner() {
      const banner = $("#banner");
      banner.replaceChildren();
      let text = null;
      let clear = null;
      if (state.cycle) {
        text = `Showing only ${cycleName(state.cycle)}`;
        clear = () => setCycle(null);
      } else if (state.cyclesOnly) {
        text = "Showing only elements in a cycle";
        clear = () => {
          state.cyclesOnly = false;
          $("#toggle-cycles-only").checked = false;
          syncUrl();
          draw(false);
        };
      } else if (state.scope) {
        const scope = el(state.scope);
        text = `Inside ${TYPE_LABEL[scope.type].toLowerCase()} ${scope.name}`;
        clear = () => {
          state.scope = "";
          $("#filter").value = "";
          syncUrl();
          draw(false);
        };
      }
      banner.hidden = !text;
      if (text)
        banner.append(
          h("span", {}, text),
          h("button", { type: "button", class: "button", onclick: clear }, "Show all"),
        );
    }

    function renderDetails() {
      const card = $("#details");
      const id = state.selected;
      if (!id || !el(id)) {
        card.hidden = true;
        return;
      }
      const e = el(id);
      const node = graph.byId.get(id);
      const outgoing = graph.edges.filter((x) => x.source.id === id);
      const incoming = graph.edges.filter((x) => x.target.id === id);
      const crumbs = ancestors(id);
      const cycle = nodeInfo.get(id)?.cycle;
      const drillTo = DRILL[e.type];
      const childNoun = {
        system: "containers",
        container: "components",
        component: "code elements",
      }[e.type];

      const linkList = (edges, pick) =>
        h(
          "ul",
          { class: "link-list" },
          edges.map((edge) => {
            const other = pick(edge);
            return h(
              "li",
              {},
              h(
                "button",
                { type: "button", onclick: () => reveal(other.id) },
                h("span", { class: "dot", style: `--c:${color(other.type)}` }),
                other.element.name,
                edge.cycle
                  ? h("span", { class: "cycle-mark", title: "Part of a cycle" }, "↻")
                  : null,
                h("span", { class: "sub" }, edge.labels[0] ?? ""),
              ),
            );
          }),
        );

      // h() drops the null sections; replaceChildren would print them as "null".
      card.replaceChildren(
        h(
          "div",
          {},
          h(
            "span",
            { class: "details-type", style: `--c:${color(e.type)}` },
            h("span", { class: "dot", style: `--c:${color(e.type)}` }),
            TYPE_LABEL[e.type],
            e.kind ? ` · ${e.kind}` : "",
          ),
          h("h2", { class: "details-name" }, e.name),
          e.technology ? h("div", { class: "details-tech" }, `[${e.technology}]`) : null,
          e.path ? h("code", { class: "details-path" }, e.path) : null,
          e.description ? h("p", { class: "details-desc" }, e.description) : null,
          crumbs.length
            ? h("p", { class: "details-crumbs" }, crumbs.map((c) => c.name).join(" › "))
            : null,
          h(
            "div",
            { class: "details-actions" },
            drillTo && (e.children > 0 || e.type === "system")
              ? h(
                  "a",
                  { class: "button primary", href: drillTo(id) },
                  `Open ${childNoun} (${e.children}) →`,
                )
              : null,
            cycle
              ? h(
                  "button",
                  { type: "button", class: "button danger", onclick: () => setCycle(cycle) },
                  `Isolate ${cycleName(cycle)}`,
                )
              : null,
            node
              ? h(
                  "button",
                  { type: "button", class: "button", onclick: () => centerOn(id) },
                  "Center",
                )
              : null,
          ),
          outgoing.length
            ? h(
                "div",
                { class: "details-section" },
                h("h3", {}, `Depends on (${outgoing.length})`),
                linkList(outgoing, (x) => x.target),
              )
            : null,
          incoming.length
            ? h(
                "div",
                { class: "details-section" },
                h("h3", {}, `Used by (${incoming.length})`),
                linkList(incoming, (x) => x.source),
              )
            : null,
        ),
      );
      card.hidden = false;
    }

    function renderResults() {
      const results = $("#search-results");
      const q = state.query.trim().toLowerCase();
      if (!q) {
        results.hidden = true;
        return;
      }
      const found = view.nodes
        .map((n) => el(n.id))
        .filter((e) => matchesQuery(e, q))
        .sort((a, b) => a.name.length - b.name.length)
        .slice(0, SEARCH_LIMIT);
      results.replaceChildren(
        ...(found.length
          ? found.map((e) =>
              h(
                "li",
                {},
                h(
                  "button",
                  {
                    type: "button",
                    onclick: () => {
                      reveal(e.id);
                    },
                  },
                  h("span", { class: "dot", style: `--c:${color(e.type)}` }),
                  e.name,
                  h("span", { class: "sub" }, e.path || e.technology || ""),
                ),
              ),
            )
          : [h("li", { class: "empty-result" }, "No match at this level.")]),
      );
      results.hidden = false;
    }

    function syncUrl() {
      const p = new URLSearchParams();
      if (state.scope)
        p.set(el(state.scope).type === "component" ? "component" : "container", state.scope);
      if (state.cycle) p.set("cycle", state.cycle);
      if (state.cyclesOnly) p.set("cyclesOnly", "1");
      const query = p.toString();
      history.replaceState(null, "", query ? `?${query}` : location.pathname);
    }

    function wireControls() {
      const search = $("#search");
      search.addEventListener("input", () => {
        state.query = search.value;
        renderResults();
        applyHighlight();
      });
      search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          const first = $("#search-results button");
          if (first) first.click();
        }
      });
      $("#filter").addEventListener("change", (event) => {
        state.scope = event.target.value;
        state.cycle = null;
        syncUrl();
        draw(false);
        renderCycleList();
      });
      $("#toggle-cycles").addEventListener("change", (event) => {
        state.showCycles = event.target.checked;
        applyHighlight();
      });
      $("#toggle-cycles-only").addEventListener("change", (event) => {
        state.cyclesOnly = event.target.checked;
        state.cycle = null;
        syncUrl();
        draw(false);
        renderCycleList();
      });
      $("#toggle-labels").addEventListener("change", (event) => {
        state.edgeLabels = event.target.checked;
        applyHighlight();
      });
      $("#zoom-in").addEventListener("click", () =>
        svg.transition().duration(250).call(zoom.scaleBy, 1.35),
      );
      $("#zoom-out").addEventListener("click", () =>
        svg
          .transition()
          .duration(250)
          .call(zoom.scaleBy, 1 / 1.35),
      );
      $("#fit").addEventListener("click", () => fit(450));
      $("#relayout").addEventListener("click", () => {
        for (const n of graph.nodes) {
          n.fx = null;
          n.fy = null;
        }
        sim.alpha(0.9).restart();
        setTimeout(() => fit(450), 900);
      });
      document.addEventListener("keydown", (event) => {
        const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "");
        if (event.key === "/" && !typing) {
          event.preventDefault();
          search.focus();
        } else if (event.key === "Escape") {
          if (typing) search.blur();
          search.value = "";
          state.query = "";
          renderResults();
          select(null);
        } else if ((event.key === "f" || event.key === "F") && !typing) fit(450);
      });
      addEventListener("resize", () => fit(0));
      if (state.selected) setTimeout(() => select(state.selected, { center: true }), 50);
    }

    draw(true);
    wireControls();
  }
})();
