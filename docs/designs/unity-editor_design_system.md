# MEngine Editor — Unity-Style Design System

Reference: Unity Editor (2021/2022/6) dark theme. Goal: give the MEngine editor the
same calm, professional, "tactile" feel — layered neutral grays, subtle bevels, and a
single restrained accent blue — instead of flat, lifeless surfaces.

The existing stylesheet already uses Unity-derived tokens (`--u-*`) including Unity's
signature selection blue `#2c5d87`. The overhaul keeps every token name (so nothing
breaks) and focuses on **depth, bevels, gradients, tabs, and component polish**.

## 1. Color Palette

Layered neutrals, darkest at the app frame, lightest on raised chrome bars.

| Token | Value | Role |
| --- | --- | --- |
| `--u-bg` | `#1e1e1e` | App frame / deepest recess |
| `--u-panel` | `#383838` | Standard panel surface |
| `--u-panel-2` | `#303030` | Secondary / recessed panel |
| `--u-toolbar` | `#3c3c3c` | Chrome bars (menu / toolbar / status) base |
| `--u-tab` | `#2b2b2b` | Inactive tab strip |
| `--u-input` | `#232323` | Recessed input fields |
| `--u-border` | `#232323` | Dark panel separator |
| `--u-border-2` | `#4a4a4a` | Light bevel / control outline |
| `--u-hover` | `#474747` | Row / button hover |
| `--u-selected` | `#2c5d87` | Unity signature selection |
| `--u-selected-soft` | `#3e5f7a` | Softer selection variant |
| `--u-accent` | `#4d90fe` | Focus ring / active-tab accent line |
| `--u-focus` | `#6aa6d1` | Focus outline |
| `--u-text` | `#c4c4c4` | Primary text |
| `--u-text-bright` | `#f2f2f2` | Active / heading text |
| `--u-muted` | `#8b8b8b` | Labels, hints |
| `--u-play-on` | `#3d8f4a` | Play mode / success |
| Axis X / Y / Z | `#f14c4c` / `#6bbf4e` / `#4c8ff1` | Transform axis coding |

## 2. Depth & Bevel Principles (the "Unity feel")

Unity surfaces are never perfectly flat. Three cheap tricks create the tactile look:

1. **Vertical micro-gradient on chrome bars** — top ~4% lighter than bottom:
   `linear-gradient(to bottom, #434343, #3a3a3a)`.
2. **1px inset top highlight** on raised surfaces — `box-shadow: inset 0 1px rgba(255,255,255,.05)`.
3. **1px dark bottom edge** on raised surfaces — gives each bar a crisp shadow line.

Recessed elements (inputs, viewport) invert this: dark fill + subtle inset shadow
`inset 0 1px 2px rgba(0,0,0,.35)`.

## 3. Typography

- Family: `"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`; mono `Consolas, "Cascadia Mono", monospace`.
- Base 12px; headings/active 13px semibold; hints/labels 11px.
- Brand/overline labels: `letter-spacing: .06em`, uppercase feel, muted color.
- Line height ~1.4; never bold body text.

## 4. Component Styles

**Tabs (dock-tab):** inactive = recessed dark (`--u-tab`), muted text, 1px right
separator. Active = matches panel bg, bright text, **2px accent line on top**
(`--u-accent`), no bottom border so it visually merges with the panel body.

**Buttons (tool-btn / play-btn):** transparent until hover; hover = `--u-hover` fill +
light outline; active/toggled = `--u-selected` fill. Subtle 0.1s transitions.

**Inputs:** `--u-input` fill, 1px `--u-border-2`, 2px radius, inner shadow; focus =
`--u-accent` border (no harsh outline).

**Component / section headers (comp-head, insp-header):** subtle gradient
(`#404040 → #3a3a3a`) + inset top highlight + crisp 1px bottom separator.

**Scrollbars:** 8–10px thin, `--u-scroll-track` track, rounded `--u-scroll-thumb`,
brighter on hover; corner matches track.

## 5. Spacing System

4px base grid. Panel padding 6–8px; field rows 4px vertical; control gaps 2–6px;
chrome bar height: menu 22px, toolbar 36px, status 22px, tab strip 24–26px.

## 6. Motion

Transitions 0.1s ease on background/border/color only. No transform animations on
chrome. Drop/selection overlays may use 0.06s ease-out.
