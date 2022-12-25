import * as THREE from 'three';
// import alea from 'alea';
import {
  mainImageKey,
} from './zine-data-specs.js';
import {
  // makePromise,
  makeDefaultCamera,
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
  pointcloudStride,
  physicsPixelStride,
} from './zine-constants.js';

//

const zeroVector = new THREE.Vector3(0, 0, 0);
const oneVector = new THREE.Vector3(1, 1, 1);
const y180Quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
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
const localMatrix = new THREE.Matrix4();

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
    });
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

      this.dispatchEvent({
        type: 'load',
      });
    })();
  }
}

//

class CapSceneMesh extends THREE.Mesh {
  constructor({
    edgeDepths,
    map,
    width,
    height,
  }) {
    const numTriangles = (
      (width - 1) * 2 + (height - 1) * 2
    );

    // geometry
    const geometry = new THREE.BufferGeometry();
    // positions
    const positions = new Float32Array(
      (
        width + width + height + height +
        // one center point per triangle, for distinct uv coordinates
        numTriangles
      ) * 3
    );
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // uvs
    const uvs = new Float32Array(positions.length / 3 * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    // indices
    const indices = new Uint16Array(numTriangles * 3);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    {
      // fill in the center points
      const centerPoint = new THREE.Vector3(0, 0, 0);
      const centerPointVertexStartIndex = (width + width + height + height);
      for (let i = 0; i < numTriangles; i++) {
        positions[centerPointVertexStartIndex * 3 + i * 3 + 0] = centerPoint.x;
        positions[centerPointVertexStartIndex * 3 + i * 3 + 1] = centerPoint.y;
        positions[centerPointVertexStartIndex * 3 + i * 3 + 2] = centerPoint.z;
        // uvs[centerPointVertexStartIndex * 2 + i * 2 + 0] = 0.5;
        // uvs[centerPointVertexStartIndex * 2 + i * 2 + 1] = 0.5;
      }

      // fill in remaining points
      let positionIndex = 0;
      let uvIndex = 0;
      let uvCenterPointIndex = (width + width + height + height) * 2;
      let indexIndex = 0;
      for (const edgeSpec of [
        {
          pointsArray: edgeDepths.tops,
          uvStart: new THREE.Vector2(0, 0),
          uvEnd: new THREE.Vector2(1, 0),
          flip: false,
        },
        {
          pointsArray: edgeDepths.bottoms,
          uvStart: new THREE.Vector2(0, 1),
          uvEnd: new THREE.Vector2(1, 1),
          flip: true,
        },
        {
          pointsArray: edgeDepths.lefts,
          uvStart: new THREE.Vector2(0, 0),
          uvEnd: new THREE.Vector2(0, 1),
          flip: true,
        },
        {
          pointsArray: edgeDepths.rights,
          uvStart: new THREE.Vector2(1, 0),
          uvEnd: new THREE.Vector2(1, 1),
          flip: false,
        },
      ]) {
        const {
          pointsArray,
          uvStart,
          uvEnd,
          flip,
        } = edgeSpec;
        // indices
        // connect the points to the center point
        for (let i = 0; i < pointsArray.length - 1; i++) {
          const a = positionIndex / 3 + i;
          const b = a + 1;
          const c = centerPointVertexStartIndex + indexIndex / 3;
          if (!flip) {
            indices[indexIndex++] = a;
            indices[indexIndex++] = b;
            indices[indexIndex++] = c;
          } else {
            indices[indexIndex++] = a;
            indices[indexIndex++] = c;
            indices[indexIndex++] = b;
          }
        }

        // positions
        for (let i = 0; i < pointsArray.length; i++) {
          const pointArray = pointsArray[i];
          localVector.fromArray(pointArray)
            // .applyMatrix4(matrixWorld)
            .toArray(positions, positionIndex);
          positionIndex += 3;
        }

        // uvs
        for (let i = 0; i < pointsArray.length; i++) {
          const uv = uvStart.clone()
            .lerp(uvEnd, i / (pointsArray.length - 1));
          uvs[uvIndex++] = uv.x;
          uvs[uvIndex++] = 1 - uv.y;
        }
        // center point uvs
        for (let i = 0; i < pointsArray.length - 1; i++) {
          const uv = uvStart.clone()
            .lerp(uvEnd, i / (pointsArray.length - 1));
          uvs[uvCenterPointIndex++] = uv.x;
          uvs[uvCenterPointIndex++] = 1 - uv.y;
        }
      }
    }

    // material
    // const map = new THREE.Texture(image);
    // map.needsUpdate = true;
    // const material = new THREE.MeshBasicMaterial({
    //   // color: 0x000000,
    //   map,
    //   side: THREE.DoubleSide,
    // });
    const material = new SceneMaterial({
      map,
    });

    // mesh
    super(geometry, material);
  }
}

//

class ScenePhysicsMesh extends THREE.Mesh {
  constructor({
    pointCloudArrayBuffer,
    width,
    height,
    segmentSpecs,
  }) {
    let geometry = pointCloudArrayBufferToGeometry(
      pointCloudArrayBuffer,
      width,
      height,
      physicsPixelStride,
    );

    // maintain segmentSpecs.array -> 'segments' attribute
    const segments = new segmentSpecs.array.constructor( // Float32Array
      segmentSpecs.array.length / (physicsPixelStride * physicsPixelStride)
    );
    // if (segments.length * 3 !== geometry.attributes.position.array.length) {
    //   console.log('mismatch', segments.length, geometry.attributes.position.array.length);
    //   debugger;
    // }
    const arrayBuffer = pointCloudArrayBuffer;
    const pixelStride = physicsPixelStride;
    for (let i = 0, j = 0; i < arrayBuffer.byteLength; i += pointcloudStride) {
      if (pixelStride !== 1) {
        const i2 = i / pointcloudStride;
        const sx = i2 % width;
        const sy = Math.floor(i2 / width);
        if (sx % pixelStride !== 0 || sy % pixelStride !== 0) { // skip non-stride points
          continue;
        }
      }

      const s = segmentSpecs.array[i / pointcloudStride];
      segments[j] = s;

      j++;
    }
    geometry.setAttribute('segment', new THREE.BufferAttribute(segments, 1));

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
    alignFloor = false,
  }) {
    super();

    // members
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
    const edgeDepths = layer1.getData('edgeDepths');
    const paths = layer1.getData('paths');

    const [width, height] = resolution;

    // scene
    const scene = new THREE.Object3D();
    // scene.autoUpdate = false;
    this.scene = scene;

    // scale scene
    const transformScene = new THREE.Object3D();
    // transformScene.autoUpdate = false;
    transformScene.position.fromArray(position);
    transformScene.quaternion.fromArray(quaternion);
    transformScene.scale.fromArray(scale);
    transformScene.updateMatrixWorld();
    this.scene.add(transformScene);
    this.transformScene = transformScene;

    // render edge depths
    {
      const depthCubesGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const depthCubesMaterial = new THREE.MeshBasicMaterial({
        color: 0x0000FF,
        // vertexColors: true,
      });

      // console.log('render edge depth resolution', width, height, resolution);
      const depthCubesMesh = new THREE.InstancedMesh(
        depthCubesGeometry,
        depthCubesMaterial,
        width + width + height + height
      );
      depthCubesMesh.count = 0;
      depthCubesMesh.frustumCulled = false;
      let index = 0;
      [
        edgeDepths.tops,
        edgeDepths.bottoms,
        edgeDepths.lefts,
        edgeDepths.rights,
      ].forEach(ps => {
        for (let i = 0; i < ps.length; i++) {
          const pointArray = ps[i];
          localMatrix.makeTranslation(pointArray[0], pointArray[1], pointArray[2])
          depthCubesMesh.setMatrixAt(index++, localMatrix);
          depthCubesMesh.count++;
        }
      });
      depthCubesMesh.instanceMatrix.needsUpdate = true;
      this.transformScene.add(depthCubesMesh);
      depthCubesMesh.updateMatrixWorld();
    }
    {
      const depthCubesGeometry2 = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      const depthCubesMaterial2 = new THREE.MeshBasicMaterial({
        color: 0xFF0000,
        // vertexColors: true,
      });

      const depthCubesMesh2 = new THREE.InstancedMesh(
        depthCubesGeometry2,
        depthCubesMaterial2,
        width + width + height + height
      );
      depthCubesMesh2.count = 0;
      depthCubesMesh2.frustumCulled = false;
      let index = 0;
      [
        edgeDepths.top,
        edgeDepths.bottom,
        edgeDepths.left,
        edgeDepths.right,
      ].forEach(point => {
        // min
        localMatrix.compose(
          new THREE.Vector3().fromArray(point.min),
          new THREE.Quaternion(),
          new THREE.Vector3(4, 4, 4)
        )
          .premultiply(transformScene.matrixWorld);
        depthCubesMesh2.setMatrixAt(index++, localMatrix);
        depthCubesMesh2.count++;

        // max
        localMatrix.compose(
          new THREE.Vector3().fromArray(point.max),
          new THREE.Quaternion(),
          new THREE.Vector3(2, 2, 2)
        )
          .premultiply(transformScene.matrixWorld);
        depthCubesMesh2.setMatrixAt(index++, localMatrix);
        depthCubesMesh2.count++;
      });
      depthCubesMesh2.instanceMatrix.needsUpdate = true;
      this.transformScene.add(depthCubesMesh2);
      depthCubesMesh2.updateMatrixWorld();
    }

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
    sceneMesh.addEventListener('load', e => {
      this.dispatchEvent(new MessageEvent('load'));
    });
    this.sceneMesh = sceneMesh;

    // cap mesh
    const capSceneMesh = new CapSceneMesh({
      edgeDepths,
      matrixWorld: transformScene.matrixWorld,
      map: sceneMesh.material.uniforms.map.value,
      width: resolution[0],
      height: resolution[1],
    });
    // capSceneMesh.frustumCulled = false;
    capSceneMesh.visible = false;
    this.transformScene.add(capSceneMesh);
    this.capSceneMesh = capSceneMesh;

    // scene physics mesh
    const scenePhysicsMesh = new ScenePhysicsMesh({
      pointCloudArrayBuffer,
      width: resolution[0],
      height: resolution[1],
      segmentSpecs,
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
    
    if (alignFloor) {
      const floorInverseQuaternion = localQuaternion
        .fromArray(floorPlaneLocation.quaternion)
        .invert();

      scene.quaternion.copy(floorInverseQuaternion);
      scene.updateMatrixWorld();
      
      camera.quaternion.copy(floorInverseQuaternion);
      camera.updateMatrixWorld();
    }
 
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
      edgeDepths,
      paths,
    };

    this.#listen();
  }
  #listen() {
    const layer1 = this.panel.getLayer(1);
    layer1.addEventListener('update', e => {
      // console.log('layer 1 got update event', e);

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

    // undo the target entrance transform
    // then, apply the exit transform
    const transformMatrix = new THREE.Matrix4()
      .copy(entranceMatrixWorldInverse)
      .premultiply(y180Matrix)
      .premultiply(exitMatrixWorld)
    targetZineRenderer.scene.matrix
      .premultiply(transformMatrix)
      .decompose(
        targetZineRenderer.scene.position,
        targetZineRenderer.scene.quaternion,
        targetZineRenderer.scene.scale
      );
    targetZineRenderer.scene.updateMatrixWorld();

    targetZineRenderer.camera.matrix
      .premultiply(transformMatrix)
      .decompose(
        targetZineRenderer.camera.position,
        targetZineRenderer.camera.quaternion,
        targetZineRenderer.camera.scale
      );
    targetZineRenderer.camera.updateMatrixWorld();

    // XXX resize the exit rectangle to match scale of the next rectangle,
    // so that we only enter the next panel in an area that's in bounds
  }
}