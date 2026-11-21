// SPDX-License-Identifier: MIT
// Intl as Hermes builds it on a phone, made from Node's: the same constructors and methods, and
// none of the others, so that a test fails where the app would call what a phone lacks (ADR-0008).
// Read from Hermes's `lib/VM/JSLib/Intl.cpp` at `hermes-v260318099.0.5`, the Hermes of React
// Native 0.88.1 (`sdks/.hermesv1version`), on 2026-11-21: `createIntlObject` defines
// getCanonicalLocales, Collator, DateTimeFormat and NumberFormat, and NumberFormat's
// formatToParts only where `__APPLE__` is not defined.

export type Platform = 'android' | 'ios';
export const PLATFORMS: readonly Platform[] = ['android', 'ios'];

type Native = Intl.Collator | Intl.DateTimeFormat | Intl.NumberFormat;
type Constructor = {
  new (locales?: unknown, options?: unknown): Native;
  supportedLocalesOf(locales: unknown, options?: unknown): string[];
};

/** The methods of each constructor's prototype that Hermes defines, on each platform. */
const METHODS: Record<
  'Collator' | 'DateTimeFormat' | 'NumberFormat',
  Record<Platform, string[]>
> = {
  Collator: {
    android: ['compare', 'resolvedOptions'],
    ios: ['compare', 'resolvedOptions'],
  },
  DateTimeFormat: {
    android: ['format', 'formatToParts', 'resolvedOptions'],
    ios: ['format', 'formatToParts', 'resolvedOptions'],
  },
  NumberFormat: {
    android: ['format', 'formatToParts', 'resolvedOptions'],
    ios: ['format', 'resolvedOptions'],
  },
};

/** The getters that give a bound function, as ECMA-402 defines `compare` and `format`. */
const BOUND = new Set(['compare', 'format']);

/** `Native`'s constructor with only `methods` on its prototype, each calling Node's. */
function shaped(Native: Constructor, methods: readonly string[]): Constructor {
  type Methods = Record<string, (...args: unknown[]) => unknown>;
  const natives = new WeakMap<object, Methods>();
  // Another object as `this` throws a TypeError, as in Hermes, by reading a method of undefined.
  const of = (self: object) => natives.get(self) as Methods;
  class Shaped {
    constructor(locales?: unknown, options?: unknown) {
      natives.set(this, new Native(locales, options) as never);
    }
    static supportedLocalesOf(locales: unknown, options?: unknown): string[] {
      return Native.supportedLocalesOf(locales, options);
    }
  }
  for (const name of methods) {
    Object.defineProperty(
      Shaped.prototype,
      name,
      BOUND.has(name)
        ? {
            get(this: object) {
              const native = of(this);
              return (...args: unknown[]) => native[name](...args);
            },
            configurable: true,
          }
        : {
            value(this: object, ...args: unknown[]) {
              return of(this)[name](...args);
            },
            writable: true,
            configurable: true,
          },
    );
  }
  return Shaped as unknown as Constructor;
}

/** Intl as Hermes builds it on `platform`, from `intl`'s constructors. */
export function hermesIntl(platform: Platform, intl: typeof Intl = Intl): typeof Intl {
  const built: Record<string | symbol, unknown> = {
    getCanonicalLocales: (locales?: string | readonly string[]) =>
      intl.getCanonicalLocales(locales),
    [Symbol.toStringTag]: 'Intl',
  };
  for (const [name, methods] of Object.entries(METHODS)) {
    built[name] = shaped(intl[name as keyof typeof METHODS] as Constructor, methods[platform]);
  }
  return built as unknown as typeof Intl;
}

/** Runs code with `Intl` as Hermes builds it on one platform. */
export class Hermes {
  /** The Intl it runs with, which polyfills that it loads change. */
  readonly intl: typeof Intl;

  constructor(platform: Platform) {
    this.intl = hermesIntl(platform);
  }

  /** `run`'s result, with this Intl as `Intl` while it runs, and Node's after. */
  run<T>(run: () => T): T {
    const node = globalThis.Intl;
    globalThis.Intl = this.intl;
    try {
      return run();
    } finally {
      globalThis.Intl = node;
    }
  }

  /**
   * The module at `path`, loaded anew with this Intl, in modules of its own: those loaded
   * before may have found Node's Intl wanting, and changed it.
   */
  load<T extends object>(path: string): T {
    return this.run(() => {
      let loaded: T | undefined;
      jest.isolateModules(() => {
        loaded = jest.requireActual<T>(path);
      });
      return loaded as T;
    });
  }
}
