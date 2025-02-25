import {
  Engine,
  Mesh,
  RawTexture,
  Scene,
  Texture,
  VertexData,
} from "@babylonjs/core";
import meshData from "./mesh.json?raw";
import edge from "./edges.json?raw";

export function loadMesh() {
  const { positions, indices, normals, uvs } = JSON.parse(meshData);

  const Flatpositions = Object.values(positions);
  const Flatindices = Object.values(indices);
  const Flatnormals = Object.values(normals);
  const Flatuvs = Object.values(uvs);

  // Restructure data for BabylonJS
  const positionsArr = [];
  for (let i = 0; i < Flatpositions.length; i += 3) {
    positionsArr.push(
      Flatpositions[i],
      Flatpositions[i + 1],
      Flatpositions[i + 2]
    );
  }

  const indicesArr = [];
  for (let i = 0; i < Flatindices.length; i++) {
    indicesArr.push(Flatindices[i]);
  }

  const normalsArr = [];
  for (let i = 0; i < Flatnormals.length; i += 3) {
    normalsArr.push(Flatnormals[i], Flatnormals[i + 1], Flatnormals[i + 2]);
  }

  // Create the mesh
  const mesh = new Mesh("customMesh");
  const vertexData = new VertexData();
  vertexData.positions = positionsArr;
  vertexData.indices = indicesArr;
  vertexData.normals = normalsArr;
  vertexData.applyToMesh(mesh);

  return mesh;
}

export function loadEdgeTexture(scene: Scene) {
  const e = JSON.parse(edge);
  const edgeData = Float32Array.from(
    e.flat().flatMap((x) => [...x.asArray(), 0])
  );
  let edgeTexture = RawTexture.CreateRGBATexture(
    edgeData,
    e.flat().length,
    1,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
  );
}
