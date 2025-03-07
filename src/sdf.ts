import {
  Engine,
  Mesh,
  RawTexture,
  Scene,
  Texture,
  VertexData,
  Vector3,
  MeshBuilder,
  ShaderMaterial,
  RenderTargetTexture,
  ArcRotateCamera,
  Camera,
  Effect,
  Constants,
  VertexBuffer,
  Color4,
  PassPostProcess,
} from "@babylonjs/core";
import meshData from "./mesh.json?raw";
import edge from "./edges.json?raw";

export interface EdgeRenderingOptions {
  edgeWidth?: number;
  edgeColor?: Vector3;
  useDirectCalculation?: boolean;
  showDebugView?: boolean;
}

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

  // Set UVs if available, otherwise generate them
  if (Flatuvs && Flatuvs.length > 0) {
    const uvsArr = [];
    for (let i = 0; i < Flatuvs.length; i += 2) {
      uvsArr.push(Flatuvs[i], Flatuvs[i + 1]);
    }
    vertexData.uvs = uvsArr;
  }

  vertexData.applyToMesh(mesh);
  return mesh;
}

export function loadEdgeTexture(scene: Scene) {
  const edgeData = JSON.parse(edge);
  const flattened = edgeData.flat();

  // Create a float array with RGB values for each point (edge start and end)
  const textureSize = flattened.length;
  const floatData = new Float32Array(textureSize * 4); // RGBA format

  // Fill the texture data
  for (let i = 0; i < flattened.length; i++) {
    const point = flattened[i];
    floatData[i * 4 + 0] = point._x; // R channel = X
    floatData[i * 4 + 1] = point._y; // G channel = Y
    floatData[i * 4 + 2] = point._z; // B channel = Z
    floatData[i * 4 + 3] = 1.0; // A channel = 1.0 (fully opaque)
  }

  // Create the texture
  const edgeTexture = new RawTexture(
    floatData,
    textureSize,
    1, // Height is 1
    Engine.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
    Engine.TEXTURETYPE_FLOAT
  );

  edgeTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
  edgeTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

  return { edgeTexture, edgeCount: edgeData.length };
}

// Generate UVs based on position
export function generateUVs(mesh: Mesh, positions: number[]) {
  // Find mesh bounds
  const bounds = getBoundingBox(positions);

  // Generate UVs based on XZ position (assuming the mesh is mainly on XZ plane)
  const uvs = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];

    // Calculate UV based on position within bounding box
    const u = (x - bounds.min.x) / (bounds.max.x - bounds.min.x);
    const v = (z - bounds.min.z) / (bounds.max.z - bounds.min.z);

    uvs.push(u, v);
  }

  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  return uvs;
}

// Get the bounding box of a mesh from positions
export function getBoundingBox(positions: number[]) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < positions.length; i += 3) {
    min.x = Math.min(min.x, positions[i]);
    min.y = Math.min(min.y, positions[i + 1]);
    min.z = Math.min(min.z, positions[i + 2]);

    max.x = Math.max(max.x, positions[i]);
    max.y = Math.max(max.y, positions[i + 1]);
    max.z = Math.max(max.z, positions[i + 2]);
  }

  return { min, max };
}

