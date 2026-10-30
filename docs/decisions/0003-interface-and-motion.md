# 0003 — The interface: the robot's visual language, in motion

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

- **The owner wants an interface rich in motion**, where animation serves the experience, and not a plain one (2026-10-30).
- **The robot's visual language**, in ai-robot's `ui/src/tones.js` and `settings.js`:
  - one bright tone, glowing, on near-black (RGB 6, 9, 13). Nine tones carry moods: cyan for calm (the default), warm for happy, rose for love, red for anger and faults, blue for sadness, green for charging, purple for sleepy, orange for curious, white for surprised;
  - a face drawn from data that lives: it blinks, breathes, glances, and blends from one expression into the next.
- **The owner chose that language for the app**, in light and dark themes, following the phone (2026-10-30).
- **The tools in Expo SDK 58.** All but Rive run in Expo Go, so the owner can see each step on a phone without a build:

  | Tool | Version | For |
  |---|---|---|
  | Reanimated, with its worklets | 4.7.1, worklets 0.13.0 | Animation and transitions on the UI thread |
  | Gesture Handler | 3.3 | Gestures |
  | Skia | 2.14.0 | Drawing: glows, shaders, particles |
  | expo-haptics | 58 | Haptics |
  | expo-blur, expo-linear-gradient | 58 | Blur, gradients |
  | Lottie | 7.5 | Animations made in After Effects |
  | Rive | 9.8.6 | Interactive animations; not in Expo Go |
  | Moti | 0.30.0 | A layer over Reanimated; last release 2025-01-29 |

- **Reanimated follows the system's reduce-motion setting by default, by jumping:** a timing or a spring returns its end at once. Entering and layout animations reach their ends at once, and exits and shared transitions are skipped.
- **WCAG 2.2's contrast rules:** text needs 4.5:1 against its background, or 3:1 when large (1.4.3). What identifies a component or its state needs 3:1 (1.4.11). The robot's tones are bright: on near-black they stand out, but most fall short of these ratios on a light background as they are.
- **Vietnamese stacks diacritics** (ặ, ữ, ở), which many fonts set unevenly. Be Vietnam Pro was drawn for Vietnamese by Lâm Bảo, Tony Le and ViệtAnh Nguyễn, under the SIL Open Font License, in weights from 100 to 900. Expo packages it.

## Decision

1. **The robot's visual language:** one tone, glowing, on the app's canvas.
   - The canvas follows the phone: near-black in the dark theme, near-white in the light one.
   - Each tone has a variant for each theme, derived from the robot's colour, so that text and components meet WCAG 2.2 AA in both themes. Tests check every pair.
2. **The tone follows the robot.** The app's accent is the tone of the robot's current expression, cyan while it is not known. It blends from one tone into the next as the robot's face does.
3. **The design is data**, in `src/shared/design/`, as the robot's face is.
   - The tokens: the tones, the canvas and its surfaces in each theme, type (Be Vietnam Pro, on a scale), spacing, corners and glows.
   - The motion tokens: springs and durations for each role (a press, an entrance, an exit, a rearrangement, a change of screen), and the haptics paired with them.
   - Components read tokens; none holds a colour, a size or a duration of its own.
4. **Motion runs on the UI thread.**
   - Reanimated animates and transitions, Gesture Handler takes gestures, Skia draws (glows, the face, particles, shaders), and expo-haptics answers touch.
   - React Native's own `Animated`, and animation loops in JavaScript, are not used.
5. **Motion serves the experience**, by the method of Expo's animation skill, written with Emil Kowalski. Every component follows these rules:
   - **Motion has a budget, set by how often it is seen.**
     - What happens a hundred times a day, such as switching tabs or a toggle in the settings, does not animate.
     - What happens tens of times, such as a press, moves barely, in under 150 ms.
     - Sheets, toasts and the steps of a flow get standard motion.
     - The richest motion is kept for rare moments: set-up, a success, an empty state, the robot's face.
   - **Every motion has a purpose that can be named:** feedback, keeping a place in space, a state, softening a change, an explanation, or delight in the rare moments.
   - **A touch answers within a frame:** with a spring, and with a haptic where the platforms' guidance puts one, not on every touch.
   - **A change of state is not a jump:** things enter, leave and rearrange. Screens change with the native stack's own transitions, never rebuilt by hand.
   - **Waiting is never blank:** the content's shape shimmers, or the tone pulses.
   - **A finger drives a spring:** motion that a gesture starts is a spring, which carries the gesture's speed and can be reversed midway.
   - **Reduce motion ships with each animation.** Movement and scale become short fades, and particles, parallax and loops stop. Haptics follow the system's own setting.
   - **Feel is judged on a release build, on the slowest phone the app supports.**
