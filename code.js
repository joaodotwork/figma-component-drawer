/**
 * Component Drawer — Figma Plugin POC
 *
 * Creates Figma components from a JSON spec and binds
 * design token variables to node properties.
 *
 * Workflow:
 *   1. Import tokens via dtcg-to-figma (drag-drop or REST API)
 *   2. Run this plugin with a component spec JSON
 *   3. Plugin draws the component and binds variables
 *
 * Variable binding requires variables to already exist in the file
 * (imported via DTCG JSON or created via Variables REST API).
 *
 * Note: Figma's plugin sandbox does not support ?? or ?. operators.
 * All code uses ES2018-compatible syntax.
 */

figma.showUI(__html__, { width: 480, height: 600 });

/** Safe fallback — returns fallback when val is null or undefined. */
function d(val, fallback) {
  return (val != null) ? val : fallback;
}

// ---------------------------------------------------------------------------
// Message handler — receives specs from the UI
// ---------------------------------------------------------------------------

figma.ui.onmessage = async function (msg) {
  if (msg.type === 'draw-component') {
    try {
      var spec = msg.spec;
      var node = await drawNode(spec);
      figma.currentPage.appendChild(node);
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.ui.postMessage({ type: 'success', name: node.name });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }

  if (msg.type === 'export-selected') {
    var selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Nothing selected' });
      return;
    }
    var exportedSpec = await exportNode(selection[0]);
    figma.ui.postMessage({ type: 'exported', spec: exportedSpec });
  }
};

// ---------------------------------------------------------------------------
// Draw: JSON spec → Figma nodes
// ---------------------------------------------------------------------------

async function drawNode(spec) {
  var node;

  switch (spec.type) {
    case 'component':
      node = figma.createComponent();
      break;
    case 'frame':
      node = figma.createFrame();
      break;
    case 'rectangle':
      node = figma.createRectangle();
      break;
    case 'ellipse':
      node = figma.createEllipse();
      break;
    case 'text':
      return await drawText(spec);
    default:
      node = figma.createFrame();
  }

  // Name
  if (spec.name) node.name = spec.name;

  // Size
  if (spec.width) node.resize(spec.width, spec.height || spec.width);

  // Auto-layout
  if (spec.layout) {
    node.layoutMode = spec.layout === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL';
    node.primaryAxisSizingMode = spec.primaryAxisSizing || 'AUTO';
    node.counterAxisSizingMode = spec.counterAxisSizing || 'AUTO';

    if (spec.primaryAxisAlign) {
      node.primaryAxisAlignItems = spec.primaryAxisAlign;
    }
    if (spec.counterAxisAlign) {
      node.counterAxisAlignItems = spec.counterAxisAlign;
    }
  }

  // Padding
  if (spec.padding) {
    if (typeof spec.padding === 'number') {
      node.paddingTop = spec.padding;
      node.paddingRight = spec.padding;
      node.paddingBottom = spec.padding;
      node.paddingLeft = spec.padding;
    } else {
      node.paddingTop = d(spec.padding.top, 0);
      node.paddingRight = d(spec.padding.right, 0);
      node.paddingBottom = d(spec.padding.bottom, 0);
      node.paddingLeft = d(spec.padding.left, 0);
    }
  }

  // Gap / item spacing
  if (spec.gap !== undefined) {
    node.itemSpacing = spec.gap;
  }

  // Corner radius
  if (spec.cornerRadius !== undefined) {
    if (typeof spec.cornerRadius === 'number') {
      node.cornerRadius = spec.cornerRadius;
    } else {
      node.topLeftRadius = d(spec.cornerRadius.topLeft, 0);
      node.topRightRadius = d(spec.cornerRadius.topRight, 0);
      node.bottomRightRadius = d(spec.cornerRadius.bottomRight, 0);
      node.bottomLeftRadius = d(spec.cornerRadius.bottomLeft, 0);
    }
  }

  // Fills
  if (spec.fills) {
    node.fills = spec.fills.map(parseFill);
  }

  // Strokes
  if (spec.strokes) {
    node.strokes = spec.strokes.map(parseFill);
    if (spec.strokeWeight !== undefined) node.strokeWeight = spec.strokeWeight;
    if (spec.strokeAlign) node.strokeAlign = spec.strokeAlign;
  }

  // Effects (drop shadow, blur)
  if (spec.effects) {
    node.effects = spec.effects.map(parseEffect);
  }

  // Opacity
  if (spec.opacity !== undefined) node.opacity = spec.opacity;

  // Clip contents
  if (spec.clipsContent !== undefined) node.clipsContent = spec.clipsContent;

  // Bind variables
  if (spec.variables) {
    await bindVariables(node, spec.variables);
  }

  // Children (recursive)
  if (spec.children) {
    for (var i = 0; i < spec.children.length; i++) {
      var child = await drawNode(spec.children[i]);
      node.appendChild(child);
    }
  }

  return node;
}

