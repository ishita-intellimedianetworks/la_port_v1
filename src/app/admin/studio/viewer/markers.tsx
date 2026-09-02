"use client";

/**
 * Everything the draft describes, drawn in the viewport: the three scene
 * cameras, each layout's marker and its camera, and every hotspot bead.
 *
 * A marker is the SELECTION HANDLE as much as it is a picture — clicking one
 * makes it the current selection, which is what the transform gizmo attaches
 * to and what "Set from view" writes into. So the set drawn here and the set
 * the step panels list are the same set, and there is no third place holding
 * an id.
 *
 * SIZE IS IN WORLD UNITS, off `viewer.markerScale`. The terminal is ~2 km
 * across and authored 1:1 in metres, so there is no constant that reads both
 * from the dollhouse vantage and from the quay. The runtime solves this by
 * scaling markers to a constant SCREEN size, which is the wrong answer for
 * authoring — you cannot judge whether a bead sits on the crane if it is
 * redrawn at 40 px whatever the distance.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/config/schema";
import { useDraftStore } from "../draft-store";
import { isPlaceholder, poseForCamera } from "../pose";
import { sameSelection, useViewerStore, type Selection } from "../viewer-store";

/**
 * Selected markers go white; everything else keeps its own colour, so the
 * selection reads at a glance without a second highlight object.
 *
 * Deliberately COOL AND FEW. An earlier pass gave scene cameras a hot pink and
 * drew their view rays six marker-widths long, which on a scene with forty
 * other markers read as a haze over the model rather than as three cameras.
 * Nothing here should compete with the geometry being judged: the model is the
 * subject, these are annotations on it.
 */
const SELECTED = "#ffffff";
const CAMERA_COLOUR = "#38bdf8";
const SCENE_CAMERA_COLOUR = "#e2e8f0";
const LAYOUT_COLOUR = "#facc15";

/**
 * A camera, drawn as a stub frustum plus its view ray.
 *
 * The group is seated with the pose's YXZ euler and the cone is then turned to
 * lie along the group's own -Z, which is the direction a three.js camera looks.
 * Get that wrong and every gizmo in the scene points backwards — the same
 * class of mistake `pose.ts` exists to keep out of the numbers.
 */
function CameraGizmo({
  position,
  rotation,
  size,
  colour,
  onSelect,
}: {
  position: Vec3;
  rotation: Vec3;
  size: number;
  colour: string;
  onSelect: () => void;
}) {
  return (
    <group
      position={position}
      rotation={new THREE.Euler(rotation[0], rotation[1], rotation[2], "YXZ")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -size * 0.4]}>
        <coneGeometry args={[size * 0.35, size, 4]} />
        <meshBasicMaterial color={colour} wireframe />
      </mesh>
      {/* The view ray, so the aim reads from any angle. Short and thin: it
          says which way, it is not trying to reach what is being looked at. */}
      <mesh position={[0, 0, -size * 1.4]}>
        <boxGeometry args={[size * 0.03, size * 0.03, size * 2]} />
        <meshBasicMaterial color={colour} />
      </mesh>
      {/* A solid core, so a gizmo seen end-on still reads. */}
      <mesh>
        <sphereGeometry args={[size * 0.2, 8, 8]} />
        <meshBasicMaterial color={colour} />
      </mesh>
    </group>
  );
}

function Bead({
  position,
  size,
  colour,
  onSelect,
}: {
  position: Vec3;
  size: number;
  colour: string;
  onSelect: () => void;
}) {
  return (
    <mesh
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <sphereGeometry args={[size * 0.55, 12, 12]} />
      <meshBasicMaterial color={colour} />
    </mesh>
  );
}

