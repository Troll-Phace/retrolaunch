# RetroLaunch — Design System

A comprehensive design system for RetroLaunch, built on dark-first aesthetics with dynamic color extraction, modern glassmorphism, and retro gaming sensibility.

---

## Design Philosophy

RetroLaunch embraces an **ultra-modern dark aesthetic** with dynamic, context-aware color. Every design decision optimizes for visual impact, smooth interaction, and a library that feels alive — not like a file browser.

### Core Principles

1. **Dynamic and alive**: The UI adapts to what you're looking at. Cover art colors bleed into backgrounds, systems carry their own visual identity, and hover states make the grid feel responsive and tactile.
2. **Modern, not retro**: Despite being a retro game launcher, the UI itself is cutting-edge — glassmorphism, spring animations, color extraction, not pixel art and CRT filters (those are optional themes, not the default identity).
3. **Information without clutter**: Game metadata is dense but organized. Cover art dominates, text supports, and whitespace breathes. Every element earns its pixel.

---

## Color System

### Base Palette

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Background (deepest) | Void | `#0a0a0f` | Page background, app shell |
| Background (secondary) | Deep Space | `#12121f` | Gradient endpoint, section backgrounds |
| Surface | Slate | `#141420` | Cards, panels, list items |
| Surface Elevated | Elevated Slate | `#1a1a2e` | Hover states, active cards, cover art placeholders |
| Surface Active | Active Slate | `#1e1e30` | Selected states, scrollbar tracks |
| Border | Ghost | `#1e1e30` | Card borders, subtle dividers |
| Border Active | Lit Ghost | `#2a2a3a` | Input borders, hover borders |
| Text Primary | White | `#ffffff` | Headings, game titles, primary content |
| Text Secondary | Mist | `#8888aa` | Subtitles, metadata labels, breadcrumbs |
| Text Tertiary | Dim | `#555566` | Timestamps, file info, disabled text |

### Accent Palette (Default — before dynamic override)

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Accent Primary | Indigo | `#6366f1` | Primary buttons, active states, focus rings, links |
| Accent Light | Lavender | `#8b5cf6` | Gradient endpoints, hover highlights |
| Accent Soft | Violet Glow | `#a78bfa` | Badges, subtle accents |
| Success | Emerald | `#4ade80` | Configured status, verified, matched |
| Warning | Amber | `#f59e0b` | Unconfigured, pending, scanning |
| Error | Rose | `#f43f5e` | Failed, error states, missing emulator |

### Dynamic Color System

The accent palette is **overridden dynamically** when the user interacts with a specific game. Using `vibrant.js` or `colorthief`, the UI extracts 3-5 dominant colors from the game's cover art and applies them to:

- Accent color (buttons, badges, links, focus rings)
- Background gradient orbs (large, blurred, subtle)
- Card glow on hover
- Detail view header gradient
- System-level theme color (when browsing a specific console)

**Transition**: All dynamic color changes animate over 300ms with CSS `transition` on custom properties (`--accent`, `--accent-light`, `--glow-color`).

**Fallback**: When no cover art exists, use the system's theme color (see System Theme Colors below).

### System Theme Colors

Each console has a default theme color used for its section header, card glow, and accent when browsing that system:

| System | Theme Color | Hex |
|--------|------------|-----|
| NES | Nintendo Red | `#e60012` |
| SNES | SNES Purple | `#7c3aed` |
| Genesis | Sega Blue | `#0066ff` |
| N64 | N64 Green | `#00963f` |
| Game Boy | GB Green | `#8bac0f` |
| GBA | GBA Indigo | `#5b3c88` |
| PlayStation | PS Gray-Blue | `#003087` |
| Saturn | Saturn Orange | `#ff6600` |
| Neo Geo | Neo Red-Gold | `#c8102e` |
| Atari 2600 | Atari Woodgrain | `#8b6914` |

### Color Rules

- **Dynamic color takes priority** over system theme color when viewing a specific game's detail page.
- **System theme color** applies when browsing a system's game grid (header gradient, accent).
- **Default indigo accent** applies on the home screen and settings.
- **Green always means positive**: configured, verified, matched, improvement.
- **Amber always means pending/warning**: unconfigured, scanning, partial.
- **Rose always means error/failure**: missing, failed, corrupt.
- **Background hierarchy**: Void → Deep Space → Slate → Elevated Slate. Never skip levels.

---

## Typography

### Font Stack

