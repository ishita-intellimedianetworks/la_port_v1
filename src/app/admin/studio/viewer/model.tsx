"use client";

/**
 * The model in the studio viewer: whatever GLB the Scene step points at,
 * with every baked clip playing.
 *
 * Loaded IMPERATIVELY rather than through drei's `useGLTF`. Three reasons, all
 * of them specific to a tool:
 *
 *   - the model is routinely ABSENT. A checkout streams chunks and ships no
 *     whole-zone GLB under `public/`, so "file not found" is an ordinary state
 *     the panel has to report, not an error boundary to fall off.
 *   - the source changes at the user's whim, including to a `blob:` URL from
 *     the file picker, and useGLTF's cache is keyed on the URL forever.
 *   - the studio has to DISPOSE what it replaces. A session that loads four
 *     candidate bakes would otherwise hold all four on the GPU.
 *
 * The loader is configured exactly like the streamer's (`chunk-manager.ts`):
 * Draco from `/draco/`, KTX2 from `/basis/`, meshopt. A bake compressed for
 * the runtime therefore opens here without re-exporting it.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame, useStore } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { useViewerStore } from "../viewer-store";

/** One loader for the page. Building a DRACOLoader spins up a worker pool, so
 *  a fresh one per load would leak workers on every model swap. */
let _loader: GLTFLoader | null = null;
function gltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (_loader) return _loader;
  const draco = new DRACOLoader().setDecoderPath("/draco/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  try {
    loader.setKTX2Loader(new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer));
  } catch {
    // A GPU with no supported transcode target — the bake's WebP rungs still
    // load, so this is worth continuing without.
  }
  loader.setMeshoptDecoder(MeshoptDecoder as unknown as Parameters<GLTFLoader["setMeshoptDecoder"]>[0]);
  _loader = loader;
  return loader;
}

/** Free every GPU resource a discarded scene owned. Geometries and textures are
 *  not reference-counted by three, so dropping the object graph alone leaks
 *  both. */
function disposeScene(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
      }
      material.dispose();
    }
  });
}

export function StudioModel() {
  const source = useViewerStore((s) => s.model);
  const setBounds = useViewerStore((s) => s.setBounds);
  const setModelError = useViewerStore((s) => s.setModelError);
  const requestFrame = useViewerStore((s) => s.requestFrame);
  // The renderer is read out of the R3F store INSIDE the effect rather than
  // subscribed to — the same idiom `canvas-with-wrapper` uses for the exposure
  // uniform. It is needed once, to let the KTX2 transcoder detect what this GPU
  // supports; subscribing to it would re-run this whole load on renderer churn
  // that has nothing to do with which model is showing.
  const store = useStore();

  /**
   * The loaded scene, TAGGED WITH THE URL IT CAME FROM.
   *
   * The tag is what lets the render decide, rather than an effect: a source the
   * state does not match simply draws nothing, so unloading a model is a render
   * result and not a `setScene(null)` inside an effect body — which is a
   * cascading render, and what the lint rule is there to stop.
   */
  const [loadedScene, setLoadedScene] = useState<{ url: string; scene: THREE.Group } | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (source.kind === "none") return;
    let alive = true;
    let loaded: THREE.Group | null = null;
    const { url, label } = source;

    gltfLoader(store.getState().gl).load(
      url,
      (gltf) => {
        if (!alive) {
          disposeScene(gltf.scene);
          return;
        }
        loaded = gltf.scene;

        // Bounds first — the grid, the default framing and the focus-distance
        // fallback are all derived from them, and every one of those runs
        // before the first frame is drawn.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        setBounds({ min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] });

        // Every clip, looping — the studio's job is to show what the terminal
        // shows, and the terminal autoplays all of them (model-content).
        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(gltf.scene);
          for (const clip of gltf.animations) mixer.clipAction(clip).play();
          mixerRef.current = mixer;
        } else {
          mixerRef.current = null;
        }

        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });

        setLoadedScene({ url, scene: gltf.scene });
        setModelError(null);
        requestFrame();
      },
      undefined,
      (error) => {
        if (!alive) return;
        setBounds(null);
        setModelError(
          `Could not load ${label} — ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    );

    return () => {
      alive = false;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      if (loaded) disposeScene(loaded);
    };
  }, [source, store, setBounds, setModelError, requestFrame]);

  useFrame((_, delta) => mixerRef.current?.update(delta));

  // `name` is what the place-mode raycast filters on, so a click on a marker
  // gizmo is never mistaken for a click on the terminal.
  const showing = source.kind !== "none" && loadedScene?.url === source.url ? loadedScene.scene : null;
  return showing ? <primitive object={showing} name="studio-model" /> : null;
}
