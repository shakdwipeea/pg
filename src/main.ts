import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  FreeCamera,
  Color3,
  Tools,
  Constants,
  DeviceSourceManager,
  DeviceType,
} from "@babylonjs/core";
import { loadMesh, setupEdgeRendering, EdgeRenderingOptions } from "./sdf";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { Control } from "@babylonjs/gui/2D/controls/control";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Slider } from "@babylonjs/gui/2D/controls/sliders/slider";
import { Button } from "@babylonjs/gui/2D/controls/button";

class App {
  private canvas: HTMLCanvasElement;
  private engine: Engine;
  private scene: Scene;
  private camera: ArcRotateCamera;
  private light: HemisphericLight;
  private mesh: Mesh;
  private edgeRenderer: any;
  private ui: any;

  constructor() {
    // Create the canvas html element and attach it to the webpage
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.id = "gameCanvas";
    document.body.appendChild(this.canvas);

    // Initialize babylon scene and engine
    this.engine = new Engine(this.canvas, true);
    this.scene = new Scene(this.engine);
    window.e = this.engine;
    // Set up the scene
    this.setupScene();

    // Load mesh and set up edge rendering
    this.setupMesh();

    // Create UI
    this.createUI();

    // Add keyboard shortcuts
    this.setupKeyboardShortcuts();
    window.ss = this.scene;

    // Run the main render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    // Handle window resizing
    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  private setupScene(): void {
    // Setup camera
    this.camera = new ArcRotateCamera(
      "Camera",
      Math.PI / 2,
      Math.PI / 2.5,
      50,
      Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.minZ = 0.1;

    // Setup lighting
    this.light = new HemisphericLight(
      "light1",
      new Vector3(0, 1, 0),
      this.scene
    );
    this.light.intensity = 0.7;

    // Set scene clearing color
    this.scene.clearColor = new Color3(0.05, 0.05, 0.05);
  }

  private setupMesh(): void {
    // Load the mesh
    this.mesh = loadMesh();
    this.scene.addMesh(this.mesh);

    // Setup edge rendering with default options
    const options: EdgeRenderingOptions = {
      edgeWidth: 0.3,
      edgeColor: new Vector3(1, 0, 0), // Red for direct calculation
      useDirectCalculation: true,
      showDebugView: false,
    };

    this.edgeRenderer = setupEdgeRendering(this.mesh, this.scene, options);

    console.log("Mesh created with edge rendering", this.mesh);
  }

  private createUI(): void {
    const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI");

    const panel = new StackPanel();
    panel.width = "220px";
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.top = "10px";
    panel.left = "10px";
    advancedTexture.addControl(panel);

    const header = new TextBlock();
    header.text = "Edge Rendering Controls";
    header.height = "30px";
    header.color = "white";
    panel.addControl(header);

    // Direct calculation button
    const directButton = Button.CreateSimpleButton(
      "directButton",
      "Direct Calculation"
    );
    directButton.width = "180px";
    directButton.height = "30px";
    directButton.color = "white";
    directButton.background = "green";
    directButton.onPointerUpObservable.add(() => {
      this.mesh.material = this.edgeRenderer.directEdgeShader;
      directButton.background = "green";
      lookupButton.background = "gray";
    });
    panel.addControl(directButton);

    // Lookup texture button
    const lookupButton = Button.CreateSimpleButton(
      "lookupButton",
      "Lookup Texture"
    );
    lookupButton.width = "180px";
    lookupButton.height = "30px";
    lookupButton.color = "white";
    lookupButton.background = "gray";
    lookupButton.onPointerUpObservable.add(() => {
      this.mesh.material = this.edgeRenderer.lookupShader;
      directButton.background = "gray";
      lookupButton.background = "green";
    });
    panel.addControl(lookupButton);

    // Debug SDF visualization button
    const debugSdfButton = Button.CreateSimpleButton(
      "show inspector",
      "show inspector"
    );
    debugSdfButton.width = "180px";
    debugSdfButton.height = "30px";
    debugSdfButton.color = "white";
    debugSdfButton.background = "gray";
    debugSdfButton.onPointerUpObservable.add(() => {
      this.scene.debugLayer.show();
    });
    panel.addControl(debugSdfButton);

    // Edge width slider
    const edgeWidthHeader = new TextBlock();
    edgeWidthHeader.text = "Edge Width:";
    edgeWidthHeader.height = "20px";
    edgeWidthHeader.color = "white";
    panel.addControl(edgeWidthHeader);

    const edgeWidthSlider = new Slider();
    edgeWidthSlider.minimum = 0.01;
    edgeWidthSlider.maximum = 1.0;
    edgeWidthSlider.value = 0.3;
    edgeWidthSlider.height = "20px";
    edgeWidthSlider.width = "180px";
    edgeWidthSlider.color = "white";
    edgeWidthSlider.background = "gray";
    edgeWidthSlider.onValueChangedObservable.add((value) => {
      this.edgeRenderer.directEdgeShader.setFloat("edgeWidth", value);
      this.edgeRenderer.lookupShader.setFloat("edgeWidth", value);
    });
    panel.addControl(edgeWidthSlider);

    this.ui = {
      directButton,
      lookupButton,
      debugSdfButton,
      edgeWidthSlider,
    };
  }

  private setupKeyboardShortcuts(): void {
    // Toggle inspector
    this.scene.onKeyboardObservable.add((kbInfo) => {
      // Shift+Ctrl+Alt+I
      if (
        kbInfo.event.shiftKey &&
        kbInfo.event.ctrlKey &&
        kbInfo.event.altKey &&
        kbInfo.event.key === "i"
      ) {
        if (this.scene.debugLayer.isVisible()) {
          this.scene.debugLayer.hide();
        } else {
          this.scene.debugLayer.show();
        }
      }

      // 1 to switch to direct calculation
      if (kbInfo.event.key === "1") {
        this.mesh.material = this.edgeRenderer.directEdgeShader;
        this.ui.directButton.background = "green";
        this.ui.lookupButton.background = "gray";
      }

      // 2 to switch to lookup texture
      if (kbInfo.event.key === "2") {
        this.mesh.material = this.edgeRenderer.lookupShader;
        this.ui.directButton.background = "gray";
        this.ui.lookupButton.background = "green";
      }

      // D to toggle debug view
      if (kbInfo.event.key === "d") {
        this.edgeRenderer.sdfDebugPlane.isVisible =
          !this.edgeRenderer.sdfDebugPlane.isVisible;
        this.ui.debugSdfButton.background = this.edgeRenderer.sdfDebugPlane
          .isVisible
          ? "green"
          : "gray";
      }
    });
  }
}

// Start the application
new App();