export function StudioMarkers() {
  const draft = useDraftStore((s) => s.draft);
  const scale = useViewerStore((s) => s.markerScale);
  const selection = useViewerStore((s) => s.selection);
  const select = useViewerStore((s) => s.select);
  const showLayouts = useViewerStore((s) => s.showLayouts);
  const showHotspots = useViewerStore((s) => s.showHotspots);
  const showSceneCameras = useViewerStore((s) => s.showSceneCameras);

  const is = (candidate: Selection) => sameSelection(selection, candidate);

  /** Resolve every authored camera ONCE per draft change rather than per
   *  frame — the XYZ→YXZ reorder is a quaternion round-trip and there are up
   *  to forty of them. */
  const layoutPoses = useMemo(
    () => draft.layouts.map((layout) => ({ layout, pose: poseForCamera(layout.camera) })),
    [draft.layouts],
  );

  const hotspotPoses = useMemo(
    () =>
      draft.hotspots.map((hotspot) => ({
        hotspot,
        pose: hotspot.camera ? poseForCamera(hotspot.camera) : null,
      })),
    [draft.hotspots],
  );

  /** Each bead takes its parent layout's ZONE colour — the same colour the
   *  Resources panel files it under, so "which zone is this cluster?" is
   *  answerable without opening a panel. */
  const zoneColour = useMemo(() => {
    const byLayout: Record<string, string> = {};
    for (const layout of draft.layouts) {
      byLayout[layout.id] = draft.zones[layout.zone]?.color ?? LAYOUT_COLOUR;
    }
    return byLayout;
  }, [draft.layouts, draft.zones]);

  return (
    <group name="studio-markers">
      {showSceneCameras &&
        (["dollhouse", "spawn", "firstPerson"] as const).map((id) => {
          const pose = draft.cameras[id];
          if (!pose || isPlaceholder(pose.position)) return null;
          return (
            <CameraGizmo
              key={id}
              position={pose.position}
              rotation={pose.rotation}
              size={scale * 1.6}
              colour={is({ kind: "sceneCamera", id }) ? SELECTED : SCENE_CAMERA_COLOUR}
              onSelect={() => select({ kind: "sceneCamera", id })}
            />
          );
        })}

      {showLayouts &&
        layoutPoses.map(({ layout, pose }) => (
          <group key={layout.id}>
            {!isPlaceholder(layout.position) && (
              <Bead
                position={layout.position}
                size={scale * 0.8}
                colour={
                  is({ kind: "layout", id: layout.id, part: "position" })
                    ? SELECTED
                    : zoneColour[layout.id] ?? LAYOUT_COLOUR
                }
                onSelect={() => select({ kind: "layout", id: layout.id, part: "position" })}
              />
            )}
            {!isPlaceholder(pose.position) && (
              <CameraGizmo
                position={pose.position}
                rotation={pose.rotation}
                size={scale}
                colour={
                  is({ kind: "layout", id: layout.id, part: "camera" }) ? SELECTED : CAMERA_COLOUR
                }
                onSelect={() => select({ kind: "layout", id: layout.id, part: "camera" })}
              />
            )}
          </group>
        ))}

      {showHotspots &&
        hotspotPoses.map(({ hotspot, pose }) => (
          <group key={hotspot.id}>
            {!isPlaceholder(hotspot.position) && (
              <Bead
                position={hotspot.position}
                size={scale * 0.5}
                colour={
                  is({ kind: "hotspot", id: hotspot.id, part: "position" })
                    ? SELECTED
                    : zoneColour[hotspot.layoutId] ?? LAYOUT_COLOUR
                }
                onSelect={() => select({ kind: "hotspot", id: hotspot.id, part: "position" })}
              />
            )}
            {/* Only hotspots given a camera OF THEIR OWN draw one. An
                unauthored hotspot is viewed from its layout's camera, and a
                duplicate gizmo sitting there would imply a second pose
                exists — which is exactly the drift the fallback avoids. */}
            {pose && !isPlaceholder(pose.position) && (
              <CameraGizmo
                position={pose.position}
                rotation={pose.rotation}
                size={scale * 0.7}
                colour={
                  is({ kind: "hotspot", id: hotspot.id, part: "camera" }) ? SELECTED : CAMERA_COLOUR
                }
                onSelect={() => select({ kind: "hotspot", id: hotspot.id, part: "camera" })}
              />
            )}
          </group>
        ))}
    </group>
  );
}