// Create a shader for direct edge calculation
export function createDirectEdgeShader(
  scene: Scene,
  edgeTexture: Texture,
  edgeCount: number,
  options: EdgeRenderingOptions = {}
) {
  // Default options
  const edgeWidth = options.edgeWidth || 0.3;
  const edgeColor = options.edgeColor || new Vector3(1, 0, 0); // Red by default

  // Set up vertex shader
  Effect.ShadersStore["directEdgeVertexShader"] = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    attribute vec3 normal;
    
    uniform mat4 world;
    uniform mat4 worldView;
    uniform mat4 worldViewProjection;
    uniform mat4 view;
    uniform mat4 projection;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUV;
    
    void main() {
      gl_Position = worldViewProjection * vec4(position, 1.0);
      vPosition = (world * vec4(position, 1.0)).xyz;
      vNormal = (world * vec4(normal, 0.0)).xyz;
      vUV = uv;
    }
  `;

  // Set up fragment shader
  Effect.ShadersStore["directEdgeFragmentShader"] = `
    precision highp float;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUV;
    
    uniform sampler2D edgeTexture;
    uniform float edgeWidth;
    uniform int numEdges;
    uniform vec3 edgeColor;
    
    float signedDistanceToSegment(vec3 p, vec3 a, vec3 b) {
      vec3 ab = b - a;
      float t = dot(p - a, ab) / dot(ab, ab);
      t = clamp(t, 0.0, 1.0);
      vec3 projection = a + t * ab;
      
      // Calculate absolute distance
      float d = length(p - projection);
      
      // Determine sign using cross product
      vec3 normal = cross(ab, p - a);
      float sign = dot(normal, normal) > 0.0 ? 1.0 : -1.0;
      
      return d * sign;
    }
    
    void main() {
      float minDist = 1000.0;
      
      // Loop through all edges
      for (int i = 0; i < 336; i++) {
        if (i >= numEdges) break;
        
        float texCoord1 = (float(i * 2) + 0.5) / float(numEdges * 2);
        vec4 point1 = texture2D(edgeTexture, vec2(texCoord1, 0.5));
        
        float texCoord2 = (float(i * 2 + 1) + 0.5) / float(numEdges * 2);
        vec4 point2 = texture2D(edgeTexture, vec2(texCoord2, 0.5));
        
        // Calculate distance to this edge
        float dist = signedDistanceToSegment(vPosition, point1.xyz, point2.xyz);
        
        // Store minimum absolute distance
        minDist = min(minDist, abs(dist));
      }
      
      // Create smooth edge effect using screen-space derivatives
      float pixelWidth = fwidth(minDist);
      float edge = 1.0 - smoothstep(edgeWidth - pixelWidth, edgeWidth + pixelWidth, minDist);
      
      // Output edge with transparency
      gl_FragColor = vec4(edgeColor, edge);

    }
  `;

  // Create shader material
  const shader = new ShaderMaterial(
    "directEdge",
    scene,
    {
      vertex: "directEdge",
      fragment: "directEdge",
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldView",
        "worldViewProjection",
        "view",
        "projection",
        "edgeWidth",
        "numEdges",
        "edgeColor",
      ],
      samplers: ["edgeTexture"],
    }
  );

  // Set shader parameters
  shader.setTexture("edgeTexture", edgeTexture);
  shader.setInt("numEdges", edgeCount);
  shader.setFloat("edgeWidth", edgeWidth);
  shader.setVector3("edgeColor", edgeColor);
  shader.alphaMode = Constants.ALPHA_COMBINE;

  return shader;
}

// Create a SDF texture using render target
export function createSDFTexture(
  scene: Scene,
  mesh: Mesh,
  edgeTexture: Texture,
  edgeCount: number
) {
  // Create SDF generation shader
  Effect.ShadersStore["sdfGenVertexShader"] = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 world;
    uniform mat4 worldViewProjection;

    
    varying vec2 vUV;
    varying vec3 vWorldPos;
    
    void main() {
      vec2 clipSpace = (uv * 2.0) - 1.0;    
      gl_Position = vec4(clipSpace, 0.0, 1.0);

      vUV = uv;   
      vWorldPos = (world * vec4(position, 1.0)).xyz;
    }
  `;

  Effect.ShadersStore["sdfGenFragmentShader"] = `
  precision highp float;
  
  varying vec2 vUV;
  varying vec3 vWorldPos;
  
  uniform sampler2D edgeTexture;
  uniform int numEdges;
  
  float signedDistanceToSegment(vec3 p, vec3 a, vec3 b) {
    vec3 ab = b - a;
    float t = dot(p - a, ab) / dot(ab, ab);
    t = clamp(t, 0.0, 1.0);
    vec3 projection = a + t * ab;
    
    // Calculate absolute distance
    float d = length(p - projection);
    
    // Determine sign using cross product
    vec3 normal = cross(ab, p - a);
    float sign = dot(normal, normal) > 0.0 ? 1.0 : -1.0;
    
    return d * sign;
  }
  
  void main() {
    float minDist = 10000.0;
    // Loop through all edges
    for (int i = 0; i < 336; i++) {
      if (i >= numEdges) break;
  

      float texCoord1 = (float(i * 2) + 0.5) / float(numEdges * 2);
      float texCoord2 = (float(i * 2 + 1) + 0.5) / float(numEdges * 2);


      
      vec4 point1 = texture2D(edgeTexture, vec2(texCoord1, 0.5));      
      vec4 point2 = texture2D(edgeTexture, vec2(texCoord2, 0.5));
      
      // Calculate distance to this edge
      float dist = signedDistanceToSegment(vWorldPos, point1.xyz, point2.xyz);
      
      // Store minimum absolute distance
      minDist = min(minDist, abs(dist));
    }

    gl_FragColor = vec4(minDist, 0., 0.0, 1.0);
  }
`;

  // Create the SDF generation material
  const sdfMaterial = new ShaderMaterial("sdfGen", scene, "sdfGen", {
    attributes: ["position", "uv"],
    uniforms: ["world", "worldView", "worldViewProjection", "numEdges"],
    samplers: ["edgeTexture"],
  });

  sdfMaterial.setTexture("edgeTexture", edgeTexture);
  sdfMaterial.setInt("numEdges", edgeCount);
  const originalMaterial = mesh.material;
  sdfMaterial.backFaceCulling = false;
  mesh.material = sdfMaterial;

  // mesh.material.wireframe = true;

  // Create a render target texture
  const renderTarget = new RenderTargetTexture(
    "sdfTexture",
    4096, // Size
    scene,
    false, // No mipmaps
    true, // Use depth buffer
    Constants.TEXTURETYPE_FLOAT,
    false,
    Engine.TEXTURE_NEAREST_SAMPLINGMODE
  );

  renderTarget.clearColor = new Color4(0, 0, 1, 1);
  renderTarget.samples = 4;
  renderTarget.wrapU = Texture.CLAMP_ADDRESSMODE;
  renderTarget.wrapV = Texture.CLAMP_ADDRESSMODE;
  // renderTarget.anisotropicFilteringLevel = 1;

  // Set up an orthographic camera specifically for rendering the SDF
  const sdfCamera = new ArcRotateCamera(
    "camera",
    Math.PI / 2,
    Math.PI / 2,
    2,
    Vector3.Zero(),
    scene
  );

  sdfCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  sdfCamera.orthoLeft = -0.5;
  sdfCamera.orthoRight = 0.5;
  sdfCamera.orthoTop = -0.5;
  sdfCamera.orthoBottom = 0.5;

  renderTarget.activeCamera = sdfCamera;
  renderTarget.renderList = [mesh];
  renderTarget.setMaterialForRendering(mesh, sdfMaterial);

  // scene.customRenderTargets.push(renderTarget);
  const renderWhenReady = () => {
    if (renderTarget.isReadyForRendering()) {
      renderTarget.render();
      renderTarget.readPixels().then((data) => console.log(data));

      renderTarget.onAfterRenderObservable.addOnce(() => {
        console.log("Read");
        renderTarget.readPixels().then((data) => console.log(data));
      });
      window.rtt = renderTarget;
    } else {
      window.setTimeout(renderWhenReady, 16);
    }
  };
  renderWhenReady();
  // Hide the plane after rendering
  // mesh.material = originalMaterial;

  return {
    sdfTexture: renderTarget,
  };
}

