// SPDX-License-Identifier: MIT
import { useText } from '@/src/shared/catalog';
import { Screen, useDesign, type Appearance } from '@/src/shared/design';

import { ROBOT_TONES } from '../tones';
import { Choice, ColorChoice, LinkRow, Row, Section } from './parts';

const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];

/** The studio's first page: the appearance and the tone to look with, and the other pages. */
export function StudioScreen() {
  const text = useText();
  const { appearance, setAppearance, tone, setTone } = useDesign();
  const appearances = APPEARANCES.map((value) => ({
    value,
    label: text(`studio.appearance.${value}`),
  }));
  const tones = Object.entries(ROBOT_TONES).map(([name, value]) => ({
    value,
    label: text(`studio.tone.${name}`),
  }));
  return (
    <Screen scroll>
      <Section title={text('studio.appearance')}>
        <Row>
          <Choice options={appearances} value={appearance} onChange={setAppearance} />
        </Row>
      </Section>
      <Section title={text('studio.tone')}>
        <Row>
          <ColorChoice options={tones} value={tone} onChange={setTone} />
        </Row>
      </Section>
      <Section title={text('studio.pages')}>
        <LinkRow href="/studio/colors" label={text('studio.colors')} />
        <LinkRow href="/studio/type" label={text('studio.type')} />
        <LinkRow href="/studio/layout" label={text('studio.layout')} />
      </Section>
    </Screen>
  );
}
