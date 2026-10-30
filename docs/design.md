# The design system

> **Status:** its foundation is built: the colours of both themes and the tone, type, space and corners, and the studio. Motion's primitives come next. Decided in [ADR-0003](decisions/0003-interface-and-motion.md).

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

## Building a screen

- **`Screen`** is a page: the canvas, the gutter, and room for the system's bars. A long page scrolls.
- **`Text`** sets text on the scale, in an ink: `text`, `textMuted`, `accent` or `onAccent`.
- **`useTheme()`** gives the theme's colours to anything else.
- **A new value** goes into the tokens, named for what it does, and the studio shows it. A new colour role comes with its contrast rule, and a test of it.

## The studio

- **Where:** the development app has it; production does not (`studio.enabled` in `config/`). It opens from the header of the homes screen.
- **What:** choose the appearance and one of the robot's tones; the pages then show the colours with their contrasts, the type with Vietnamese's marks, and the spacing and corners.
- **Judging motion:** on a release build of the development app, on the slowest phone the app supports (ADR-0003).