// Create a shader that uses the lookup texture
export function createLookupShader(
  scene: Scene,
  sdfTexture: RenderTargetTexture,
  mesh: Mesh,
  options: EdgeRenderingOptions = {}
) {
  // Default options
  const edgeWidth = options.edgeWidth || 0.3;
  const edgeColor = options.edgeColor || new Vector3(0, 0, 1); // Blue by default

  Effect.ShadersStore["lookupEdgeVertexShader"] = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  attribute vec3 normal;
  
  uniform mat4 world;
  uniform mat4 worldView;
  uniform mat4 worldViewProjection;
  uniform mat4 view;
  uniform mat4 projection;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUV;
  varying vec2 vSdfUV;
  
  void main() {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vPosition = (world * vec4(position, 1.0)).xyz;
    vNormal = (world * vec4(normal, 0.0)).xyz;
    vUV = uv;
  }
`;

  // 3. UPDATE THE LOOKUP FRAGMENT SHADER
  // In the createLookupShader function, update the lookupEdgeFragmentShader:

  Effect.ShadersStore["lookupEdgeFragmentShader"] = `
  precision highp float;
  
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUV;
  
  uniform sampler2D sdfTexture;
  uniform float edgeWidth;
  uniform vec3 edgeColor;


  vec4 fixDiscontinuities(sampler2D tex, vec2 uv1, vec2 uv2) {
    // Sample current pixel and inner pixel
    vec4 edgeColor = texture(tex, uv1);
    vec4 innerColor = texture(tex, uv2);
    
    vec3 slope = edgeColor.rgb - innerColor.rgb;
    vec3 finalColor = edgeColor.rgb + slope * 4.0;
   
    // Calculate difference in red channel (distance field)
    float rDiff = edgeColor.r - innerColor.r;
    
    // If we detect a significant jump in the distance field (red channel)
    // AND we're in a blue channel area (outside/clear area)
    if ((rDiff > 0.15 || edgeColor.b > 0.01) && edgeColor.r > 0.2) {
        // Force red to 1.0 to eliminate partial values at seams
        return vec4(edgeColor.r, 0.0, 0., 1.0);
    }
    
    return edgeColor;
}
  
  void main() {
  
  float delta = 0.002;
  vec2 texSize = vec2(1. / 4096.);
  
  // Direct texel fetch without any filtering
  vec4 edgeData = texture2D(sdfTexture, vUV);
  
  // Sample the encoded distance from the texture
  float distance = edgeData.r;

  vec2 neighbourOffsets[4] = vec2[](
    vec2(-1,0),
    vec2(1,0),
    vec2(0,-1),
    vec2(0,1)
  );

  bool isEdge = false;
  float discontinuityThreshold = 0.1;

  if (edgeData.b != 0.) 
  {
    vec4 ma = vec4(0.);
    vec2 minUVOffset = vec2(-1.);

    for (int i = 0; i < 4;  i++)
    {
      vec2 sampleUV = vUV + neighbourOffsets[i] * texSize;
      vec4 neighbourData = texture2D(sdfTexture, sampleUV);

      if (neighbourData.b > 0.1) 
      {
        continue;
      }

      if (neighbourData.r > ma.r)
      {
        ma = neighbourData;
        minUVOffset = neighbourOffsets[i];
      }      
    }

    
    vec4 finalColor = fixDiscontinuities(
      sdfTexture, 
      vUV + minUVOffset * texSize,
      vUV + minUVOffset * texSize * 0.25
    );

    edgeData = finalColor;

    vec2 sam = vUV + minUVOffset * texSize;
    if (finalColor.b > 0.0) 
    {
      vec4 finalColor1 = fixDiscontinuities(
        sdfTexture, 
        vUV + minUVOffset * texSize * 0.25,
        vUV + minUVOffset * texSize * 0.75
      );

    
      edgeData = vec4(finalColor1.r, 0.,0.,1.);   
    }

  }

  
    distance = edgeData.r;
  // Calculate a pixel-perfect antialiasing edge
  float aa = length(vec2(dFdx(distance), dFdy(distance))) * 0.5;
  // Apply the antialiased edge
  float smoothTransition = smoothstep(0.3 - aa, 0.3 + aa, distance);
  gl_FragColor = mix(vec4(1.,0.,0.,1.), vec4(1.), smoothTransition);
  }
`;

  const shader = new ShaderMaterial(
    "lookupEdge",
    scene,
    {
      vertex: "lookupEdge",
      fragment: "lookupEdge",
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "world",
        "worldView",
        "worldViewProjection",
        "view",
        "projection",
        "edgeWidth",
        "edgeColor",
      ],
      samplers: ["sdfTexture"],
    }
  );

  shader.setTexture("sdfTexture", sdfTexture);
  shader.setFloat("edgeWidth", edgeWidth);
  shader.setVector3("edgeColor", edgeColor);

  return shader;
}

// Create a debug visualization of the SDF texture
export function createSDFDebugView(
  scene: Scene,
  sdfTexture: RenderTargetTexture
) {
  const debugPlane = MeshBuilder.CreatePlane(
    "sdfDebug",
    { width: 10, height: 10 },
    scene
  );
  debugPlane.position = new Vector3(20, 0, 0);

  Effect.ShadersStore["sdfDebugVertexShader"] = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    
    uniform mat4 worldViewProjection;
    
    varying vec2 vUV;
    
    void main() {
      gl_Position = worldViewProjection * vec4(position, 1.0);
      vUV = uv;
    }
  `;

  Effect.ShadersStore["sdfDebugFragmentShader"] = `
    precision highp float;
    
    varying vec2 vUV;
    
    uniform sampler2D sdfTexture;
    
    vec3 heatmapColor(float value) {
      // Red (close) to blue (far)
      value = clamp(value, 0.0, 1.0);
      return vec3(1.0 - value, 0.0, value);
    }
    
    void main() {
      // Get SDF value
      float dist = texture2D(sdfTexture, vUV).r;
      
      // Normalize for visualization
      float normalizedDist = min(dist / 5.0, 1.0);
      
      // Visualize with a heat color map
      vec3 color = heatmapColor(normalizedDist);
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const debugMaterial = new ShaderMaterial(
    "sdfDebug",
    scene,
    {
      vertex: "sdfDebug",
      fragment: "sdfDebug",
    },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection"],
      samplers: ["sdfTexture"],
    }
  );

  debugMaterial.setTexture("sdfTexture", sdfTexture);
  debugPlane.material = debugMaterial;

  // Hide by default
  debugPlane.isVisible = false;

  return debugPlane;
}

// Set up edge rendering for a mesh
export function setupEdgeRendering(
  mesh: Mesh,
  scene: Scene,
  options: EdgeRenderingOptions = {}
) {
  // Load edge texture
  const { edgeTexture, edgeCount } = loadEdgeTexture(scene);

  // // Create direct edge calculation shader
  const directEdgeShader = createDirectEdgeShader(
    scene,
    edgeTexture,
    edgeCount,
    options
  );

  // // Generate SDF texture for lookup
  const { sdfTexture } = createSDFTexture(scene, mesh, edgeTexture, edgeCount);

  // Create lookup shader using the SDF texture
  const lookupShader = createLookupShader(scene, sdfTexture, mesh, options);

  // // Apply the chosen shader
  if (options.useDirectCalculation) {
    mesh.material = directEdgeShader;
  } else {
    mesh.material = lookupShader;
  }

  new PassPostProcess(
    "asas",
    1,
    scene.activeCamera,
    Engine.TEXTURE_NEAREST_SAMPLINGMODE
  );

  return {
    directEdgeShader,
    lookupShader,
    sdfTexture,
    edgeTexture,
  };
}

// Notes:
// for seams:
//
