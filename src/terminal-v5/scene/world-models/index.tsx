"use client";

import { useEffect, useLayoutEffect } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useSite } from "@/config/context";
import { acquireGLTF, releaseGLTF } from "@/shared/runtime/dispose-gltf";

const DRACO_PATH = "/draco/";

export function WorldModels() {
  const urls = useSite().worldModels;
  if (!urls.length) return null;
  return (
    <>
      {urls.map((url) => (
        <WorldModel key={url} url={url} />
      ))}
    </>
  );
}

function WorldModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, DRACO_PATH);

  useLayoutEffect(() => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.raycast = () => null;
    });
  }, [scene]);

  useEffect(() => {
    acquireGLTF(url);
    return () => releaseGLTF(url, scene, useGLTF.clear);
  }, [scene, url]);

  return <primitive object={scene} />;
}
