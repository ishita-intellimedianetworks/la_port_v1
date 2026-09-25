"use client";

import { Container } from "@react-three/uikit";
import { useSite } from "@/config/context";
import type { HotspotField } from "@/config/schema";
import type { VrCardProps } from "../bridge";
import {
  ALPHA,
  CardHeader,
  CardShell,
  Grid,
  HAIRLINE,
  INK,
  Journey,
  Meter,
  Rule,
  Scroll,
  TONE,
  formatValue,
  meterOf,
  px,
} from "../ui/card-kit";
import { VrText } from "../ui/text";

function Field({ field }: { field: HotspotField }) {
  const tone = useSite().toneFor(field.value, field.tone);
  const meter = meterOf(field);
  const color = field.pending
    ? INK.text
    : field.type === "enum" && tone
      ? TONE[tone]
      : INK.text;
  return (
    <Container
      flexDirection="column"
      paddingY={px(7)}
      borderBottomWidth={1}
      borderColor={HAIRLINE}
    >
      <VrText fontSize={px(11.5)} fontWeight="medium" color={INK.text} opacity={ALPHA.faint}>
        {field.label}
      </VrText>
      <VrText
        fontSize={px(15)}
        fontWeight="semi-bold"
        color={color}
        opacity={field.pending ? ALPHA.faint : 1}
      >
        {formatValue(field)}
      </VrText>
      {meter !== null && <Meter value={meter} color={tone ? TONE[tone] : INK.accentBright} />}
    </Container>
  );
}

export function SimpleHotspotCard({ destId, index, onClose }: VrCardProps) {
  const site = useSite();
  const layout = site.layoutById[destId];
  const hotspotId = layout?.hotspots[index - 1];
  const hotspot = hotspotId ? site.hotspotById[hotspotId] : undefined;
  if (!hotspot || !layout) return null;

  return (
    <CardShell width="32%" maxHeight="36%" onDismiss={onClose}>
      <CardHeader title={hotspot.popupTitle} subtitle={layout.name} onClose={onClose} />
      <Container marginTop={px(12)} flexDirection="column" flexShrink={1} minHeight={0}>
        <Scroll>
          {hotspot.journey && <Journey title={site.ui.popup.journeyTitle} steps={hotspot.journey} />}
          <Rule />
          <Container paddingTop={px(4)} flexShrink={0}>
            <Grid columns={2} gapX={px(32)}>
              {hotspot.fields.map((f) => (
                <Field key={f.name} field={f} />
              ))}
            </Grid>
          </Container>
        </Scroll>
      </Container>
    </CardShell>
  );
}
