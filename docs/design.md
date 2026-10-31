# The design system

> **Status:** built: the colours of both themes and the tone, type, space and corners, motion and its components, and the studio. The first screen built on them is the homes', empty for now. Decided in [ADR-0003](decisions/0003-interface-and-motion.md).

The app speaks the robot's visual language: one tone, glowing, on a quiet canvas. This page is for whoever builds a screen. It says where each value lives and what rule it keeps.

## Where it lives

- **`src/shared/design/`:** the tokens, as data, and the components that read them.
  - Screens import it through its `index.ts`.
  - A component never holds a colour, a size or a duration of its own.
- **`src/studio/`:** every token and component on a page, in both themes. It exists only in the development app.

## Colour

The app follows the phone's light or dark appearance, or the one chosen.

### Neutrals

They do not change with the tone. They are in `palette.json`, which the splash screen reads too.

| Role | For | Rule |
|---|---|---|
| `canvas` | The ground of every screen | In the dark, the robot's own: RGB 6, 9, 13 |
| `surface` | Cards, sheets, grouped rows | |
| `fill` | Controls on a surface, a pressed row | |
| `hairline` | Lines that only separate | |
| `outline` | Lines that show where a control is | 3:1 with every background (WCAG 1.4.11) |
| `text` | Text | 7:1 with every background (1.4.6, AAA) |
| `textMuted` | Text that comes second | 4.5:1 with every background (1.4.3) |
| `shimmer` | The light that crosses a shape still loading | Lighter than the `fill` it crosses |

### The tone

The tone is the robot's colour of the moment: its calm cyan while it is not known. Each theme works four colours out of it.

| Role | For | How |
|---|---|---|
| `accent` | Text, icons, fills and focus in the tone | The tone itself, if it reaches 4.5:1 with the canvas, the surface, the fill and `accentSoft`. Otherwise it is made lighter, in the dark theme, or darker, in the light one, only as far as it must. The change is in OKLCH, so the hue stays. |
| `onAccent` | What is written on an accent fill | The canvas or the surface, whichever stands out more |
| `accentSoft` | A surface tinted with the tone | The tone's hue, at the lightness and the chroma in `palette.json` (`tint`) |
| `glow` | Light that glows | The tone as the robot shows it; never for text |

- **On the dark canvas,** the robot's nine tones keep their own colours, since all of them can be read there. On the light canvas, they darken.
- **When the tone changes,** the colours blend in 280 ms, as the robot's face does from one expression to the next. The blend runs on the UI thread: `Text` does it for its accent inks, and a view does it with `VIEW_BLEND`.
- **The tests** check every pair against WCAG 2.2, with arithmetic of their own. They check the robot's nine tones, and colours all round the hue circle, from grey to the most vivid.

## Type

- **The font:** Be Vietnam Pro, drawn for Vietnamese, in the weights 400, 500, 600 and 700. Only those four files ship.
  - The app loads them while the splash screen shows.
  - Each weight is a family of its own, so no style sets `fontWeight`.
- **The scale:**

  | Variant | Size / line | Weight |
  |---|---|---|
  | `display` | 32 / 46 | 700 |
  | `title` | 26 / 37 | 700 |
  | `heading` | 20 / 29 | 600 |
  | `body`, `bodyStrong` | 16 / 24 | 400, 600 |
  | `label` | 15 / 22 | 500 |
  | `caption` | 13 / 19 | 400 |

- **Lines are at least 1.414 times the text's size.** Vietnamese stacks its marks: a capital with two of them, such as Ẫ, reaches 1.149 em above the line, and the descender reaches 0.265 em below it. A shorter line can clip them on Android.
- **Headings** (`display`, `title`, `heading`) are announced as headings.
- **Text scales** with the phone's text size; layouts grow with it.

## Space and corners

