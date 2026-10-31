// SPDX-License-Identifier: MIT
import { useText } from '@/src/shared/catalog';
import { Screen, useDesign, type Appearance, type MotionPreference } from '@/src/shared/design';

import { Choice, LinkRow, Row, Section, ToneChoice } from './parts';

const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];
const MOTIONS: readonly MotionPreference[] = ['system', 'full', 'reduced'];

/**
 * The studio's first page: the appearance, the motion and the tone to look with, and the
 * other pages.
 */
export function StudioScreen() {
  const text = useText();
  const { appearance, setAppearance, motion, setMotion } = useDesign();
  const appearances = APPEARANCES.map((value) => ({
    value,
    label: text(`studio.appearance.${value}`),
  }));
  const motions = MOTIONS.map((value) => ({ value, label: text(`studio.motion.${value}`) }));
  return (
    <Screen scroll>
      <Section title={text('studio.appearance')}>
        <Row>
          <Choice options={appearances} value={appearance} onChange={setAppearance} />
        </Row>
      </Section>
      <Section title={text('studio.motion')}>
        <Row>
          <Choice options={motions} value={motion} onChange={setMotion} />
        </Row>
      </Section>
      <Section title={text('studio.tone')}>
        <Row>
          <ToneChoice />
        </Row>
      </Section>
      <Section title={text('studio.pages')}>
        <LinkRow href="/studio/colors" label={text('studio.colors')} />
        <LinkRow href="/studio/type" label={text('studio.type')} />
        <LinkRow href="/studio/layout" label={text('studio.layout')} />
        <LinkRow href="/studio/components" label={text('studio.components')} />
        <LinkRow href="/studio/motion" label={text('studio.motion')} />
      </Section>
    </Screen>
  );
}
