/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/Addons.js";

type ExtractedNode = {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  type: string;
};

async function loadAndExtractGLB(file: File): Promise<{
  objects: ExtractedNode[];
  cameras: ExtractedNode[];
}> {
  const loader = new GLTFLoader();
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const objects: ExtractedNode[] = [];
        const cameras: ExtractedNode[] = [];

        // Force a full world-matrix pass before reading any world transforms.
        // glTF nodes nested under groups (cameras parented to "rigs", layouts
        // under floor groups, etc.) only have meaningful world positions /
        // rotations after this — reading `node.position` alone returns the
        // LOCAL transform and silently misreports the scene-space pose.
        gltf.scene.updateMatrixWorld(true);

        // Scratch instances reused per node — extract-pos runs at most once
        // per file upload so allocation cost is irrelevant, but reusing keeps
        // the code one-shape with the runtime animator.
        const worldPos  = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldEul  = new THREE.Euler();

        gltf.scene.traverse((node: THREE.Object3D) => {
          node.getWorldPosition(worldPos);
          node.getWorldQuaternion(worldQuat);
          // Decompose to an XYZ-order Euler. Matches the convention the
          // cinematic / exterior camera-animation use to reconstruct
          // quaternions from config rotation triples (see
          // camera-waypoint-animator.ts CONFIG_EULER_ORDER).
          worldEul.setFromQuaternion(worldQuat, "XYZ");

          const data: ExtractedNode = {
            name: node.name || "unnamed",
            position: {
              x: worldPos.x,
              y: worldPos.y,
              z: worldPos.z,
            },
            rotation: {
              x: worldEul.x,
              y: worldEul.y,
              z: worldEul.z,
            },
            type: node.type,
          };

          if (node.type === "Mesh" || node.type === "Group") {
            objects.push(data);
          }

          if (
            node.type === "PerspectiveCamera" ||
            node.type === "OrthographicCamera"
          ) {
            cameras.push(data);
          }
        });

        resolve({ objects, cameras });
        URL.revokeObjectURL(url);
      },
      undefined,
      reject
    );
  });
}

export default function GLBExtractorDemo() {
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied]  = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ padding: 20 }}>
      <input
        type="file"
        accept=".glb"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const res = await loadAndExtractGLB(file);
          setResult(res);
        }}
      />

      {result && (
        <button
          onClick={handleCopy}
          style={{
            marginTop: 12,
            marginLeft: 12,
            padding: "4px 14px",
            background: copied ? "#1a7a1a" : "#333",
            color: "#0f0",
            border: "1px solid #0f0",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      )}

      <pre
        ref={preRef}
        style={{
          marginTop: 12,
          background: "#111",
          color: "#0f0",
          padding: 10,
          userSelect: "text",
          WebkitUserSelect: "text",
          overflowX: "auto",
        }}
      >
        {result ? JSON.stringify(result, null, 2) : "Upload a GLB file"}
      </pre>
    </div>
  );
}