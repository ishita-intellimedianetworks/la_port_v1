"use client";

import { useEffect, useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Bvh } from "@react-three/drei";
import * as THREE from "three";
import { patchMeshForReveal } from "@/shared/ui/screens/loading-screen/reveal";
import type { SharedUniforms } from "@/shared/ui/screens/loading-screen/reveal";
import isLowPower, { acquireGLTF, releaseGLTF } from "@/shared/runtime";
import { softenModelEdges } from "../edge-feather";

export interface SingleModelProps {
  onLoaded?: () => void;
  onBounds?: (bbox: THREE.Box3) => void;
  url: string;
  sharedUniforms?: SharedUniforms;
  /** When false, scene is mounted into R3F's tree but not rendered. Used for
   *  invisible "material library" GLBs (e.g. unit unfurnished textures). */
  visible?: boolean;
  /** Optional uniform scale applied to the loaded GLB root. Used to scale up
   *  the dollhouse model so it reads larger on-screen without re-authoring
   *  the GLB. Number = uniform XYZ; tuple = per-axis. */
  scale?: number | [number, number, number];
  /** Apartment-interior model: load the GLB clean. Meshes still cast/receive
   *  shadows, but the diorama edge-feather and transmission tweak are skipped
   *  so the room renders with its authored materials untouched. */
  interior?: boolean;
}

export function SingleModelContent({
  onLoaded,
  onBounds,
  url,
  sharedUniforms,
  visible = true,
  scale,
  interior = false,
}: SingleModelProps) {
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, scene);
  const { gl, camera, scene: rootScene } = useThree();

  // three compiles a material's shader program the FIRST time it enters the
  // frustum — which, mid-walk, is exactly when a turn sweeps the camera toward
  // unseen geometry: the walk froze ~1s on those corners. Compile every shader
  // (async, parallel where the driver allows) and upload every texture right
  // after mount, while the loading blackout still covers the screen.
  useEffect(() => {
    if (!visible || !scene) return;
    let cancelled = false;
    (async () => {
      try {
        await gl.compileAsync(scene, camera, rootScene);
        if (cancelled) return;
        // Textures still upload lazily on first draw — push them now too.
        // DESKTOP ONLY. Uploading a whole venue's texture set in one burst is a
        // VRAM spike, and a phone answers a spike it cannot fit by dropping the
        // WebGL context — which here is fatal rather than recoverable, because
        // the close() below throws away the only CPU copy the texture could be
        // re-uploaded from. On a phone, lazy per-draw upload spreads the same
        // work over the first few frames and never asks for it all at once; the
        // hitch it costs is the trade that keeps the context alive.
        if (isLowPower()) return;
        scene.traverse((obj: THREE.Object3D) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            for (const val of Object.values(m)) {
              const tex = val as THREE.Texture;
              if (!tex?.isTexture) continue;
              gl.initTexture(tex);
              // The GPU copy now exists — release the CPU-side decoded bitmap.
              // GLTFLoader keeps every texture's ImageBitmap alive in JS memory
              // (a 2048² texture holds ~16MB of RAM), and these venue GLBs
              // carry dozens; over a session that's hundreds of MB doing
              // nothing. close() frees it immediately. Trade-off: on a WebGL
              // context loss the texture can't re-upload — accepted (the whole
              // scene reloads on that path anyway).
              try {
                const img = tex.image as unknown;
                if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
                  img.close();
                }
              } catch { /* best-effort — keeping the bitmap is only a memory cost */ }
            }
          }
        });
      } catch {
        /* warm-up is best-effort — worst case is the old lazy compile */
      }
    })();
    return () => { cancelled = true; };
  }, [gl, camera, rootScene, scene, visible]);

  // Autoplay every baked clip on a forever loop while a visible model is
  // mounted. Invisible helper GLBs are skipped.
  useEffect(() => {
    if (!visible || !animations.length) return;

    const playing = Object.values(actions).filter(
      (a): a is NonNullable<typeof a> => !!a,
    );

    for (const action of playing) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.play();
    }

    return () => {
      for (const action of playing) action.stop();
    };
  }, [actions, animations, visible]);

  useLayoutEffect(() => {
    if (!scene) return;

    if (sharedUniforms) {
      patchMeshForReveal(scene, sharedUniforms);
    }

    // Drop refraction (KHR_materials_transmission). It's baked into the stadium
    // GLB, and three renders the WHOLE scene an extra time every frame for it —
    // ~halving the framerate and making the walk + idle drift stutter. We don't
    // need refraction; turning it off removes that per-frame pass (no other
    // material change — the surface just stops refracting).
    scene.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Every mesh both casts and receives shadows so buildings shade themselves
      // and the ground (mirrors the reference exterior). The sun's shadow map is
      // frozen after one render (see SceneLights), so this stays cheap to walk.
      // Interior rooms keep shadows too — that's the one thing we DO want here.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Interior models load with their authored materials untouched — skip the
      // refraction-drop tweak (no extra material changes inside a room).
      if (interior || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const pm = mat as THREE.MeshPhysicalMaterial;
        if (typeof pm.transmission === "number" && pm.transmission > 0) {
          pm.transmission = 0;
          pm.needsUpdate = true;
        }
      }
    });

    if (onBounds) {
      const bbox = new THREE.Box3();

      scene.updateWorldMatrix(true, true);

      scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;

        if (mesh.isMesh && mesh.geometry) {
          mesh.geometry.computeBoundingBox();

          if (mesh.geometry.boundingBox) {
            bbox.union(
              mesh.geometry.boundingBox
                .clone()
                .applyMatrix4(mesh.matrixWorld)
            );
          }
        }
      });

      if (!bbox.isEmpty()) {
        onBounds(bbox);
        // Soft-edge feather (dollhouse diorama look): fade the model's rim into
        // the background via a fragment-shader radial fade. Visible village
        // models only — never inside a room, where the walls would dissolve.
        if (visible && !interior) {
          const center = bbox.getCenter(new THREE.Vector3());
          const size = bbox.getSize(new THREE.Vector3());
          softenModelEdges(scene, center, size.x * 0.5, size.z * 0.5);
        }
      }
    }

    onLoaded?.();
  }, [scene, sharedUniforms, onBounds, onLoaded, visible, interior]);

  // Ref-counted GLTF lifecycle. Strict Mode's mount → cleanup → remount cycle
  // would otherwise dispose the just-loaded scene and force a re-fetch/parse
  // — the visible load-then-unload flash on first dollhouse load. acquireGLTF
  // bumps a per-URL counter; releaseGLTF defers the actual dispose to a
  // microtask so a same-tick re-acquire (strict mode) can cancel it.
  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  // Resolve `scale`: undefined → no prop (object3D keeps its native scale);
  // number → uniform; tuple → per-axis. Passed through to <primitive> which
  // applies it to the loaded GLB root.
  const scaleProp: [number, number, number] | undefined =
    typeof scale === "number" ? [scale, scale, scale] :
    Array.isArray(scale)      ? scale :
    undefined;

  // BVH-accelerated raycasting (three-mesh-bvh via drei). Ground probes (the
  // 3D route ribbon), double-click navigation, and hotspot picking all raycast
  // this model; without a bounds tree each ray tests EVERY triangle — on the
  // stadium's ~1M-triangle GLB that's tens of ms per ray, which stuttered the
  // walk and froze turns. The tree builds once at mount (under the loading
  // blackout). firstHitOnly stays false — groundYAt needs ALL hits to skip
  // roofs/invisible surfaces.
  return (
    <Bvh firstHitOnly={false}>
      <primitive object={scene} visible={visible} scale={scaleProp} />
    </Bvh>
  );
}