---
name: bento-slides
description: >-
  Create, author, and edit Bento presentations (.bento.html) — self-contained, interactive,
  morphing slide decks with native charts, tables, media, and animations. Use whenever the
  user wants a presentation, oral defense (soutenance de SAÉ), course diaporama, or interactive
  slides. Uses the local pre-bundled BentoSlide template with custom Cartable Numérique DA
  without re-downloading from the web.
---

# Bento Slides Authoring Guide for Antigravity

Bento decks are self-contained single-file `.bento.html` documents. The presentation data lives in ONE plain JSON block near the top:

```html
<script type="application/bento+json" id="bento-doc">
{
  "format": "bento/slides",
  "version": 1,
  "title": "Titre du Diaporama",
  "size": { "width": 1280, "height": 720 },
  "theme": {
    "background": "#0f172a",
    "color": "#f8fafc",
    "accent": "#38bdf8",
    "fontFamily": "system-ui, sans-serif"
  },
  "slides": [ ... ]
}
</script>
```

You edit **that block only**, in place. Escape every `<` in the JSON as `\u003c` so the script tag is never prematurely closed.

---

## Local Template (No Download Required)

The project bundles a clean, customized offline template at:
- `public/bento/bento_slides_template.html`
- `server/templates/bento_slides_template.html`

To generate a new presentation:
1. Copy the local template to the target path (e.g. `data/users/<username>/slides/<Topic>.bento.html` or `<Topic>.bento.html`).
2. Inject your deck's JSON into the `<script type="application/bento+json" id="bento-doc">...</script>` block.

---

## Minimal Valid Document Skeleton

```json
{
  "format": "bento/slides",
  "version": 1,
  "title": "Soutenance de Projet",
  "size": { "width": 1280, "height": 720 },
  "theme": {
    "background": "#0f172a",
    "color": "#f8fafc",
    "accent": "#38bdf8",
    "fontFamily": "system-ui, sans-serif"
  },
  "slides": [
    {
      "id": "s1",
      "background": "#0f172a",
      "transition": "none",
      "notes": "Notes du présentateur pour la première diapositive.",
      "elements": [
        {
          "id": "title",
          "type": "text",
          "x": 96,
          "y": 240,
          "w": 1088,
          "h": 140,
          "rotation": 0,
          "opacity": 1,
          "html": "Titre de la Présentation",
          "fontSize": 72,
          "fontFamily": "system-ui, sans-serif",
          "fontWeight": 800,
          "color": "#f8fafc",
          "align": "left",
          "valign": "top",
          "lineHeight": 1.15
        }
      ]
    }
  ]
}
```

---

## The Signature Moves of Bento

### 1. Morph Transitions (`transition: "morph"`)
When two consecutive slides share element `id`s (or `morphId`), Bento smoothly glides and tweens their positions, sizes, colors, and borders!
- Slide 1: `{ "id": "card1", "x": 96, "y": 200, "w": 300, "h": 200, ... }`
- Slide 2 (`transition: "morph"`): `{ "id": "card1", "x": 96, "y": 100, "w": 500, "h": 400, ... }`
-> The element glides dynamically across the screen.

### 2. Interactive Charts (`type: "chart"`)
Charts-lite syntax with plain numbers:
```json
{
  "id": "c1",
  "type": "chart",
  "x": 96,
  "y": 200,
  "w": 1088,
  "h": 420,
  "rotation": 0,
  "opacity": 1,
  "preset": "bar",
  "option": {
    "xAxis": { "type": "category", "data": ["Débit LAN", "Débit WAN", "VPN IPsec"] },
    "yAxis": { "type": "value" },
    "series": [{ "type": "bar", "data": [1000, 100, 450], "itemStyle": { "color": "#38bdf8" } }]
  }
}
```

### 3. Comparison & Data Tables (`type: "table"`)
Structured HTML table cells:
```json
{
  "id": "t1",
  "type": "table",
  "x": 96,
  "y": 200,
  "w": 1088,
  "h": 320,
  "header": true,
  "columns": [{ "w": 1.5 }, { "w": 1 }, { "w": 1 }],
  "rows": [
    { "cells": [{ "html": "Critère" }, { "html": "IPv4" }, { "html": "IPv6" }] },
    { "cells": [{ "html": "Espace d'adressage" }, { "html": "32 bits" }, { "html": "128 bits" }] },
    { "cells": [{ "html": "Configuration" }, { "html": "DHCP / Statique" }, { "html": "SLAAC / DHCPv6" }] }
  ],
  "style": {
    "headerBg": "#1e293b",
    "headerColor": "#38bdf8",
    "borderColor": "rgba(255,255,255,0.1)",
    "cellPadX": 16,
    "cellPadY": 12,
    "fontSize": 18,
    "color": "#f8fafc",
    "radius": 8
  }
}
```

### 4. State Slides (Interactive Drill-Downs)
Parent slide has a clickable element with `"link": "state_detail"`.
Adjacent slide has `"stateOf": "parent_slide_id"` — it is skipped during normal arrow-key navigation and only opens when the user clicks!

---

## Best Practices for Academic & Project Presentations (BUT R&T)
- **Palette**: Dark Navy background (`#0f172a`), Soft White text (`#f8fafc`), Sky Blue / Cyan accent (`#38bdf8` or `#2563eb`).
- **Typography**: `system-ui, -apple-system, sans-serif`. Large headings (56px–72px), legible body (20px–28px).
- **Margins**: Left margin 96px, right margin ≤ 1184px (canvas width 1280px).
- **Notes**: Always provide concise presenter talking points in `notes` for each slide.
