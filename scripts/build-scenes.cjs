#!/usr/bin/env node
/**
 * build-scenes — projects our port data onto the shape the reference engine
 * reads (`src/shared/scene-data/scenes.json`).
 *
 * The mapping is direct, because the two models agree: the reference's
 * `Destination` is one saved `camera` plus a list of `hotspots[]` markers that
 * share it, which is exactly the handoff's Layout + hotspots[]. So
 *
 *     layout  ->  destination   (its camera, grouped under its zone)
 *     hotspot ->  destination.hotspots[i]   (a marker only)
 *
 * The files under src/config stay the source of truth; this file
 * is generated and should never be hand-edited.
 *
 * Usage:  node scripts/build-scenes.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "src/config");
const OUT = path.join(ROOT, "src/shared/scene-data/scenes.json");

const scene = JSON.parse(fs.readFileSync(path.join(DATA, "scene.json"), "utf8"));
const layouts = JSON.parse(fs.readFileSync(path.join(DATA, "layouts.json"), "utf8")).layouts;
const hotspots = JSON.parse(fs.readFileSync(path.join(DATA, "hotspots.json"), "utf8")).hotspots;
const ui = JSON.parse(fs.readFileSync(path.join(DATA, "ui.json"), "utf8"));

const byId = Object.fromEntries(hotspots.map((h) => [h.id, h]));
const round = (v) => Math.round(v * 10000) / 10000;

/**
 * Our layout cameras are stored as position + target (handoff §4). The engine
 * applies a YXZ euler, so convert here.
 *
 * Three.js cameras look down -Z, making forward
 * `(-cos(pitch)sin(yaw), sin(pitch), -cos(pitch)cos(yaw))`; inverting it gives
 * `yaw = atan2(-dx, -dz)`. Dropping those minus signs aims every camera 180°
 * away from its subject.
 */
function rotationLookingAt(position, target, eyeOffset) {
  const dx = target[0] - position[0];
  const dy = target[1] - (position[1] + eyeOffset);
  const dz = target[2] - position[2];
  const flat = Math.hypot(dx, dz);
  return [round(Math.atan2(dy, flat)), round(Math.atan2(-dx, -dz)), 0];
}

// Zones become the engine's destination categories.
const pois = {};
for (const layout of layouts) {
  const aerial = layout.walkable === false;
  const eyeOffset = aerial ? 0 : scene.world.eyeHeight;

  const destination = {
    id: layout.id,
    label: layout.name,
    note: layout.description,
    open: true,
    option: ui.zones[layout.zone]?.label ?? layout.zone,
    camera: {
      position: layout.camera.position.map(round),
      rotation: rotationLookingAt(layout.camera.position, layout.camera.target, eyeOffset),
    },
    // Every marker in this layout shares the camera above — the engine routes
    // a tap on any of them back to it.
    hotspots: layout.hotspots.map((id) => {
      const h = byId[id];
      return {
        position: h.position.map(round),
        rotation: h.rotation.map(round),
        label: `${h.id} · ${h.name}`,
      };
    }),
    showHsIn3d: true,
  };

  // Elevated overview poses keep their authored height instead of dropping to
  // the navmesh, and are not walked to.
  if (aerial) {
    destination.exactPose = true;
    destination.teleportOnly = true;
  }

  (pois[layout.zone] ??= []).push(destination);
}

const out = {
  label: scene.meta.label,
  speed: scene.world.walkSpeed,
  dollHouseCamera: scene.cameras.dollhouse,
  entry: scene.cameras.entry,
  scenes: [
    {
      key: "terminal",
      label: scene.meta.label,
      url: scene.assets.modelUrl,
      previewUrl: scene.assets.previewUrl,
      navmeshUrl: scene.assets.navmeshUrl,
      floorplanUrl: scene.assets.floorplanUrl,
      eyeHeight: scene.world.eyeHeight,
      startPosition: scene.cameras.start.position,
      startRotation: scene.cameras.start.rotation,
      shadows: scene.world.shadows,
      // The navmesh is a clean single-surface Recast export, so the engine's
      // height-band / slope sanitation (built for a polluted stadium mesh)
      // would only reject legitimate routes here.
      routeSanitize: false,
      clickSnapToNav: true,
      hsSize: 0.6,
      lights: scene.lights,
      pois,
    },
  ],
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

const destCount = Object.values(pois).reduce((a, v) => a + v.length, 0);
const markerCount = Object.values(pois)
  .flat()
  .reduce((a, d) => a + d.hotspots.length, 0);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${Object.keys(pois).length} categories, ${destCount} destinations, ${markerCount} markers`);
for (const [zone, list] of Object.entries(pois)) {
  console.log(`  ${zone.padEnd(10)} ${list.map((d) => d.id).join(" ")}`);
}
