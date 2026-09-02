"use client";

/**
 * Step 7 — the whole look: sky, lights, shadows and the colour grade.
 *
 * This is the `?debug=true` panel's job, done against the draft instead of
 * against a live store that has to be transcribed afterwards. That transcription
 * is the failure it removes: the debug panel drives three separate stores and
 * ends a session with three read-outs to copy into `site.json`, at least one of
 * which is stale by the time the third is pasted. Here the sliders ARE the file.
 *
 * ONE PANEL FOR ALL FOUR GROUPS, deliberately. You cannot judge sun intensity
 * without the exposure in front of you: they trade against each other
 * constantly, and the two live in different subsystems (a light's intensity, a
 * renderer uniform) with no reason to be dialled apart.
 *
 * THE MERGE ORDER MATTERS AND IS SHOWN. `sky.lights` is merged OVER `lights` at
 * render time, so an intensity set in the Lights group below is simply ignored
 * while the same key exists in the Sky group. Rather than hide that, the Lights
 * group marks the overridden rows and offers to clear the override — which is
 * the actual fix, and the one that is invisible when editing the JSON by hand.
 */

import type { SiteConfig } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import type { SkyLights } from "../schema-ext";
import { Button, ColorField, Group, Note, Panel, Row, Select, Slider, TextField, Toggle, Vec3Field } from "../ui";

/** Intensities the sky block may override. Colours and the sun direction are
 *  DERIVED from the sky palette every frame, so they are never authored here —
 *  see the `_note` on `site.json > sky`. */
const OVERRIDABLE = [
  "sunIntensity",
  "ambientIntensity",
  "hemiIntensity",
  "envIntensity",
] as const;

type Overridable = (typeof OVERRIDABLE)[number];

const SKY_MODES = [
  { value: "afternoon", label: "afternoon — the shipped stop" },
  { value: "day", label: "day — flat midday" },
  { value: "dusk", label: "dusk — sunset palette" },
  { value: "off", label: "off — flat background colour" },
] as const;