| Role | Font | Weight | Size | Line Height |
|------|------|--------|------|-------------|
| App Title / Logo | Inter | 800 (ExtraBold) | 22px | 1.2 |
| Page Titles | Inter | 700 (Bold) | 28-32px | 1.2 |
| Section Headers | Inter | 600 (SemiBold) | 16px | 1.3 |
| Game Titles (card) | Inter | 600 (SemiBold) | 12-13px | 1.3 |
| Game Title (detail) | Inter | 700 (Bold) | 36px | 1.1 |
| Body Text | Inter | 400 (Regular) | 13-14px | 1.5 |
| Metadata Labels | Inter | 600 (SemiBold) | 11px | 1.3 |
| Metadata Values | Inter | 400 (Regular) | 14px | 1.4 |
| Numbers / Stats | JetBrains Mono | 700 (Bold) | 18-30px | 1.2 |
| Small Labels | Inter | 400 (Regular) | 10-11px | 1.3 |
| Badges / Tags | Inter | 600 (SemiBold) | 10px | 1.0 |

### Font Justification

**Inter**: The primary UI font. High x-height for legibility at small sizes, tabular numerals for aligned data, extensive weight range for clear hierarchy. Used for everything except prominent numeric displays.

**JetBrains Mono**: Reserved for prominent numeric data — game counts on system cards, playtime stats, setup completion numbers. Its tabular figures ensure columns align, and monospace gives numbers visual weight.

### Type Rules

1. **JetBrains Mono for big numbers only**: Game counts ("47"), playtime ("12h 34m"), completion percentages. NOT for inline metadata values.
2. **Inter for everything else**: Headings, body, labels, small numbers, badges.
3. **Letter spacing**: Negative for large headings (`-0.5px` to `-1.5px`), positive for uppercase labels (`1.5px` to `3px`).
4. **Uppercase labels**: Section headers like "RECENTLY ADDED", "YOUR SYSTEMS", "DEVELOPER" use uppercase + letter-spacing + text-secondary color.
5. **No underlined links**: Links use accent color only, no underline. Hover adds subtle opacity change.

---

## Spatial System

### Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Minimum gap (badge padding, icon-text) |
| `space-2` | 8px | Tight spacing (tag gaps, inline metadata) |
| `space-3` | 12px | Card inner padding, compact sections |
| `space-4` | 16px | Standard card padding, form field gaps |
| `space-5` | 20px | Section title to content gap |
| `space-6` | 24px | Card-to-card gap, major element separation |
| `space-8` | 32px | Page section gaps |
| `space-10` | 40px | Major layout divisions |

### Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Buttons, small inputs |
| `radius-md` | 8px | Cover art thumbnails, tags |
| `radius-lg` | 12px | Cards, panels |
| `radius-xl` | 16px | Hero cards, modals |
| `radius-full` | 9999px | Pills, circular buttons, search bar |

---

## Component Design Language

### Cards (Game Card)

```
┌─────────────────────┐
│  ┌─────────────────┐ │
│  │                 │ │  Cover art: radius-md, fills card width
│  │   Cover Art     │ │  Aspect ratio: ~1:1 (square) for grid
│  │   (146×146)     │ │
│  │                 │ │
│  └─────────────────┘ │
│                       │
│  Game Title           │  Inter 600, 12px, white, 2-line max + ellipsis
│  System Tag           │  Accent color, 10px
│  Developer · Year     │  Dim text, 10px
│                       │
└───────────────────────┘
```

- **Background**: Slate (`#141420`)
- **Border**: 1px solid Ghost (`#1e1e30`)
- **Border radius**: `radius-lg` (12px)
- **Padding**: 12px around cover, 12px horizontal for text area
- **Hover state**: Border shifts to accent color, subtle glow (`box-shadow: 0 0 20px accent/30%`), slight scale (`transform: scale(1.02)`), play icon overlay fades in over cover art
- **Transition**: 200ms ease for all hover properties

### Hero Banner (Continue Playing)

- **Background**: Gradient from system/game theme color → transparent → page background
- **Border radius**: `radius-xl` (16px)
- **Height**: ~220px
- **Content**: Cover art (left), game title + metadata + play button + progress indicator (right)
- **Play button**: Accent gradient fill, `radius-full`, glow filter on hover
- **Shadow**: `box-shadow: 0 4px 24px rgba(0,0,0,0.4)`

### System Cards

