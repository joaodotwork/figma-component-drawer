# Component Drawer — Figma Plugin POC

A proof-of-concept Figma plugin that draws components from JSON specs and binds design token variables to node properties. Companion to [dtcg-to-figma](https://github.com/joaodotwork/dtcg-to-figma).

## What It Proves

This POC validates the **full bidirectional loop** between code and Figma:

```
JSON spec → Plugin draws component → Designer tweaks in Figma → Export back to JSON
     ↕                                                                    ↕
dtcg-to-figma tokens ←───── Variables bound to properties ─────→ Token sync
```

### Capabilities Demonstrated

| Capability | Status |
|---|---|
| Create components from JSON | Yes |
| Auto-layout (horizontal/vertical) | Yes |
| Padding, gap, corner radius | Yes |
| Fills, strokes, effects (shadow, blur) | Yes |
| Text nodes (font, size, weight, color) | Yes |
| Nested children (recursive) | Yes |
| Bind variables to properties | Yes |
| Export node back to JSON spec | Yes |

## Setup

1. In Figma desktop: **Plugins > Development > Import plugin from manifest...**
2. Select the `manifest.json` from this folder
3. The plugin appears under **Plugins > Development > Component Drawer**

> **Note:** The `id` in manifest.json is a placeholder (`0000000000000000000`). For real development, create a plugin via Figma's developer dashboard to get a proper ID.

## Usage

### Draw Tab

Paste a JSON component spec and click **Draw Component**. Three built-in examples are included:

- **Button** — auto-layout, padding, fill, text child, variable bindings
- **Card** — nested layout, shadow effect, multiple children
- **Input** — label + field + hint pattern, strokes, placeholder text

### Export Tab

Select any component or frame in Figma, click **Export Selected** to get its JSON spec back.

### Variable Binding

The `variables` key in a spec maps property names to Figma variable paths:

```json
{
  "variables": {
    "fills": "interactive/default",
    "paddingTop": "space/3",
    "cornerRadius": "space/2",
    "fontSize": "text/base"
  }
}
```

Variables must already exist in the file. Import them first using:
- Drag-and-drop DTCG JSON (converted via `dtcg-to-figma`)
- The Figma Variables REST API (`POST /v1/files/:file_key/variables`)

## Spec Format

```json
{
  "type": "component | frame | rectangle | ellipse | text",
  "name": "Button",

  "layout": "horizontal | vertical",
  "primaryAxisAlign": "MIN | CENTER | MAX | SPACE_BETWEEN",
  "counterAxisAlign": "MIN | CENTER | MAX | BASELINE",
  "primaryAxisSizing": "AUTO | FIXED",
  "counterAxisSizing": "AUTO | FIXED",

  "width": 200,
  "height": 48,
  "padding": { "top": 12, "right": 24, "bottom": 12, "left": 24 },
  "gap": 8,
  "cornerRadius": 8,

  "fills": [{ "type": "solid", "color": "#1580b0", "opacity": 1 }],
  "strokes": [{ "type": "solid", "color": "#80d4f2" }],
  "strokeWeight": 1,
  "effects": [{ "type": "dropShadow", "color": "#000000", "opacity": 0.08, "x": 0, "y": 4, "blur": 16, "spread": 0 }],
  "opacity": 1,

  "children": [ ... ],

  "variables": {
    "fills": "collection/variable-path",
    "paddingTop": "space/3"
  }
}
```

### Text Nodes

```json
{
  "type": "text",
  "characters": "Hello",
  "fontSize": 16,
  "fontFamily": "Inter",
  "fontStyle": "Medium",
  "fontWeight": 500,
  "lineHeight": 1.5,
  "letterSpacing": -0.02,
  "textAlign": "left | center | right | justify",
  "fills": [{ "type": "solid", "color": "#051828" }]
}
```

## Limitations (POC Scope)

- No gradient fills (only solid)
- No image fills
- No boolean operations or vector paths
- No component variants/sets (single component only)
- No instance creation from existing components
- Font loading limited to Inter (other fonts may need to be loaded in the file first)
- Variable binding requires variables to already exist in the file

## Architecture

```
manifest.json  — Plugin manifest (points to code.js + ui.html)
code.js        — Runs in Figma's sandbox: draws nodes, binds variables, exports
ui.html        — Plugin UI: JSON editor, examples, draw/export buttons
```

No build step. No dependencies. Pure vanilla JS + HTML.

## License

MIT