export function LightingStep() {
  const draft = useDraftStore((s) => s.draft);
  const update = useDraftStore((s) => s.update);

  const lights = draft.lights;
  const sky = draft.sky;
  const skyLights = (sky?.lights ?? {}) as SkyLights;
  const grade = draft.world.grade ?? {};
  const shadows = draft.world.shadows;
  const envFile = draft.assets.envFile;

  /** Continuous edits — sliders and colour pickers — collapse into one undo
   *  step per gesture rather than one per pixel of travel. */
  const live = (recipe: (draft: SiteConfig) => void) => update(recipe, { history: false });

  const setLight = <K extends keyof SiteConfig["lights"]>(key: K, value: SiteConfig["lights"][K]) =>
    live((d) => {
      d.lights[key] = value;
    });

  const setSky = (recipe: (sky: NonNullable<SiteConfig["sky"]>) => void) =>
    live((d) => {
      d.sky ??= { mode: "afternoon" };
      recipe(d.sky);
    });

  const setSkyLight = (key: Overridable | "envRotation", value: number) =>
    setSky((s) => {
      const target = (s.lights ??= {}) as SkyLights;
      target[key] = value;
    });

  const clearSkyLight = (key: Overridable) =>
    update((d) => {
      if (d.sky?.lights) delete (d.sky.lights as SkyLights)[key];
    });

  const setGrade = (key: "exposure" | "brightness" | "contrast" | "saturation", value: number) =>
    live((d) => {
      d.world.grade ??= {};
      d.world.grade[key] = Math.round(value * 1000) / 1000;
    });

  /** A row that is being overridden by the sky says so, and offers the fix. */
  const overrideBadge = (key: Overridable) =>
    skyLights[key] !== undefined ? (
      <button
        type="button"
        className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300 hover:bg-amber-500/25"
        title={`site.json > sky.lights.${key} is merged over this value at render time. Click to remove the override.`}
        onClick={() => clearSkyLight(key)}
      >
        overridden — clear
      </button>
    ) : null;

  return (
    <Panel
      title="7 · Lighting"
      description="Sky, lights, shadows and the grade, applied to the viewport as you move them. This is the ?debug=true panel writing straight to the file."
    >
      <Group title="Sky">
        <Row label="Mode" hint="the stop on the day arc">
          <Select
            value={sky?.mode ?? "off"}
            options={SKY_MODES}
            onChange={(mode) => setSky((s) => { s.mode = mode; })}
          />
        </Row>
        <Row label="Time of day" hint="t — 0 sun on the horizon, 1 high midday">
          <Slider
            value={sky?.t ?? 0.55}
            min={0}
            max={1}
            step={0.01}
            onChange={(t) => setSky((s) => { s.t = Math.round(t * 1000) / 1000; })}
          />
        </Row>
        <div className="pt-1">
          <Toggle
            checked={sky?.clouds ?? true}
            label="Horizon cloud band (the only per-pixel cost in the sky shader)"
            onChange={(clouds) => setSky((s) => { s.clouds = clouds; })}
          />
        </div>

        <div className="pt-2">
          <Toggle
            checked={!!sky?.sun}
            label="Park the sun off the day arc"
            onChange={(on) =>
              update((d) => {
                d.sky ??= { mode: "afternoon" };
                if (on) d.sky.sun = { azimuth: -158, elevation: 18 };
                else delete d.sky.sun;
              })
            }
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            The disk in the dome and the shadow-casting light read one answer, so they cannot
            disagree. It moves no colour — every stop stays a function of the elevation{" "}
            <code className="font-mono">t</code> gives, which is what makes this the only way to
            turn the shadows without repainting the sky.
          </p>
        </div>

        {sky?.sun && (
          <>
            <Row label="Sun azimuth" hint="degrees — bearing">
              <Slider
                value={sky.sun.azimuth}
                min={-180}
                max={180}
                step={1}
                suffix="°"
                onChange={(azimuth) => setSky((s) => { if (s.sun) s.sun.azimuth = azimuth; })}
              />
            </Row>
            <Row label="Sun elevation" hint="degrees above the horizon">
              <Slider
                value={sky.sun.elevation}
                min={-10}
                max={90}
                step={1}
                suffix="°"
                onChange={(elevation) => setSky((s) => { if (s.sun) s.sun.elevation = elevation; })}
              />
            </Row>
          </>
        )}
      </Group>

      <Group title="Sky intensities — merged OVER the lights below">
        <p className="text-[11px] leading-relaxed text-slate-500">
          How strongly the model is lit at this hour. The sky shader has no opinion on it — it is a
          shader with no scene lights at all — so these four are authored rather than derived, and
          they win over the same keys in the next group.
        </p>
        {OVERRIDABLE.map((key) => (
          <Row key={key} label={key}>
            <div className="flex items-center gap-2">
              <span className="flex-1">
                <Slider
                  value={skyLights[key] ?? (lights[key] as number | undefined) ?? 0}
                  min={0}
                  max={key === "sunIntensity" ? 20 : 5}
                  step={0.05}
                  onChange={(value) => setSkyLight(key, value)}
                />
              </span>
              {skyLights[key] !== undefined && (
                <Button small tone="ghost" onClick={() => clearSkyLight(key)} title="Fall back to the lights block">
                  ✕
                </Button>
              )}
            </div>
          </Row>
        ))}
        <Row label="envRotation" hint="HDRI yaw, degrees — lines the photographed sun up with this one">
          <Slider
            value={skyLights.envRotation ?? 0}
            min={0}
            max={360}
            step={1}
            suffix="°"
            onChange={(value) => setSkyLight("envRotation", value)}
          />
        </Row>
      </Group>

      <Group title="Lights">
        <Row label="Ambient" hint={overrideBadge("ambientIntensity")}>
          <Slider
            value={lights.ambientIntensity}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => setLight("ambientIntensity", v)}
          />
        </Row>
        <Row label="Ambient colour">
          <ColorField value={lights.ambientColor} onChange={(v) => setLight("ambientColor", v)} />
        </Row>
        <Row
          label="Sky fill"
          hint={<>hemisphere — keeps the away-from-sun side off black{overrideBadge("hemiIntensity")}</>}
        >
          <Slider
            value={lights.hemiIntensity ?? 0}
            min={0}
            max={5}
            step={0.05}
            onChange={(v) => setLight("hemiIntensity", v)}
          />
        </Row>
        <Row label="Env HDRI" hint="assets.envFile — the same map the terminal loads">
          <TextField
            value={envFile}
            mono
            onChange={(next) =>
              update((d) => {
                d.assets.envFile = next;
              })
            }
          />
        </Row>
        <Row label="Env intensity" hint={overrideBadge("envIntensity")}>
          <Slider
            value={lights.envIntensity}
            min={0}
            max={4}
            step={0.05}
            onChange={(v) => setLight("envIntensity", v)}
          />
        </Row>
        <Row label="Sun" hint={overrideBadge("sunIntensity")}>
          <Slider
            value={lights.sunIntensity}
            min={0}
            max={20}
            step={0.1}
            onChange={(v) => setLight("sunIntensity", v)}
          />
        </Row>
        <Row label="Sun colour">
          <ColorField value={lights.sunColor} onChange={(v) => setLight("sunColor", v)} />
        </Row>
        <Row label="Sun direction" hint="un-normalised; normalised at runtime">
          <Vec3Field
            value={lights.sunDirection}
            step={0.1}
            onChange={(sunDirection) => setLight("sunDirection", sunDirection)}
          />
        </Row>

        {OVERRIDABLE.some((key) => skyLights[key] !== undefined) && (
          <Note>
            {OVERRIDABLE.filter((key) => skyLights[key] !== undefined).join(", ")} —{" "}
            {OVERRIDABLE.filter((key) => skyLights[key] !== undefined).length === 1 ? "is" : "are"}{" "}
            set in the sky block above and merged over the value here, so moving the slider in this
            group will not change the picture. Clear the override there, or dial it there instead.
          </Note>
        )}
      </Group>

      <Group title="Shadows">
        <Row label="Cast shadows" hint="world.shadows — the master switch every row below hangs off">
          <Toggle
            checked={shadows}
            label={shadows ? "On" : "Off — nothing below has any effect"}
            onChange={(next) =>
              update((d) => {
                d.world.shadows = next;
              })
            }
          />
        </Row>
        <Row label="Map size" hint="square resolution">
          <Select
            value={String(lights.shadowMapSize)}
            options={[512, 1024, 2048, 4096].map((n) => ({ value: String(n), label: `${n}²` }))}
            onChange={(v) => setLight("shadowMapSize", Number(v))}
          />
        </Row>
        <Row label="Softening radius">
          <Slider value={lights.shadowRadius} min={0} max={8} step={0.1} onChange={(v) => setLight("shadowRadius", v)} />
        </Row>
        <Row label="Depth bias">
          <Slider value={lights.shadowBias} min={-0.01} max={0.01} step={0.0001} onChange={(v) => setLight("shadowBias", v)} />
        </Row>
        <Row label="Normal bias">
          <Slider value={lights.shadowNormalBias} min={0} max={8} step={0.05} onChange={(v) => setLight("shadowNormalBias", v)} />
        </Row>
        <Row label="Follow extent" hint="half-width of the shadowed square while walking">
          <Slider
            value={lights.shadowFollowExtent ?? 420}
            min={20}
            max={1200}
            step={10}
            onChange={(v) => setLight("shadowFollowExtent", v)}
          />
        </Row>
      </Group>

      <Group title="Grade">
        <Note>
          <strong>Exposure is the free knob.</strong> It multiplies the scene in HDR before tone
          mapping, so highlights roll off instead of clipping, and it costs nothing — it is a
          uniform in a step three.js already runs. The other three are a CSS filter over the
          finished 8-bit image: a full-screen composite pass every frame, and prone to banding.
          Setting all three to exactly 0 removes that pass entirely, which is not the same as
          setting them to 1.
        </Note>
        <Row label="Exposure" hint="multiplier, 1 = untouched">
          <Slider value={grade.exposure ?? 1} min={0.1} max={3} step={0.01} onChange={(v) => setGrade("exposure", v)} />
        </Row>
        <Row label="Brightness" hint="offset, 0 = untouched">
          <Slider value={grade.brightness ?? 0} min={-0.5} max={0.5} step={0.01} onChange={(v) => setGrade("brightness", v)} />
        </Row>
        <Row label="Contrast">
          <Slider value={grade.contrast ?? 0} min={-0.5} max={0.5} step={0.01} onChange={(v) => setGrade("contrast", v)} />
        </Row>
        <Row label="Saturation">
          <Slider value={grade.saturation ?? 0} min={-1} max={1} step={0.01} onChange={(v) => setGrade("saturation", v)} />
        </Row>
        <div className="flex gap-2 pt-1">
          <Button
            small
            onClick={() =>
              update((d) => {
                d.world.grade = { exposure: 1, brightness: 0, contrast: 0, saturation: 0 };
              })
            }
            title="All three LDR knobs at 0 removes the full-screen composite pass"
          >
            Neutral (and free)
          </Button>
        </div>
      </Group>
    </Panel>
  );
}