- **Background**: Slate
- **Border**: 1px solid Ghost
- **Border radius**: `radius-lg`
- **Content**: System name (Inter 600, 13px, white) centered, game count below (JetBrains Mono, 20px, accent), "games" label (Dim, 10px)
- **Size**: ~140×110px
- **Hover**: Same as game card hover (glow + scale)

### Badges / Tags

- **Background**: Accent color at 15% opacity
- **Border**: 0.5px solid accent color at 50%
- **Border radius**: `radius-full` (pill shape)
- **Padding**: 4px 12px
- **Text**: Accent color, Inter 600, 10px
- **Usage**: System tags on game cards, genre pills on grid filter bar, region badges on detail view

### Buttons

| Variant | Background | Text | Border | Border Radius |
|---------|-----------|------|--------|---------------|
| Primary | Accent gradient | White, 14-16px, bold | None | `radius-full` |
| Secondary | Transparent | Accent color, 13px | 1.5px solid accent-muted | `radius-full` |
| Ghost | Transparent | Mist, 13px | None | `radius-full` |
| Icon | Transparent | Mist | 1.5px solid Ghost | 50% (circle) |

- **Primary hover**: Glow filter (`filter: drop-shadow(0 0 12px accent/40%)`)
- **Primary size**: Generous — min 130×42px for main CTAs, 250×50px for hero actions

### Input Fields

- **Background**: Void (`#0a0a0f`) or `#0d0d15`
- **Border**: 1px solid `#2a2a3a`
- **Border radius**: `radius-full` for search, `radius-sm` for form inputs
- **Text**: White, Inter 13px
- **Placeholder**: Dim (`#555566`)
- **Focus**: Border shifts to accent color, subtle glow ring

### Progress Bars

- **Track**: Active Slate (`#1e1e30`), `radius-full`, 4-8px height
- **Fill**: Accent gradient, `radius-full`
- **Animated**: Smooth width transition on value change

### Status Indicators

| State | Color | Icon | Usage |
|-------|-------|------|-------|
| Configured / Verified | Emerald `#4ade80` | ✓ | Emulator set, ROM verified |
| Scanning / Pending | Amber `#f59e0b` | ⟳ | Scan in progress, metadata fetching |
| Not Configured | Amber `#f59e0b` | ○ / ! | Missing emulator path |
| Error / Failed | Rose `#f43f5e` | × | Launch failed, corrupt ROM |
| Matched | Emerald `#4ade80` | ● | Metadata found and cached |

---

## Animation & Interaction Language

### Framer Motion Defaults

```typescript
// Page transitions
const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: "easeOut" }
};

// Card hover
const cardHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 400, damping: 25 }
};

// Layout animation (shared element transitions)
const layoutTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30
};

// Staggered children (card grid)
const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04 } }
};
```

### Animation Rules

1. **Page transitions**: Fade + subtle Y translate (8px). Duration: 250ms.
2. **Card hover**: Spring physics (stiffness: 400, damping: 25). Scale to 1.02.
3. **Card glow**: `box-shadow` transition over 200ms ease.
4. **Play icon overlay**: Fade in over 150ms on card hover, centered over cover art.
5. **Dynamic color transitions**: CSS custom properties transition over 300ms.
6. **Grid entry**: Stagger children with 40ms delay between each card.
7. **Detail view**: Cover art uses `layoutId` for shared element transition from grid card.
8. **No janky animations**: Prefer `transform` and `opacity` (GPU-composited). Avoid animating `width`, `height`, `top`, `left`.
9. **Respect reduced motion**: Check `prefers-reduced-motion` media query; disable spring animations and stagger, use instant transitions.

### Glassmorphism / Blur

- **Background blur**: `backdrop-filter: blur(20px)` for modal overlays, dropdown menus
- **Color bleed orbs**: Large circles (r=200-350px) with accent color at 3-8% opacity, Gaussian blur filter (stdDeviation 40-50), positioned behind main content
- **Usage**: Game detail view background, home screen hero area, modal backdrops

---

## Page Layout Patterns

### Navigation

No traditional navbar. Navigation is implicit:
- **Home**: Logo/title click, or "Home" breadcrumb
- **System Grid**: Click system card from home
- **Game Detail**: Click game card from any grid
- **Settings**: Gear icon in top-right corner
- **Back**: Arrow + breadcrumb trail ("← Super Nintendo")

### Common Patterns