- **`SPACE`,** on a grid of 4: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32, `xxxl` 48. A screen's edge is `GUTTER` (16).
- **`TARGET`:** what a finger presses is at least 48 across. That is Android's 48 dp, which covers Apple's 44 pt too.
- **`RADIUS`:** `sm` 8, `md` 14, `lg` 22, `full`. Each corner is drawn with a continuous curve.
- **`RING_WIDTH`** is the ring around what is chosen. **`GLOW_RADIUS`** is how far light glows.

## Motion

Motion has a budget, set by how often it is seen (ADR-0003, from Expo's animation skill). What is touched a hundred times a day does not move; a press, touched tens of times, barely moves; the richest motion waits for rare moments. Every motion runs on the UI thread.

| Token | Value | For |
|---|---|---|
| `DURATION.press` | 120 ms | A press, as a spring that does not bounce (`CSS_SPRING`) |
| `DURATION.change` | 180 ms | A small change, and neighbours making room |
| `DURATION.enter`, `exit` | 250, 200 ms | Arriving, and leaving a fifth faster, on a strong ease-out |
| `DURATION.fade` | 150 ms | What would move or scale, with reduce motion on |
| `TONE_BLEND` | 280 ms | A change of tone, as the robot's face blends its expressions |
| `BREATH` | 4.4 s | Light breathing, with the robot's breath |
| `WAIT` | 1.2 s, 1.4 s | A pulse of the tone; a shimmer's sweep |

- **Nothing passes 300 ms,** and nothing starts slow: no curve eases in.
- **Reduce motion:** the phone's setting, read as the app starts and followed when it changes. The studio can force it either way.
  - What would move or scale fades instead, in `DURATION.fade`.
  - Loops stop: the shimmer, the pulse, the breath.
  - Colour still blends.
- **Haptics:** one for what a touch does, where the platforms' guidance puts one, and never the only sign of it.
  - `select` is a choice that moves, `success` and `error` the end of a wait.
  - iOS plays its feedback generators.
  - Android plays its haptics engine (`performHapticFeedback`), never the vibrator.
  - Both follow the phone's own setting for haptics.
- **120 Hz:** Expo's template for SDK 58 already lets iPhones with ProMotion animate at 120 frames a second (`CADisableMinimumFrameDurationOnPhone`).

## Components

| Component | What it is | How it moves |
|---|---|---|
| `Screen` | A page: the canvas, the gutter, room for the system's bars; a long page scrolls | |
| `Text` | Text on the scale, in an ink: `text`, `textMuted`, `accent` or `onAccent` | Accent inks blend with the tone |
| `Press` | Anything a finger presses | Shrinks a little, or dims with reduce motion. A row as wide as the screen lights up instead. It can play a haptic as the press commits. |
| `Button` | `primary`, filled with the tone and glowing; `secondary`, on a tint of it; `plain`, its text alone | Presses as `Press` does. Disabled, it is faint; busy, the tone pulses where its label was, and screen readers still hear the label. |
| `Appear` | Something that arrives once, such as what a person waited for | Rises and grows into place, staggered; leaves the way it came; its neighbours make room |
| `Skeleton` | The shape of content still loading | A light crosses it |
| `Pulse` | Waiting, in the tone, with a name for screen readers | Three dots pulse one after another |
| `Glow` | Light in the tone, drawn with Skia, for rare moments | Blends with the tone; can breathe |

## Building a screen

- **Build it from the components above.** `useTheme()` gives the theme's colours to anything else, and `useMotion()` says whether motion is reduced.
- **A new value** goes into the tokens, named for what it does, and the studio shows it. A new colour role comes with its contrast rule, and a test of it.
- **A new motion** names its purpose, keeps the budget, and ships with its reduce-motion form.

## The studio

- **Where:** the development app has it; production does not (`studio.enabled` in `config/`). It opens from the header of the homes screen.
- **What:** choose the appearance, the motion and one of the robot's tones. The pages then show:
  - the colours, with their contrasts;
  - the type, with Vietnamese's marks;
  - the spacing and corners;
  - the components, to press;
  - motion, to watch.
- **Judging motion:** on a release build of the development app, on the slowest phone the app supports (ADR-0003).
