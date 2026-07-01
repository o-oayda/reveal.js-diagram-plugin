(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RevealFlowchart = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var XHTML_NS = "http://www.w3.org/1999/xhtml";
  var DEFAULTS = {
    initialVisible: 1,
    nodeWidth: 360,
    nodeHeight: 70,
    gap: 34,
    marginX: 24,
    marginY: 18
  };

  var charts = [];
  var deck = null;
  var resizeHandler = null;
  var insertedImplicitFragments = false;
  var initialized = false;

  function plugin() {
    return {
      id: "reveal-flowchart",
      init: function (reveal) {
        deck = reveal;
        setup();
      }
    };
  }

  function setup() {
    if (initialized) {
      renderAll();
      return;
    }
    initialized = true;

    charts = Array.prototype.map.call(
      document.querySelectorAll(".reveal-flowchart"),
      initialiseChart
    ).filter(Boolean);

    if (insertedImplicitFragments && deck && typeof deck.sync === "function") {
      window.requestAnimationFrame(function () {
        deck.sync();
        updateAll();
      });
    }

    updateAll();

    if (deck && typeof deck.on === "function") {
      deck.on("ready", updateAll);
      deck.on("slidechanged", renderAll);
      deck.on("fragmentshown", updateAll);
      deck.on("fragmenthidden", updateAll);
      deck.on("resize", renderAll);
    }

    resizeHandler = debounce(renderAll, 120);
    window.addEventListener("resize", resizeHandler);
  }

  function initialiseChart(el, index) {
    var definition = parseDefinition(el);
    if (!definition || !Array.isArray(definition.steps) || definition.steps.length === 0) {
      el.classList.add("reveal-flowchart-error");
      return null;
    }

    var id = el.getAttribute("data-flowchart-id") || definition.id || "flowchart-" + index;
    var chart = {
      el: el,
      id: id,
      definition: normaliseDefinition(definition),
      fragments: [],
      implicit: el.getAttribute("data-flowchart-fragments") === "true",
      initialVisible: getInitialVisible(el),
      arrowheads: el.getAttribute("data-flowchart-arrowheads") !== "false",
      interruptMode: el.getAttribute("data-flowchart-interrupt") || "restart",
      svg: null
    };

    el.setAttribute("data-flowchart-id", id);
    el.innerHTML = "";
    renderChart(chart);
    setupFragments(chart);
    return chart;
  }

  function parseDefinition(el) {
    var script = el.querySelector('script[type="application/json"]');
    if (!script) return null;

    try {
      return JSON.parse(script.textContent);
    } catch (error) {
      if (window.console) {
        console.error("RevealFlowchart: invalid JSON", error);
      }
      return null;
    }
  }

  function normaliseDefinition(definition) {
    var steps = (definition.steps || []).map(function (step, index) {
      return {
        id: String(step.id || "step-" + index),
        label: step.label == null ? "" : String(step.label),
        after: step.after || null,
        index: index
      };
    });

    return {
      direction: definition.direction || "vertical",
      steps: steps,
      nodes: definition.nodes || null,
      links: definition.links || null,
      levelGap: definition.levelGap || null
    };
  }

  function getInitialVisible(el) {
    if (el.hasAttribute("data-flowchart-initial-visible")) {
      return Math.max(0, Number(el.getAttribute("data-flowchart-initial-visible")) || 0);
    }
    return DEFAULTS.initialVisible;
  }

  function setupFragments(chart) {
    var slide = closest(chart.el, "section") || chart.el.parentNode;
    var selector = '.fragment[data-flowchart-show^="' + attrSelectorValue(chart.id + ":") + '"]';
    chart.fragments = Array.prototype.slice.call(document.querySelectorAll(selector));

    if (chart.implicit && slide) {
      insertedImplicitFragments = true;
      chart.fragments = chart.definition.steps.slice(chart.initialVisible).map(function (step) {
        var fragment = document.createElement("span");
        fragment.className = "fragment reveal-flowchart-fragment";
        fragment.setAttribute("data-flowchart-show", chart.id + ":" + step.id);
        fragment.setAttribute("data-fragment-index", step.index);
        fragment.setAttribute("aria-hidden", "true");
        slide.appendChild(fragment);
        return fragment;
      });
    }
  }

  function renderAll() {
    charts.forEach(renderChart);
    updateAll();
  }

  function renderChart(chart) {
    if (chart.definition.nodes) {
      renderGraphChart(chart);
      return;
    }

    var size = measure(chart);
    var steps = chart.definition.steps;
    var width = size.width;
    var horizontal = chart.definition.direction === "horizontal";
    var chartWidth = horizontal
      ? steps.length * size.nodeWidth + Math.max(0, steps.length - 1) * size.gap
      : size.nodeWidth;
    var chartHeight = horizontal
      ? size.nodeHeight
      : steps.length * size.nodeHeight + Math.max(0, steps.length - 1) * size.gap;
    width = horizontal ? Math.max(width, chartWidth + DEFAULTS.marginX * 2) : width;
    var height = chartHeight + size.marginY * 2;
    var x0 = horizontal
      ? (width - chartWidth) / 2 + size.nodeWidth / 2
      : width / 2;
    var y0 = horizontal
      ? size.marginY + size.nodeHeight / 2
      : size.marginY + size.nodeHeight / 2;

    var svg = svgEl("svg", {
      class: "reveal-flowchart-svg",
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-label": chart.el.getAttribute("aria-label") || "Flowchart"
    });

    steps.forEach(function (step, index) {
      if (index > 0) {
        var previousPosition = positionFor(index - 1, x0, y0, size, horizontal);
        var currentPosition = positionFor(index, x0, y0, size, horizontal);
        var edgeStartX = horizontal ? previousPosition.x + size.nodeWidth / 2 : previousPosition.x;
        var edgeStartY = horizontal ? previousPosition.y : previousPosition.y + size.nodeHeight / 2;
        var borderInset = 2;
        var edgeEndX = horizontal ? currentPosition.x - size.nodeWidth / 2 - borderInset : currentPosition.x;
        var edgeEndY = horizontal ? currentPosition.y : currentPosition.y - size.nodeHeight / 2 - borderInset;
        var edge = svgEl("g", {
          class: "flowchart-edge",
          "data-flowchart-target": step.id
        });
        edge.appendChild(svgEl("path", {
          class: "flowchart-edge-path",
          d: "M " + edgeStartX + " " + edgeStartY + " L " + edgeEndX + " " + edgeEndY,
          pathLength: "1"
        }));
        if (chart.arrowheads) {
          edge.appendChild(arrowhead(edgeStartX, edgeStartY, edgeEndX, edgeEndY, horizontal));
        }
        svg.appendChild(edge);
      }
    });

    steps.forEach(function (step, index) {
      var position = positionFor(index, x0, y0, size, horizontal);
      var enterOffset = index === 0 ? 0 : -(size.nodeHeight + size.gap);
      var enterX = horizontal && index > 0 ? -(size.nodeWidth + size.gap) : 0;
      var enterY = horizontal ? 0 : enterOffset;
      var node = svgEl("g", {
        class: "flowchart-node",
        "data-flowchart-step": step.id,
        transform: "translate(" + position.x + " " + position.y + ")",
        style: "--flowchart-enter-x: " + enterX + "px; --flowchart-enter-y: " + enterY + "px"
      });
      var body = svgEl("g", {
        class: "flowchart-node-body"
      });

      body.appendChild(svgEl("rect", {
        class: "flowchart-node-box",
        x: -size.nodeWidth / 2,
        y: -size.nodeHeight / 2,
        width: size.nodeWidth,
        height: size.nodeHeight,
        rx: "12",
        ry: "12"
      }));

      var foreignObject = svgEl("foreignObject", {
        class: "flowchart-node-label",
        x: -size.nodeWidth / 2,
        y: -size.nodeHeight / 2,
        width: size.nodeWidth,
        height: size.nodeHeight
      });
      var label = document.createElementNS(XHTML_NS, "div");
      label.className = "flowchart-node-label-content";
      label.appendChild(labelInner(step.label));
      foreignObject.appendChild(label);
      body.appendChild(foreignObject);
      node.appendChild(body);
      svg.appendChild(node);
    });

    chart.el.replaceChildren(svg);
    chart.svg = svg;
    typesetMath(chart.el);
  }

  function renderGraphChart(chart) {
    var size = measure(chart);
    var graph = graphLayout(chart.definition, size, Number.POSITIVE_INFINITY);
    var svg = svgEl("svg", {
      class: "reveal-flowchart-svg",
      viewBox: "0 0 " + graph.width + " " + graph.height,
      role: "img",
      "aria-label": chart.el.getAttribute("aria-label") || "Flowchart"
    });

    graph.edges.forEach(function (edge) {
      var edgeEl = svgEl("g", {
        class: "flowchart-edge",
        "data-flowchart-edge": edge.id,
        "data-flowchart-show-at": edge.showAt
      });
      edgeEl.appendChild(svgEl("path", {
        class: "flowchart-edge-path",
        d: collapsedPath(edge.source, size),
        pathLength: "1"
      }));
      if (chart.arrowheads && edge.arrowhead !== false) {
        edgeEl.appendChild(arrowhead(edge.source.x + size.nodeWidth / 2, edge.source.y, edge.target.x - size.nodeWidth / 2 - 2, edge.target.y, true));
      }
      svg.appendChild(edgeEl);
    });

    graph.nodes.forEach(function (node) {
      var source = node.parent ? graph.nodeById[node.parent] : node;
      var nodeEl = svgEl("g", {
        class: "flowchart-node flowchart-graph-node",
        "data-flowchart-step": node.id,
        "data-flowchart-show-at": node.showAt,
        style: "transform: translate(" + source.x + "px, " + source.y + "px); --flowchart-enter-x: 0px; --flowchart-enter-y: 0px"
      });
      var body = svgEl("g", { class: "flowchart-node-body" });
      body.appendChild(svgEl("rect", {
        class: "flowchart-node-box",
        x: -size.nodeWidth / 2,
        y: -size.nodeHeight / 2,
        width: size.nodeWidth,
        height: size.nodeHeight,
        rx: "12",
        ry: "12"
      }));

      var foreignObject = svgEl("foreignObject", {
        class: "flowchart-node-label",
        x: -size.nodeWidth / 2,
        y: -size.nodeHeight / 2,
        width: size.nodeWidth,
        height: size.nodeHeight
      });
      var label = document.createElementNS(XHTML_NS, "div");
      label.className = "flowchart-node-label-content";
      label.appendChild(labelInner(node.label));
      foreignObject.appendChild(label);
      body.appendChild(foreignObject);
      nodeEl.appendChild(body);
      svg.appendChild(nodeEl);
    });

    chart.el.replaceChildren(svg);
    chart.svg = svg;
    chart.graphSize = size;
    chart.graphFull = graph;
    typesetMath(chart.el);
  }

  function measure(chart) {
    var available = Math.max(320, chart.el.clientWidth || chart.el.parentElement.clientWidth || 760);
    var requestedNodeWidth = Number(chart.el.getAttribute("data-flowchart-node-width")) || DEFAULTS.nodeWidth;
    var nodeWidth = Math.min(requestedNodeWidth, available - DEFAULTS.marginX * 2);
    return {
      width: Math.max(nodeWidth + DEFAULTS.marginX * 2, available),
      nodeWidth: nodeWidth,
      nodeHeight: Number(chart.el.getAttribute("data-flowchart-node-height")) || DEFAULTS.nodeHeight,
      gap: Number(chart.el.getAttribute("data-flowchart-gap")) || DEFAULTS.gap,
      marginY: DEFAULTS.marginY
    };
  }

  function graphLayout(definition, size, activeCount) {
    var nodeById = {};
    var childrenById = {};
    var includeAll = activeCount === undefined || activeCount === Number.POSITIVE_INFINITY;
    var nodes = definition.nodes.map(function (node, index) {
      var item = {
        id: String(node.id || "node-" + index),
        label: node.label == null ? node.id : String(node.label),
        parent: node.parent || null,
        showAt: Number(node.showAt || 0),
        depth: 0,
        x: 0,
        y: 0
      };
      if (!includeAll && item.showAt >= activeCount) return null;
      nodeById[item.id] = item;
      childrenById[item.id] = [];
      return item;
    }).filter(Boolean);

    nodes.forEach(function (node) {
      if (node.parent && childrenById[node.parent]) {
        childrenById[node.parent].push(node);
      }
    });

    var roots = nodes.filter(function (node) { return !node.parent || !nodeById[node.parent]; });
    var leafIndex = 0;
    roots.forEach(function (root) {
      assignTreePositions(root, 0, childrenById, size, leafIndexRef);
    });

    function leafIndexRef(next) {
      if (typeof next === "number") leafIndex = next;
      return leafIndex;
    }

    var maxDepth = 0;
    var maxY = 0;
    nodes.forEach(function (node) {
      maxDepth = Math.max(maxDepth, node.depth);
      maxY = Math.max(maxY, node.y);
    });

    var levelGap = Number(definition.levelGap || size.gap || 130);
    var width = Math.max(size.width, DEFAULTS.marginX * 2 + size.nodeWidth + maxDepth * (size.nodeWidth + levelGap));
    var height = Math.max(size.nodeHeight + size.marginY * 2, maxY + size.nodeHeight + size.marginY * 2);
    var xOffset = (width - (size.nodeWidth + maxDepth * (size.nodeWidth + levelGap))) / 2 + size.nodeWidth / 2;
    var yOffset = size.marginY + size.nodeHeight / 2;

    nodes.forEach(function (node) {
      node.x = xOffset + node.depth * (size.nodeWidth + levelGap);
      node.y += yOffset;
    });

    var edges = [];
    var edgeById = {};
    nodes.forEach(function (node) {
      if (node.parent && nodeById[node.parent]) {
        var edge = {
          id: node.parent + "--" + node.id,
          source: nodeById[node.parent],
          target: node,
          showAt: node.showAt,
          arrowhead: false
        };
        edges.push(edge);
        edgeById[edge.id] = edge;
      }
    });
    (definition.links || []).forEach(function (link, index) {
      if (!includeAll && Number(link.showAt || 0) >= activeCount) return;
      if (!nodeById[link.source] || !nodeById[link.target]) return;
      var edge = {
        id: "link-" + index + "-" + link.source + "--" + link.target,
        source: nodeById[link.source],
        target: nodeById[link.target],
        showAt: Number(link.showAt || 0),
        arrowhead: link.arrowhead
      };
      edges.push(edge);
      edgeById[edge.id] = edge;
    });

    return {
      nodes: nodes,
      edges: edges,
      edgeById: edgeById,
      nodeById: nodeById,
      width: width,
      height: height
    };
  }

  function assignTreePositions(node, depth, childrenById, size, leafIndexRef) {
    var children = childrenById[node.id] || [];
    node.depth = depth;
    if (children.length === 0) {
      node.y = leafIndexRef() * (size.nodeHeight + size.gap);
      leafIndexRef(leafIndexRef() + 1);
      return node.y;
    }

    var first = null;
    var last = null;
    children.forEach(function (child) {
      var childY = assignTreePositions(child, depth + 1, childrenById, size, leafIndexRef);
      if (first === null) first = childY;
      last = childY;
    });
    node.y = (first + last) / 2;
    return node.y;
  }

  function curvedPath(source, target, size) {
    return pathFromPoints(graphPathPoints(source, target, size));
  }

  function collapsedPath(source, size) {
    return pathFromPoints(collapsedGraphPathPoints(source, size));
  }

  function graphPathPoints(source, target, size) {
    var startX = source.x + size.nodeWidth / 2;
    var startY = source.y;
    var endX = target.x - size.nodeWidth / 2 - 2;
    var endY = target.y;
    var midX = startX + (endX - startX) / 2;
    return {
      startX: startX,
      startY: startY,
      midX: midX,
      endX: endX,
      endY: endY
    };
  }

  function pathFromPoints(points) {
    return "M " + points.startX + " " + points.startY +
      " C " + points.midX + " " + points.startY +
      " " + points.midX + " " + points.endY +
      " " + points.endX + " " + points.endY;
  }

  function collapsedGraphPathPoints(source, size) {
    var startX = source.x + size.nodeWidth / 2;
    var startY = source.y;
    return {
      startX: startX,
      startY: startY,
      midX: startX,
      endX: startX,
      endY: startY
    };
  }

  function animateGraphEdge(el, edge, size, duration, interruptMode) {
    var target = graphPathPoints(edge.source, edge.target, size);
    var previous = el._flowchartPathPoints || collapsedGraphPathPoints(edge.source, size);
    var path = el.querySelector(".flowchart-edge-path");
    var arrow = el.querySelector(".flowchart-edge-arrowhead");
    var start = window.performance.now();

    if (el._flowchartAnimation) {
      window.cancelAnimationFrame(el._flowchartAnimation);
      if (interruptMode === "snap") {
        setGraphEdgePath(el, target);
        if (arrow) {
          arrow.setAttribute("d", arrowheadPath(target.endX, target.endY, true));
        }
        return;
      }
    }

    function frame(now) {
      var progress = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      var eased = flowchartEase(progress);
      var current = interpolatePoints(previous, target, eased);
      path.setAttribute("d", pathFromPoints(current));
      if (arrow) {
        arrow.setAttribute("d", arrowheadPath(current.endX, current.endY, true));
      }
      if (progress < 1) {
        el._flowchartAnimation = window.requestAnimationFrame(frame);
      } else {
        el._flowchartPathPoints = target;
        el._flowchartAnimation = null;
      }
    }

    el._flowchartAnimation = window.requestAnimationFrame(frame);
  }

  function setGraphEdgePath(el, points) {
    if (el._flowchartAnimation) {
      window.cancelAnimationFrame(el._flowchartAnimation);
      el._flowchartAnimation = null;
    }
    var path = el.querySelector(".flowchart-edge-path");
    if (path) path.setAttribute("d", pathFromPoints(points));
    el._flowchartPathPoints = points;
  }

  function interpolatePoints(from, to, progress) {
    return {
      startX: interpolate(from.startX, to.startX, progress),
      startY: interpolate(from.startY, to.startY, progress),
      midX: interpolate(from.midX, to.midX, progress),
      endX: interpolate(from.endX, to.endX, progress),
      endY: interpolate(from.endY, to.endY, progress)
    };
  }

  function interpolate(from, to, progress) {
    return from + (to - from) * progress;
  }

  function flowchartEase(progress) {
    return cubicBezier(0.25, 0.85, 0.35, 1, progress);
  }

  function cubicBezier(x1, y1, x2, y2, x) {
    var lower = 0;
    var upper = 1;
    var t = x;
    var i;

    for (i = 0; i < 12; i += 1) {
      t = (lower + upper) / 2;
      if (bezierCoordinate(t, x1, x2) < x) {
        lower = t;
      } else {
        upper = t;
      }
    }

    return bezierCoordinate(t, y1, y2);
  }

  function bezierCoordinate(t, p1, p2) {
    var inverse = 1 - t;
    return 3 * inverse * inverse * t * p1 +
      3 * inverse * t * t * p2 +
      t * t * t;
  }

  function transitionDuration(el) {
    var value = window.getComputedStyle(el).getPropertyValue("--flowchart-transition");
    var match = value.match(/([\d.]+)\s*(ms|s)/);
    if (!match) return 520;
    return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  }

  function arrowheadPath(endX, endY, horizontal) {
    if (horizontal) {
      return "M " + (endX - 8) + " " + (endY - 6) +
        " L " + endX + " " + endY +
        " L " + (endX - 8) + " " + (endY + 6);
    }

    return "M " + (endX - 6) + " " + (endY - 8) +
      " L " + endX + " " + endY +
      " L " + (endX + 6) + " " + (endY - 8);
  }

  function positionFor(index, x0, y0, size, horizontal) {
    return {
      x: horizontal ? x0 + index * (size.nodeWidth + size.gap) : x0,
      y: horizontal ? y0 : y0 + index * (size.nodeHeight + size.gap)
    };
  }

  function arrowhead(startX, startY, endX, endY, horizontal) {
    if (horizontal) {
      return svgEl("path", {
        class: "flowchart-edge-arrowhead",
        d: "M " + (endX - 8) + " " + (endY - 6) +
          " L " + endX + " " + endY +
          " L " + (endX - 8) + " " + (endY + 6),
        style: "--flowchart-arrow-enter-x: " + -(endX - startX) + "px; --flowchart-arrow-enter-y: 0px"
      });
    }

    return svgEl("path", {
      class: "flowchart-edge-arrowhead",
      d: "M " + (endX - 6) + " " + (endY - 8) +
        " L " + endX + " " + endY +
        " L " + (endX + 6) + " " + (endY - 8),
      style: "--flowchart-arrow-enter-x: 0px; --flowchart-arrow-enter-y: " + -(endY - startY) + "px"
    });
  }

  function updateAll() {
    charts.forEach(updateChart);
  }

  function updateChart(chart) {
    if (!chart.svg) return;

    var activeCount = activeStepCount(chart);
    if (chart.definition.nodes) {
      updateGraphChart(chart, activeCount);
      return;
    }

    chart.definition.steps.forEach(function (step, index) {
      var visible = index < activeCount;
      setVisible(chart.svg.querySelector('[data-flowchart-step="' + attrSelectorValue(step.id) + '"]'), visible);
      setVisible(chart.svg.querySelector('[data-flowchart-target="' + attrSelectorValue(step.id) + '"]'), visible);
    });
  }

  function updateGraphChart(chart, activeCount) {
    var size = chart.graphSize || measure(chart);
    var graph = graphLayout(chart.definition, size, activeCount);
    var full = chart.graphFull || graphLayout(chart.definition, size, Number.POSITIVE_INFINITY);

    Array.prototype.forEach.call(chart.svg.querySelectorAll(".flowchart-graph-node"), function (el) {
      var nodeId = el.getAttribute("data-flowchart-step");
      var fullNode = full.nodeById[nodeId];
      var node = graph.nodeById[nodeId];
      var visible = Boolean(node);
      var parent = node && node.parent ? graph.nodeById[node.parent] : node;
      var fallback = fullNode && fullNode.parent ? graph.nodeById[fullNode.parent] || full.nodeById[fullNode.parent] : fullNode;
      var position = node || fallback || fullNode;
      var source = parent || fallback || position;

      if (!position || !source) return;

      el.style.transform = "translate(" + position.x + "px, " + position.y + "px)";
      el.style.setProperty("--flowchart-enter-x", "0px");
      el.style.setProperty("--flowchart-enter-y", "0px");
      setVisible(el, visible);
    });

    Array.prototype.forEach.call(chart.svg.querySelectorAll("[data-flowchart-edge]"), function (el) {
      var edgeId = el.getAttribute("data-flowchart-edge");
      var edge = graph.edgeById[edgeId];
      var fullEdge = full.edgeById[edgeId];
      var visible = Boolean(edge);
      if (visible) {
        animateGraphEdge(el, edge, size, transitionDuration(chart.el), chart.interruptMode);
      } else if (fullEdge) {
        var source = graph.nodeById[fullEdge.source.id] || fullEdge.source;
        setGraphEdgePath(el, collapsedGraphPathPoints(source, size));
      }
      setVisible(el, visible);
    });
  }

  function activeStepCount(chart) {
    if (chart.definition.steps.length === 0) {
      return 1;
    }

    var visibleStepIndexes = chart.fragments.map(function (fragment) {
      if (!fragment.classList.contains("visible")) return -1;
      var value = fragment.getAttribute("data-flowchart-show") || "";
      var stepId = value.slice(chart.id.length + 1);
      return findStepIndex(chart.definition.steps, stepId);
    }).filter(function (index) {
      return index >= 0;
    });

    if (visibleStepIndexes.length === 0) {
      return Math.min(chart.initialVisible, chart.definition.steps.length);
    }

    return Math.min(Math.max.apply(Math, visibleStepIndexes) + 1, chart.definition.steps.length);
  }

  function findStepIndex(steps, id) {
    for (var index = 0; index < steps.length; index += 1) {
      if (steps[index].id === id) return index;
    }
    return -1;
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("is-visible", visible);
  }

  function syncPrintPages() {
    Array.prototype.forEach.call(document.querySelectorAll(".pdf-page .reveal-flowchart"), syncPrintChart);
  }

  function syncPrintChart(el) {
    var id = el.getAttribute("data-flowchart-id");
    if (!id) return;

    var definition = printDefinition(el);
    if (!definition || !Array.isArray(definition.steps) || definition.steps.length === 0) return;

    var steps = normaliseDefinition(definition).steps;
    var initialVisible = getInitialVisible(el);
    var activeCount = printActiveStepCount(el, id, steps, initialVisible);

    steps.forEach(function (step, index) {
      var visible = index < activeCount;
      setVisible(el.querySelector('[data-flowchart-step="' + attrSelectorValue(step.id) + '"]'), visible);
      setVisible(el.querySelector('[data-flowchart-target="' + attrSelectorValue(step.id) + '"]'), visible);
    });
  }

  function printDefinition(el) {
    var script = el.querySelector('script[type="application/json"]');
    if (script) return parseDefinition(el);

    var chart = charts.find(function (candidate) {
      return candidate.id === el.getAttribute("data-flowchart-id");
    });
    return chart ? chart.definition : null;
  }

  function printActiveStepCount(el, id, steps, initialVisible) {
    var selector = '.fragment.visible[data-flowchart-show^="' + attrSelectorValue(id + ":") + '"]';
    var visibleStepIndexes = Array.prototype.map.call(el.closest("section").querySelectorAll(selector), function (fragment) {
      var value = fragment.getAttribute("data-flowchart-show") || "";
      var stepId = value.slice(id.length + 1);
      return findStepIndex(steps, stepId);
    }).filter(function (index) {
      return index >= 0;
    });

    if (visibleStepIndexes.length === 0) {
      return Math.min(initialVisible, steps.length);
    }

    return Math.min(Math.max.apply(Math, visibleStepIndexes) + 1, steps.length);
  }

  function typesetMath(el) {
    if (!window.MathJax) return;

    if (typeof window.MathJax.typesetPromise === "function") {
      window.MathJax.typesetPromise([el]).catch(function (error) {
        if (window.console) console.warn("RevealFlowchart: MathJax typeset failed", error);
      });
      return;
    }

    if (window.MathJax.Hub && typeof window.MathJax.Hub.Queue === "function") {
      window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, el]);
    }
  }

  function labelInner(html) {
    var inner = document.createElementNS(XHTML_NS, "div");
    inner.className = "flowchart-node-label-inner";
    inner.innerHTML = sanitiseLabel(html);
    return inner;
  }

  function sanitiseLabel(html) {
    var template = document.createElement("template");
    template.innerHTML = html;
    var allowed = ["BR", "EM", "STRONG", "SPAN", "SUB", "SUP", "SMALL", "B", "I"];
    Array.prototype.slice.call(template.content.querySelectorAll("*")).forEach(function (node) {
      if (allowed.indexOf(node.nodeName) === -1) {
        node.replaceWith(document.createTextNode(node.textContent || ""));
        return;
      }

      Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        if (attr.name !== "class") node.removeAttribute(attr.name);
      });
    });
    return template.innerHTML;
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function closest(el, selector) {
    while (el && el.nodeType === 1) {
      if (el.matches(selector)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function attrSelectorValue(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function debounce(fn, delay) {
    var timeout = null;
    return function () {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(fn, delay);
    };
  }

  var api = plugin();
  api.renderAll = renderAll;
  api.update = updateAll;
  api.syncPrintPages = syncPrintPages;
  api.destroy = function () {
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  };

  registerWithReveal(api);

  function registerWithReveal(api) {
    var root = typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : null;
    if (!root) return;

    if (root.Reveal && typeof root.Reveal.registerPlugin === "function") {
      root.Reveal.registerPlugin(api);
      return;
    }

    var descriptor = Object.getOwnPropertyDescriptor(root, "Reveal");
    if (descriptor && descriptor.configurable === false) return;

    var pendingReveal = descriptor && "value" in descriptor ? descriptor.value : undefined;
    try {
      Object.defineProperty(root, "Reveal", {
        configurable: true,
        enumerable: true,
        get: function () {
          return pendingReveal;
        },
        set: function (value) {
          pendingReveal = value;
          Object.defineProperty(root, "Reveal", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: value
          });
          if (value && typeof value.registerPlugin === "function") {
            value.registerPlugin(api);
          }
        }
      });
    } catch (error) {
      if (window.console) {
        console.warn("RevealFlowchart: automatic plugin registration failed", error);
      }
    }
  }

  return api;
});