// ---------------------------------------------------------------------------
// Text node helper
// ---------------------------------------------------------------------------

async function drawText(spec) {
  var node = figma.createText();
  if (spec.name) node.name = spec.name;

  // Load font before setting characters
  var family = spec.fontFamily || 'Inter';
  var style = spec.fontStyle || 'Regular';
  await figma.loadFontAsync({ family: family, style: style });

  node.characters = spec.characters || '';
  node.fontSize = spec.fontSize || 16;

  if (spec.fontWeight) {
    // Font weight is set via style name in Figma
    // Common mappings: 400=Regular, 500=Medium, 600=SemiBold, 700=Bold
    var weightStyles = { 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold' };
    var styleName = weightStyles[spec.fontWeight] || style;
    await figma.loadFontAsync({ family: family, style: styleName });
    node.fontName = { family: family, style: styleName };
  }

  if (spec.lineHeight !== undefined) {
    node.lineHeight = typeof spec.lineHeight === 'number'
      ? { value: spec.lineHeight * 100, unit: 'PERCENT' }
      : spec.lineHeight;
  }

  if (spec.letterSpacing !== undefined) {
    node.letterSpacing = { value: spec.letterSpacing, unit: 'PIXELS' };
  }

  if (spec.fills) {
    node.fills = spec.fills.map(parseFill);
  }

  if (spec.textAlign) {
    var alignMap = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED' };
    node.textAlignHorizontal = alignMap[spec.textAlign] || 'LEFT';
  }

  if (spec.variables) {
    await bindVariables(node, spec.variables);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Fill / stroke / effect parsers
// ---------------------------------------------------------------------------

function parseFill(fill) {
  if (fill.type === 'solid') {
    var rgb = hexToRgb(fill.color || '#000000');
    return {
      type: 'SOLID',
      color: rgb,
      opacity: d(fill.opacity, 1),
    };
  }
  // Fallback: transparent
  return { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 };
}

function parseEffect(effect) {
  if (effect.type === 'dropShadow') {
    var shadowRgb = hexToRgb(effect.color || '#000000');
    return {
      type: 'DROP_SHADOW',
      color: { r: shadowRgb.r, g: shadowRgb.g, b: shadowRgb.b, a: d(effect.opacity, 0.25) },
      offset: { x: d(effect.x, 0), y: d(effect.y, 4) },
      radius: d(effect.blur, 8),
      spread: d(effect.spread, 0),
      visible: true,
    };
  }
  if (effect.type === 'blur') {
    return {
      type: 'LAYER_BLUR',
      radius: d(effect.radius, 4),
      visible: true,
    };
  }
  return { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, visible: true };
}

function hexToRgb(hex) {
  var h = hex.startsWith('#') ? hex.slice(1) : hex;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// ---------------------------------------------------------------------------
// Variable binding — connects nodes to existing Figma variables
// ---------------------------------------------------------------------------

/**
 * Bind variables to node properties.
 *
 * spec.variables is a map of property → variable path:
 *   {
 *     "fills": "interactive/default",
 *     "paddingTop": "space/3",
 *     "cornerRadius": "space/2",
 *     "fontSize": "text/base"
 *   }
 *
 * Variable paths use "/" separator matching Figma's internal naming.
 * Variables must already exist in the file (imported via DTCG or REST API).
 */
var _variableCache = null;

async function bindVariables(node, variableMap) {
  // Cache: fetch all local variable collections once
  if (!_variableCache) {
    var collections = await figma.variables.getLocalVariableCollectionsAsync();
    var allVars = {};
    for (var c = 0; c < collections.length; c++) {
      var collection = collections[c];
      for (var vi = 0; vi < collection.variableIds.length; vi++) {
        var v = await figma.variables.getVariableByIdAsync(collection.variableIds[vi]);
        if (v) {
          allVars[v.name] = v;
        }
      }
    }
    _variableCache = allVars;
  }

  var fields = Object.keys(variableMap);
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var varPath = variableMap[field];
    var variable = _variableCache[varPath];
    if (!variable) {
      console.warn('Variable not found: ' + varPath);
      continue;
    }

    try {
      // Color fills/strokes need special handling
      if (field === 'fills' || field === 'strokes') {
        var paints = node[field];
        if (paints && paints.length > 0) {
          var newPaints = paints.slice();
          newPaints[0] = figma.variables.setBoundVariableForPaint(
            newPaints[0], 'color', variable
          );
          node[field] = newPaints;
        }
      } else {
        // Simple bindable fields: cornerRadius, padding*, itemSpacing, opacity, etc.
        node.setBoundVariable(field, variable);
      }
    } catch (err) {
      console.warn('Failed to bind ' + field + ' → ' + varPath + ': ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Export: Figma node → JSON spec
// ---------------------------------------------------------------------------

async function exportNode(node) {
  var spec = {
    type: nodeTypeToSpec(node.type),
    name: node.name,
  };

  // Size
  spec.width = Math.round(node.width);
  spec.height = Math.round(node.height);

  // Auto-layout
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    spec.layout = node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical';
    spec.primaryAxisSizing = node.primaryAxisSizingMode;
    spec.counterAxisSizing = node.counterAxisSizingMode;
    spec.primaryAxisAlign = node.primaryAxisAlignItems;
    spec.counterAxisAlign = node.counterAxisAlignItems;
    spec.gap = node.itemSpacing;
    spec.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
  }

  // Corner radius
  if ('cornerRadius' in node && node.cornerRadius !== 0) {
    if (node.cornerRadius !== figma.mixed) {
      spec.cornerRadius = node.cornerRadius;
    } else {
      spec.cornerRadius = {
        topLeft: node.topLeftRadius,
        topRight: node.topRightRadius,
        bottomRight: node.bottomRightRadius,
        bottomLeft: node.bottomLeftRadius,
      };
    }
  }

  // Fills
  if ('fills' in node && node.fills !== figma.mixed) {
    spec.fills = [];
    var nodeFills = node.fills;
    for (var fi = 0; fi < nodeFills.length; fi++) {
      var f = nodeFills[fi];
      if (f.type === 'SOLID' && f.visible !== false) {
        spec.fills.push({
          type: 'solid',
          color: rgbToHex(f.color),
          opacity: d(f.opacity, 1),
        });
      }
    }
  }

  // Strokes
  if ('strokes' in node && node.strokes.length > 0) {
    spec.strokes = [];
    var nodeStrokes = node.strokes;
    for (var si = 0; si < nodeStrokes.length; si++) {
      var s = nodeStrokes[si];
      if (s.type === 'SOLID') {
        spec.strokes.push({
          type: 'solid',
          color: rgbToHex(s.color),
          opacity: d(s.opacity, 1),
        });
      }
    }
    spec.strokeWeight = node.strokeWeight;
  }

  // Effects
  if ('effects' in node && node.effects.length > 0) {
    spec.effects = [];
    var nodeEffects = node.effects;
    for (var ei = 0; ei < nodeEffects.length; ei++) {
      var e = nodeEffects[ei];
      if (e.visible === false) continue;
      if (e.type === 'DROP_SHADOW') {
        spec.effects.push({
          type: 'dropShadow',
          color: rgbToHex(e.color),
          opacity: e.color.a,
          x: e.offset.x,
          y: e.offset.y,
          blur: e.radius,
          spread: e.spread,
        });
      } else if (e.type === 'LAYER_BLUR') {
        spec.effects.push({ type: 'blur', radius: e.radius });
      }
    }
  }

  // Text
  if (node.type === 'TEXT') {
    spec.characters = node.characters;
    if (node.fontSize !== figma.mixed) spec.fontSize = node.fontSize;
    if (node.fontName !== figma.mixed) {
      spec.fontFamily = node.fontName.family;
      spec.fontStyle = node.fontName.style;
    }
  }

  // Opacity
  if (node.opacity !== 1) spec.opacity = node.opacity;

  // Bound variables
  if ('boundVariables' in node) {
    var bindings = {};
    var bvKeys = Object.keys(node.boundVariables);
    for (var bi = 0; bi < bvKeys.length; bi++) {
      var bvField = bvKeys[bi];
      var binding = node.boundVariables[bvField];
      if (!binding) continue;
      var alias = Array.isArray(binding) ? binding[0] : binding;
      if (alias && alias.id) {
        var bv = await figma.variables.getVariableByIdAsync(alias.id);
        if (bv) bindings[bvField] = bv.name;
      }
    }
    if (Object.keys(bindings).length > 0) {
      spec.variables = bindings;
    }
  }

  // Children
  if ('children' in node && node.children.length > 0) {
    spec.children = [];
    for (var ci = 0; ci < node.children.length; ci++) {
      spec.children.push(await exportNode(node.children[ci]));
    }
  }

  return spec;
}

function nodeTypeToSpec(type) {
  var map = {
    COMPONENT: 'component',
    COMPONENT_SET: 'component',
    FRAME: 'frame',
    RECTANGLE: 'rectangle',
    ELLIPSE: 'ellipse',
    TEXT: 'text',
    INSTANCE: 'frame',
    GROUP: 'frame',
  };
  return map[type] || 'frame';
}

function rgbToHex(color) {
  var toHex = function (n) { return Math.round(n * 255).toString(16).padStart(2, '0'); };
  return '#' + toHex(color.r) + toHex(color.g) + toHex(color.b);
}
