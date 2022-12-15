import * as THREE from 'three';
import alea from 'alea';
import {
  mainImageKey,
  // promptKey,
  // layer2Specs,
} from './zine-data-specs.js';
import {
  makeDefaultCamera,
  // normalToQuaternion,
} from './zine-utils.js';
import {
  // getDepthFloatsFromIndexedGeometry,
  // reinterpretFloatImageData,
  pointCloudArrayBufferToGeometry,
  decorateGeometryTriangleIds,
  depthFloat32ArrayToOrthographicGeometry,
} from '../zine/zine-geometry-utils.js';
import {
  setOrthographicCameraFromJson,
} from './zine-camera-utils.js';
import {
  floorNetPixelSize,
  physicsPixelStride,
} from './zine-constants.js';

//

// const upVector = new THREE.Vector3(0, 1, 0);
// const backwardVector = new THREE.Vector3(0, 0, 1);
const oneVector = new THREE.Vector3(1, 1, 1);
const y180Matrix = new THREE.Matrix4().makeRotationY(Math.PI);

const fakeMaterial = new THREE.MeshBasicMaterial({
  color: 0x0000FF,
  transparent: true,
  opacity: 0.2,
});

//

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();

//

class SceneMaterial extends THREE.ShaderMaterial {
  constructor({
    map,
  }) {
    super({
      uniforms: {
        map: {
          value: map,
          needsUpdate: true,
        },
        selectedIndicesMap: {
          value: null,
          needsUpdate: false,
        },
        iSelectedIndicesMapResolution: {
          value: new THREE.Vector2(),
          needsUpdate: false,
        },
        uEraser: {
          value: 0,
          needsUpdate: true,
        },
        uMouseDown: {
          value: 0,
          needsUpdate: true,
        },
      },
      vertexShader: `\
        attribute float triangleId;
        varying vec2 vUv;
        varying float vTriangleId;
        
        void main() {
          vUv = uv;
          vTriangleId = triangleId;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `\
        uniform sampler2D map;
        uniform sampler2D selectedIndicesMap;
        uniform vec2 iSelectedIndicesMapResolution;
        uniform int uEraser;
        uniform int uMouseDown;

        varying vec2 vUv;
        varying float vTriangleId;

        void main() {
          gl_FragColor = texture2D(map, vUv);
          
          if (uEraser == 1) {
            // check for selection
            float x = mod(vTriangleId, iSelectedIndicesMapResolution.x);
            float y = floor(vTriangleId / iSelectedIndicesMapResolution.x);
            vec2 uv = (vec2(x, y) + 0.5) / iSelectedIndicesMapResolution;
            vec4 selectedIndexRgba = texture2D(selectedIndicesMap, uv);
            bool isSelected = selectedIndexRgba.r > 0.5;
            if (isSelected) {
              if (uMouseDown == 1) {
                gl_FragColor.rgb = vec3(${new THREE.Color(0xFF3333).toArray().join(', ')});
              } else {
                gl_FragColor.rgb *= 0.2;
              }
            }
          }
        }
      `,
    })
  }
}
class SceneMesh extends THREE.Mesh {
  constructor({
    pointCloudArrayBuffer,
    imgArrayBuffer,
    width,
    height,
    segmentSpecs,
    planeSpecs,
    portalSpecs,
    firstFloorPlaneIndex,
  }) {
    const map = new THREE.Texture();
    const material = new SceneMaterial({
      map,
    });

    // scene mesh
    let geometry = pointCloudArrayBufferToGeometry(
      pointCloudArrayBuffer,
      width,
      height,
    );
    geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
    geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
    geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
    geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
    // geometry.setAttribute('portal', new THREE.BufferAttribute(portalSpecs.array, 1));
    geometry.setAttribute('portalColor', new THREE.BufferAttribute(portalSpecs.colorArray, 3));
    const indexedGeometry = geometry;
    geometry = geometry.toNonIndexed();
    decorateGeometryTriangleIds(geometry);

    super(geometry, material);

    const sceneMesh = this;
    sceneMesh.name = 'sceneMesh';
    sceneMesh.frustumCulled = false;
    sceneMesh.indexedGeometry = indexedGeometry;
    sceneMesh.segmentSpecs = segmentSpecs;
    sceneMesh.planeSpecs = planeSpecs;
    sceneMesh.portalSpecs = portalSpecs;
    sceneMesh.firstFloorPlaneIndex = firstFloorPlaneIndex;
    sceneMesh.update = (selector) => {
      sceneMesh.material.uniforms.uMouseDown.value = +selector.mousedown;
      sceneMesh.material.uniforms.uMouseDown.needsUpdate = true;
    };
    (async () => { // load the texture image
      sceneMesh.visible = false;

      const imgBlob = new Blob([imgArrayBuffer], {
        type: 'image/png',
      });
      map.image = await createImageBitmap(imgBlob, {
        imageOrientation: 'flipY',
      });
      // map.encoding = THREE.sRGBEncoding;
      map.needsUpdate = true;

      sceneMesh.visible = true;
    })();
  }
}

//

class ScenePhysicsMesh extends THREE.Mesh {
  constructor({
    pointCloudArrayBuffer,
    width,
    height,
  }) {
    let geometry = pointCloudArrayBufferToGeometry(
      pointCloudArrayBuffer,
      width,
      height,
      physicsPixelStride,
    );
    // geometry.setAttribute('segment', new THREE.BufferAttribute(segmentSpecs.array, 1));
    // geometry.setAttribute('segmentColor', new THREE.BufferAttribute(segmentSpecs.colorArray, 3));
    // geometry.setAttribute('plane', new THREE.BufferAttribute(planeSpecs.array, 1));
    // geometry.setAttribute('planeColor', new THREE.BufferAttribute(planeSpecs.colorArray, 3));
    // // geometry.setAttribute('portal', new THREE.BufferAttribute(portalSpecs.array, 1));
    // geometry.setAttribute('portalColor', new THREE.BufferAttribute(portalSpecs.colorArray, 3));
    // const indexedGeometry = geometry;
    // geometry = geometry.toNonIndexed();
    // decorateGeometryTriangleIds(geometry);
    super(geometry, fakeMaterial);

    const scenePhysicsMesh = this;
    scenePhysicsMesh.name = 'scenePhysicsMesh';
    scenePhysicsMesh.visible = false;
    scenePhysicsMesh.enabled = false;
    scenePhysicsMesh.updateVisibility = () => {
      scenePhysicsMesh.visible = scenePhysicsMesh.enabled;
    };
  }
}

//

class FloorNetMesh extends THREE.Mesh {
  constructor() {
    const geometry = new THREE.PlaneBufferGeometry(1, 1);

    const material = new THREE.MeshPhongMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0.7,
      side: THREE.BackSide,
    });

    super(geometry, material);

    const floorNetMesh = this;
    floorNetMesh.enabled = false;
    let hasGeometry = false;
    floorNetMesh.setGeometry = ({
      floorNetDepths,
      floorNetCamera,
    }) => {
      const geometry = depthFloat32ArrayToOrthographicGeometry(
        floorNetDepths,
        floorNetPixelSize,
        floorNetPixelSize,
        floorNetCamera,
      );
      geometry.computeVertexNormals();
      floorNetMesh.geometry = geometry;

      hasGeometry = true;
      floorNetMesh.updateVisibility();
    };
    floorNetMesh.updateVisibility = () => {
      floorNetMesh.visible = floorNetMesh.enabled && hasGeometry;
    };
    floorNetMesh.frustumCulled = false;
    floorNetMesh.visible = false;
  }
}

//

export class ZineRenderer extends EventTarget {
  constructor({
    panel,
  }) {
    super();

    this.panel = panel;
    const layer0 = panel.getLayer(0);
    const layer1 = panel.getLayer(1);
    const imgArrayBuffer = layer0.getData(mainImageKey);
    const resolution = layer1.getData('resolution');
    const position = layer1.getData('position');
    const quaternion = layer1.getData('quaternion');
    const scale = layer1.getData('scale');
    const segmentMask = layer1.getData('segmentMask');
    const pointCloudHeaders = layer1.getData('pointCloudHeaders');
    const pointCloudArrayBuffer = layer1.getData('pointCloud');
    const planesJson = layer1.getData('planesJson');
    const planesMask = layer1.getData('planesMask');
    const portalJson = layer1.getData('portalJson');
    const segmentSpecs = layer1.getData('segmentSpecs');
    const planeSpecs = layer1.getData('planeSpecs');
    const portalSpecs = layer1.getData('portalSpecs');
    const firstFloorPlaneIndex = layer1.getData('firstFloorPlaneIndex');
    const floorNetDepths = layer1.getData('floorNetDepths');
    const floorNetCameraJson = layer1.getData('floorNetCameraJson');
    const floorPlaneLocation = layer1.getData('floorPlaneLocation');
    const cameraEntranceLocation = layer1.getData('cameraEntranceLocation');
    const entranceExitLocations = layer1.getData('entranceExitLocations');
    const portalLocations = layer1.getData('portalLocations');
    const candidateLocations = layer1.getData('candidateLocations');
    const predictedHeight = layer1.getData('predictedHeight');

    // scene
    const scene = new THREE.Scene();
    scene.autoUpdate = false;
    this.scene = scene;

    // scale scene
    const transformScene = new THREE.Scene();
    transformScene.autoUpdate = false;
    transformScene.position.fromArray(position);
    transformScene.quaternion.fromArray(quaternion);
    transformScene.scale.fromArray(scale);
    this.scene.add(transformScene);
    this.transformScene = transformScene;

    // camera
    const camera = makeDefaultCamera();
    this.camera = camera;
    this.camera.fov = Number(pointCloudHeaders['x-fov']);
    this.camera.updateProjectionMatrix();

    // scene mesh
    const sceneMesh = new SceneMesh({
      pointCloudArrayBuffer,
      imgArrayBuffer,
      width: resolution[0],
      height: resolution[1],
      segmentSpecs,
      planeSpecs,
      portalSpecs,
      firstFloorPlaneIndex,
    });
    this.transformScene.add(sceneMesh);
    this.sceneMesh = sceneMesh;

    // scene physics mesh
    const scenePhysicsMesh = new ScenePhysicsMesh({
      pointCloudArrayBuffer,
      width: resolution[0],
      height: resolution[1],
    });
    this.transformScene.add(scenePhysicsMesh);
    this.scenePhysicsMesh = scenePhysicsMesh;

    // floor net mesh
    const floorNetMesh = new FloorNetMesh();
    const floorNetCamera = setOrthographicCameraFromJson(
      new THREE.OrthographicCamera(),
      floorNetCameraJson
    );
    floorNetMesh.setGeometry({
      floorNetDepths,
      floorNetCamera,
    });
    this.transformScene.add(floorNetMesh);
    this.floorNetMesh = floorNetMesh;

    // update transforms
    this.scene.updateMatrixWorld();

    // metadata
    this.metadata = {
      position,
      quaternion,
      scale,
      floorPlaneLocation,
      cameraEntranceLocation,
      entranceExitLocations,
      portalLocations,
      candidateLocations,
    };

    this.#listen();
  }
  #listen() {
    const layer1 = this.panel.getLayer(1);
    layer1.addEventListener('update', e => {
      console.log('layer 1 got update event', e);

      const {key, value, keyPath} = e.data;
      const transformKeys = [
        'position',
        'quaternion',
        'scale',
      ];
      if (transformKeys.includes(key)) {
        this.#syncTransformToData();
      }
    });
  }
  #syncTransformToData() { // update scene transform to match panel data
    const layer1 = this.panel.getLayer(1);
    const position = layer1.getData('position');
    const quaternion = layer1.getData('quaternion');
    const scale = layer1.getData('scale');
    
    this.transformScene.position.fromArray(position);
    this.transformScene.quaternion.fromArray(quaternion);
    this.transformScene.scale.fromArray(scale);
    this.transformScene.updateMatrixWorld();

    this.dispatchEvent(new MessageEvent('transformchange'));
  }
  getScale() {
    const layer1 = this.panel.getLayer(1);
    const scale = layer1.getData('scale');
    return scale[0];
  }
  setScale(scale) {
    const layer1 = this.panel.getLayer(1);
    layer1.setData('scale', [scale, scale, scale]);
  }
  connect(targetZineRenderer, exitIndex = 1, entranceIndex = 0) {
    const exitLocation = this.metadata.entranceExitLocations[exitIndex];
    // if (!exitLocation) {
    //   console.warn('no exit location', exitIndex);
    //   debugger;
    // }
    const exitMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(exitLocation.position),
      new THREE.Quaternion().fromArray(exitLocation.quaternion),
      oneVector
    );
    const exitMatrixWorld = exitMatrix.clone()
      .premultiply(this.transformScene.matrixWorld);
    exitMatrixWorld.decompose(
      localVector,
      localQuaternion,
      localVector2
    );
    exitMatrixWorld.compose(
      localVector,
      localQuaternion,
      oneVector
    );

    const entranceLocation = targetZineRenderer.metadata.entranceExitLocations[entranceIndex];
    // if (!entranceLocation) {
    //   console.warn('no entrance location', entranceIndex);
    //   debugger;
    // }
    const entranceMatrix = new THREE.Matrix4().compose(
      localVector.fromArray(entranceLocation.position),
      localQuaternion.fromArray(entranceLocation.quaternion),
      oneVector
    );
    const entranceMatrixWorld = entranceMatrix.clone()
      .premultiply(targetZineRenderer.transformScene.matrixWorld);
      entranceMatrixWorld.decompose(
      localVector,
      localQuaternion,
      localVector2
    );
    entranceMatrixWorld.compose(
      localVector,
      localQuaternion,
      oneVector
    );
    const entranceMatrixWorldInverse = entranceMatrixWorld.clone()
      .invert();

    // console.log('entrance exit locations', {
    //   exitLocation,
    //   entranceLocation,
    // });

    // undo the target entrance transform
    // then, apply the exit transform
    targetZineRenderer.scene.matrix
      .premultiply(entranceMatrixWorldInverse)
      .premultiply(y180Matrix)
      .premultiply(exitMatrixWorld)
    targetZineRenderer.scene.matrix
      .decompose(
        targetZineRenderer.scene.position,
        targetZineRenderer.scene.quaternion,
        targetZineRenderer.scene.scale
      );
    targetZineRenderer.scene.updateMatrixWorld();
  }
}