6. **The robot's face in the app** comes from the same engine as the robot's screen, drawn with Skia. How the repositories share that engine is decided on its own, before the app shows the face.
7. **A studio in the app**, in development builds only, shows every token, component and motion: in both themes, with reduce motion on and off, as the robot's studio does for its face.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Lottie for the animations | Its animations come from After Effects files that designers make. Motion drawn from data, as the robot's face is, takes the robot's tone and the theme. |
| Rive | Interactive animations with state machines. But it does not run in Expo Go, and its editor is one more tool to keep. |
| Moti, a layer over Reanimated | Its last release was in 2025-01. |
| React Native's `Animated` | Parts of it run on the JavaScript thread, which stutters under load. Reanimated runs on the UI thread. |
| Glass, as iOS 26's own apps have | The owner chose the robot's language. |
| A dark theme alone | The owner chose both themes. The tones get variants for a light canvas. |
| Reanimated's own answer to reduce motion, jumping to the end | A jump hides where things came from and went. A short fade keeps that sense without the movement. |
| The phone's own font | It sets Vietnamese unevenly from one phone to another. Be Vietnam Pro was drawn for it. |

## Consequences

- Positive:
  - the app and the robot look and move as one product, and the app shows the robot's mood;
  - motion at the display's frame rate, on the UI thread;
  - accessible: contrast is checked, and reduce motion is honoured;
  - every step runs in Expo Go, on the owner's phone.
- Negative / accepted trade-offs:
  - each component costs more: its motion, its haptics, two themes, reduce motion, and its page in the studio;
  - the light theme needs tone variants of its own;
  - the font's files ship with the app, under the OFL, listed in `THIRD_PARTY_NOTICES.md`;
  - the face waits for a decision across the repositories.
- Follow-up:
  - the design system: the tokens, the motion primitives and the studio, then the home screen redesigned on them;
  - sharing the face's engine between ai-robot and ai-app;
  - the robot's expression reaching the app, through the cloud, in the app ⇄ cloud protocol;
  - for ai-robot to decide: Be Vietnam Pro on the robot's screen too.

## References

Retrieved 2026-10-30:

- ai-robot's [tones](https://github.com/trungnguyen278/ai-robot/blob/main/ui/src/tones.js) and [renderer settings](https://github.com/trungnguyen278/ai-robot/blob/main/ui/src/settings.js).
- Expo SDK 58's versions of its libraries: `expo/bundledNativeModules.json`, in `expo` 58.0.21.
- The libraries on GitHub: [Reanimated](https://github.com/software-mansion/react-native-reanimated) (4.7.1, 2026-10-02), [Skia](https://github.com/Shopify/react-native-skia), [Lottie](https://github.com/lottie-react-native/lottie-react-native), [Rive](https://github.com/rive-app/rive-react-native) (9.8.6, 2026-10-15), [Moti](https://github.com/nandorojo/moti) (0.30.0, 2025-01-29).
- [Reanimated's accessibility guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/): reduce motion.
- [Expo's animation skill](https://github.com/expo/skills/tree/main/plugins/expo/skills/expo-animation), written with Emil Kowalski: the motion budget, purposes, tools and springs.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), success criteria 1.4.3 and 1.4.11.
- Be Vietnam Pro: [Google Fonts' metadata](https://github.com/google/fonts/blob/main/ofl/bevietnampro/METADATA.pb), [its repository](https://github.com/bettergui/BeVietnamPro), and [`@expo-google-fonts/be-vietnam-pro`](https://www.npmjs.com/package/@expo-google-fonts/be-vietnam-pro) (0.4.1).