**Horizontal Scrollable Row**: Used for "Recently Added" games, "Your Systems" cards. Partially visible last card (faded opacity) signals scrollability. Snap scrolling on touch devices.

**Filter Bar**: Horizontal pill buttons for genre filtering on system grid view. "All" pill is active by default (accent background). Others are ghost style until selected.

**Grid View**: 6-column card grid at 1920px. Responsive: 5 columns at 1440px, 4 at 1200px, 3 at 900px, 2 at 600px. Card gaps: `space-6` horizontal, `space-4` vertical between rows.

**Detail View**: Two-column layout. Left: large cover art (300×300) with colored drop shadow. Right: title, badges, metadata grid, description, action buttons. Below: screenshots carousel, file info bar.

### Responsive Behavior

- **Primary target**: 1920×1080
- **Secondary target**: 1440×900
- **Grid columns**: Fluid, based on viewport width (min card width ~170px)
- **Hero banner**: Height scales with viewport, min 180px
- **System cards**: Wrap to new rows on narrow viewports

---

## Theme System

Four built-in themes, selectable in Preferences:

| Theme | Background | Surface | Accent | Notes |
|-------|-----------|---------|--------|-------|
| Dark (default) | `#0a0a0f` | `#141420` | `#6366f1` | Primary theme, all wireframes |
| Light | `#f5f5f7` | `#ffffff` | `#4f46e5` | Inverted, high contrast |
| OLED | `#000000` | `#0a0a0a` | `#6366f1` | True black for OLED displays |
| Retro | `#1a1008` | `#2a1a10` | `#f59e0b` | Warm amber, CRT aesthetic |

Theme implementation: CSS custom properties on `:root`, toggled by adding a `data-theme` attribute to `<html>`. All component styles reference custom properties, never hardcoded hex values.

---

## Wireframe References

All wireframes stored as SVG in the `wireframes/` directory:

- **wireframe-home.svg** — Home screen: hero banner, recently added row, system cards
- **wireframe-system-grid.svg** — System game grid: filter bar, 6-column card grid, hover state
- **wireframe-game-detail.svg** — Game detail: cover art, metadata, screenshots, dynamic color
- **wireframe-settings.svg** — Settings: emulator config, path fields, auto-detect
- **wireframe-onboarding-1-welcome.svg** — Onboarding step 1: welcome screen
- **wireframe-onboarding-2-roms.svg** — Onboarding step 2: ROM directory setup
- **wireframe-onboarding-3-emulators.svg** — Onboarding step 3: emulator configuration
- **wireframe-onboarding-4-metadata.svg** — Onboarding step 4: metadata fetch progress
- **wireframe-onboarding-5-preferences.svg** — Onboarding step 5: preferences
- **wireframe-onboarding-6-done.svg** — Onboarding step 6: setup complete

---

## Accessibility & Contrast

- **WCAG AA compliance**: All text meets minimum 4.5:1 contrast ratio against background
- **Focus indicators**: Visible focus ring (accent color, 2px) on all interactive elements
- **Color + icon pairing**: Status indicators always pair color with icon/text (not color alone)
- **Keyboard navigation**: Full keyboard support for grid browsing, game launch, navigation
- **Reduced motion**: Respect `prefers-reduced-motion`; disable springs, stagger, and parallax
- **Minimum touch target**: 44×44px for interactive elements on touch-capable devices

---

## Implementation Notes (Tailwind CSS)

### Custom Properties

```css
:root[data-theme="dark"] {
  --bg-void: #0a0a0f;
  --bg-deep: #12121f;
  --surface: #141420;
  --surface-elevated: #1a1a2e;
  --surface-active: #1e1e30;
  --border: #1e1e30;
  --border-active: #2a2a3a;
  --text-primary: #ffffff;
  --text-secondary: #8888aa;
  --text-dim: #555566;
  --accent: #6366f1;
  --accent-light: #8b5cf6;
  --success: #4ade80;
  --warning: #f59e0b;
  --error: #f43f5e;
}
```

### Tailwind Extension

```javascript
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      colors: {
        void: 'var(--bg-void)',
        deep: 'var(--bg-deep)',
        surface: 'var(--surface)',
        elevated: 'var(--surface-elevated)',
        active: 'var(--surface-active)',
        ghost: 'var(--border)',
        accent: 'var(--accent)',
        'accent-light': 'var(--accent-light)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
    },
  },
};
```

---

*This design system evolves with implementation. Theme colors, spacing, and component details will be refined during development.*
