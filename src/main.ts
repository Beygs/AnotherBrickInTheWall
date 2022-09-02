import "./style.css";
import * as THREE from "three";
import * as CANNON from "cannon-es";

/**
 * Base
 */
// Canvas
const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;

// Scene
const scene = new THREE.Scene();

/**
 * Sounds
 */
const hitSound = new Audio("/sounds/hit.mp3");

const playHitSound = (collision: any) => {
  const impactStrength = collision.contact.getImpactVelocityAlongNormal();
  const volume = Math.abs(impactStrength / 10);

  hitSound.volume = volume <= 1 ? volume : 1;
  hitSound.currentTime = 0;
  hitSound.play();
};

/**
 * Textures
 */
const cubeTextureLoader = new THREE.CubeTextureLoader();

const environmentMapTexture = cubeTextureLoader.load([
  "/textures/environmentMaps/0/px.png",
  "/textures/environmentMaps/0/nx.png",
  "/textures/environmentMaps/0/py.png",
  "/textures/environmentMaps/0/ny.png",
  "/textures/environmentMaps/0/pz.png",
  "/textures/environmentMaps/0/nz.png",
]);

/**
 * Physics
 */
// World
const world = new CANNON.World();
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.gravity.set(0, -9.807, 0);

// Materials
const defaultMaterial = new CANNON.Material("default");

const defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  defaultMaterial,
  {
    friction: 0.1,
    restitution: 0.7,
  }
);
world.addContactMaterial(defaultContactMaterial);
world.defaultContactMaterial = defaultContactMaterial;

// Floor
const floorShape = new CANNON.Box(new CANNON.Vec3(4, 1, 0.1));
const floorBody = new CANNON.Body();
floorBody.mass = 0;
floorBody.addShape(floorShape);
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(-1, 0, 0), Math.PI * 0.5);
floorBody.position.set(4, 0, 0);
world.addBody(floorBody);

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.2);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(1024, 1024);
directionalLight.shadow.camera.far = 15;
directionalLight.shadow.camera.left = -7;
directionalLight.shadow.camera.top = 7;
directionalLight.shadow.camera.right = 7;
directionalLight.shadow.camera.bottom = -7;
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const raycaster = new THREE.Raycaster();

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(4, 2.1, 3);
scene.add(camera);

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(0);

/**
 * Utils
 */
const objectsToUpdate: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  metalness: 0.4,
  roughness: 0.3,
  envMap: environmentMapTexture,
});

const createBox = (
  width: number,
  height: number,
  depth: number,
  settings: { x: number; y: number; z: number; mass?: number }
) => {
  // Three.js Mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(width, height, depth);

  const { x, y, z } = settings;

  mesh.castShadow = true;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  // Cannon.js body
  const shape = new CANNON.Box(
    new CANNON.Vec3(width * 0.5, height * 0.5, depth * 0.5)
  );
  const body = new CANNON.Body({
    mass: settings.mass || width * depth * height * 2,
    position: new CANNON.Vec3(0, 3, 0),
    shape,
  });
  body.position.set(x, y, z);
  body.addEventListener("collide", playHitSound);
  world.addBody(body);

  return { mesh, body };
};

const mouse = new THREE.Vector2();

window.addEventListener("mousemove", (e) => {
  mouse.x = (e.clientX / sizes.width) * 2 - 1;
  mouse.y = (-e.clientY / sizes.height) * 2 + 1;
});

window.addEventListener("click", () => {
  const instruction = document.querySelector(".instruction");

  if (instruction) instruction.remove();

  if (currentIntersect) {
    const intersect = objectsToUpdate.find(
      (obj) => obj.mesh.uuid === currentIntersect?.object.uuid
    );

    intersect?.body.applyLocalImpulse(
      new CANNON.Vec3(
        -(currentIntersect?.face?.normal?.x || 0),
        -(currentIntersect?.face?.normal?.y || 0),
        -(currentIntersect?.face?.normal?.z || 0)
      )
    );
  }
});

const boxes: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];

for (let i = 0; i < 5 * 8; i++) {
  boxes.push(
    createBox(1, 1, 1, {
      x: (i % 8) + 0.5,
      y: Math.floor(i / 8) + 0.6,
      z: 0,
      mass: 0.05,
    })
  );
}

boxes.forEach((box) => objectsToUpdate.push(box));

let currentIntersect: THREE.Intersection | null = null;

/**
 * Animate
 */
const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const currentTime = clock.getElapsedTime();
  const deltaTime = currentTime - previousTime;
  previousTime = currentTime;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(
    objectsToUpdate.map((obj) => obj.mesh)
  );

  if (intersects.length) {
    currentIntersect = intersects[0];
  } else {
    currentIntersect = null;
  }

  world.step(1 / 60, deltaTime, 3);

  camera.updateMatrix();
  camera.updateMatrixWorld();
  var frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
  );

  objectsToUpdate.forEach(({ body, mesh }, i) => {
    if (!frustum.intersectsObject(mesh)) {
      body.removeEventListener("collide", playHitSound);
      world.removeBody(body);
      scene.remove(mesh);

      objectsToUpdate.splice(i, 1);

      if (objectsToUpdate.length === 0) {
        document.querySelectorAll(".scroll").forEach((div) =>
          div.setAttribute("style", "display: block")
        );
        const main = document.querySelector("main") as HTMLElement;
        main.style.overflowY = "scroll";
        canvas.remove();
      }
    }

    // @ts-ignore
    mesh.position.copy(body.position);
    // @ts-ignore
    mesh.quaternion.copy(body.quaternion);
  });

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
