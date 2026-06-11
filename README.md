# reveal.js flowchart plugin

A small modern Reveal.js plugin for declarative SVG flowcharts. It replaces the
old iframe/D3 v3 diagram approach with inline JSON, local assets, and Reveal
fragment events.

## Files

- `revealjs-diagram.js`: the Reveal plugin. It exposes `window.RevealFlowchart`.
- `revealjs-diagram.css`: default flowchart styling.
- `demo/flowchart-modern.html`: minimal modern Reveal usage example.

No runtime dependency on D3, jQuery, CDNs, or generated SVG files is required.

## Reveal Usage

Load the CSS and JS, then register the plugin when Reveal initializes:

```html
<link rel="stylesheet" href="plugins/reveal-flowchart/revealjs-diagram.css">
<script src="plugins/reveal-flowchart/revealjs-diagram.js"></script>
<script>
  Reveal.initialize({
    plugins: [RevealFlowchart]
  });
</script>
```

Add a chart to a slide with inline JSON:

```html
<div class="reveal-flowchart"
     data-flowchart-id="simulations"
     data-flowchart-fragments="true">
  <script type="application/json">
  {
    "direction": "vertical",
    "steps": [
      {
        "id": "sources",
        "label": "Draw sources on isotropic sky<br>sample magnitudes"
      },
      {
        "id": "relativity",
        "label": "Do special relativity",
        "after": "sources"
      },
      {
        "id": "errors",
        "label": "Add photometric <span class='accent'>errors</span><br><em>m′ν → m′ν + <span class='accent'>Δm′ν</span></em>",
        "after": "relativity"
      },
      {
        "id": "cuts",
        "label": "Make magnitude cuts & mask",
        "after": "errors"
      },
      {
        "id": "output",
        "label": "<strong>Output:</strong> CatSIM density map",
        "after": "cuts"
      }
    ]
  }
  </script>
</div>
```

With `data-flowchart-fragments="true"`, the first node is visible initially and
the plugin creates hidden Reveal fragments for the remaining steps. Override the
initial count with `data-flowchart-initial-visible="0"` if the chart should start
empty.

Explicit fragment control is also supported:

```html
<span class="fragment" data-flowchart-show="simulations:sources"></span>
<span class="fragment" data-flowchart-show="simulations:relativity"></span>
<span class="fragment" data-flowchart-show="simulations:errors"></span>
```

When an explicit fragment is visible, the plugin shows every step up to that
step. Navigating backward hides later nodes and edges again.

## Quarto Usage

Vendor both files into the deck, for example:

```text
plugins/reveal-flowchart/revealjs-diagram.js
plugins/reveal-flowchart/revealjs-diagram.css
```

Then include them in the Quarto revealjs format with the deck's normal
`include-in-header`/`include-after-body` mechanism, and pass
`RevealFlowchart` in the Reveal `plugins` list.

## Development

There is no build step yet.

```bash
npm test
```

The current test is a syntax check for the plugin source.
