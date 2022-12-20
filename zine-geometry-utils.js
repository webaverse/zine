import * as THREE from 'three';
import { pointCloudPositionalStride } from './zine-constants.js';

//

const localVector = new THREE.Vector3();

//

function pointCloudArrayBufferToPositionAttributeArray(
  arrayBuffer,
  width,
  height,
  scaleFactor,
  float32Array,
  pixelStride = 1,
) { // result in float32Array
  const dataView = new DataView(arrayBuffer);
  for (let i = 0, j = 0; i < arrayBuffer.byteLength; i += pointCloudPositionalStride) {
    if (pixelStride !== 1) {
      const i2 = i / pointCloudPositionalStride;
      const sx = i2 % width;
      const sy = Math.floor(i2 / width);
      if (sx % pixelStride !== 0 || sy % pixelStride !== 0) {
        continue;
      }
    }

    let x = dataView.getFloat32(i + 0, true);
    let y = dataView.getFloat32(i + 4, true);
    let z = dataView.getFloat32(i + 8, true);

    x *= scaleFactor;
    y *= -scaleFactor;
    z *= -scaleFactor;

    float32Array[j + 0] = x;
    float32Array[j + 1] = y;
    float32Array[j + 2] = z;

    j += 3;
  }
}
export function pointCloudArrayBufferToGeometry(arrayBuffer, width, height, pixelStride = 1) {
  // check that pixelStride is a power of 2
  if (pixelStride & (pixelStride - 1)) {
    throw new Error('pixelStride must be a power of 2');
  }

  const scaleFactor = 1 / width;
  
  const width2 = width / pixelStride;
  const height2 = height / pixelStride;

  // check that width and height are whole
  if (width2 % 1 !== 0 || height2 % 1 !== 0) {
    throw new Error('width and height must be whole after division by pixelStride');
  }

  const widthSegments = width2 - 1;
  const heightSegments = height2 - 1;
  let geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  pointCloudArrayBufferToPositionAttributeArray(
    arrayBuffer,
    width,
    height,
    scaleFactor,
    geometry.attributes.position.array,
    pixelStride,
  );
  return geometry;
}

//

export const reinterpretFloatImageData = imageData => {
  const result = new Float32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    imageData.data.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  const {width, height} = imageData;
  // flip Y
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const j = (height - 1 - y) * width + x;
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
  }
  return result;
};

//

export function depthFloat32ArrayToPositionAttributeArray(
  depthFloat32Array,
  width,
  height,
  camera,
  float32Array,
) { // result in float32Array
  for (let i = 0; i < depthFloat32Array.length; i++) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;
  
    const viewZ = depthFloat32Array[i];
    const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, camera, localVector);
    const target = worldPoint.applyMatrix4(camera.matrixWorld);

    target.toArray(float32Array, i * 3);
  }
}
export function depthFloat32ArrayToGeometry(
  depthFloat32Array,
  width,
  height,
  camera,
) { // result in float32Array
  const widthSegments = width - 1;
  const heightSegments = height - 1;
  // geometry is camera-relative
  const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  depthFloat32ArrayToPositionAttributeArray(
    depthFloat32Array,
    width,
    height,
    camera,
    geometry.attributes.position.array,
  );
  return geometry;
}

//

export function getDepthFloat32ArrayWorldPosition(
  depthFloat32Array,
  x, // 0..1
  y, // 0..1
  width,
  height,
  camera,
  scale,
  target
) { // result in target
  // compute the snapped pixel index
  let px = Math.floor(x * width);
  let py = Math.floor(y * height);

  px = Math.min(Math.max(px, 0), width - 1);
  py = Math.min(Math.max(py, 0), height - 1);

  const i = py * width + px;
  y = 1 - y;

  const viewZ = depthFloat32Array[i];
  const worldPoint = setCameraViewPositionFromViewZ(x, y, viewZ, camera, target);
  worldPoint.multiply(scale);
  worldPoint.applyMatrix4(camera.matrixWorld);
  return target;
}

//

export function depthFloat32ArrayToOrthographicPositionAttributeArray(
  depthFloat32Array,
  width,
  height,
  camera,
  float32Array,
) { // result in float32Array
  for (let i = 0; i < depthFloat32Array.length; i++) {
    const x = (i % width) / width;
    let y = Math.floor(i / width) / height;
    y = 1 - y;
  
    const viewZ = depthFloat32Array[i];
    const worldPoint = setCameraViewPositionFromOrthographicViewZ(x, y, viewZ, camera, localVector);
    const target = worldPoint.applyMatrix4(camera.matrixWorld);

    target.toArray(float32Array, i * 3);
  }
}
export function depthFloat32ArrayToOrthographicGeometry(
  depthFloat32Array,
  width,
  height,
  camera,
) { // result in float32Array
  const widthSegments = width - 1;
  const heightSegments = height - 1;
  // geometry is camera-relative
  const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  depthFloat32ArrayToOrthographicPositionAttributeArray(
    depthFloat32Array,
    width,
    height,
    camera,
    geometry.attributes.position.array,
  );
  return geometry;
}

//

export function depthFloat32ArrayToHeightfield(
  depthFloat32Array,
  width,
  height,
  camera,
) {
  // const {near, far} = camera;

  const heightfield = new Float32Array(width * height);
  for (let i = 0; i < depthFloat32Array.length; i++) {
    let x = (i % width);
    let y = Math.floor(i / width);
    // y = height - 1 - y;
    x = width - 1 - x;

    const index = x + y * width;

    const viewZ = depthFloat32Array[i];
    const depth = camera.position.y - viewZ;
    heightfield[index] = depth;
  }
  return heightfield;

  // const widthSegments = width - 1;
  // const heightSegments = height - 1;
  // // geometry is camera-relative
  // const geometry = new THREE.PlaneGeometry(1, 1, widthSegments, heightSegments);
  // depthFloat32ArrayToOrthographicPositionAttributeArray(
  //   depthFloat32Array,
  //   width,
  //   height,
  //   camera,
  //   geometry.attributes.position.array,
  // );
  // return geometry;
}

//

export const getGepthFloatsFromGeometryPositions = geometryPositions => {
  const newDepthFloatImageData = new Float32Array(geometryPositions.length / 3);
  for (let i = 0; i < newDepthFloatImageData.length; i++) {
    newDepthFloatImageData[i] = geometryPositions[i * 3 + 2];
  }
  return newDepthFloatImageData;
};
export const getDepthFloatsFromPointCloud = (pointCloudArrayBuffer, width, height) => {
  const geometryPositions = new Float32Array(width * height * 3);
  const scaleFactor = 1 / width;
  pointCloudArrayBufferToPositionAttributeArray(
    pointCloudArrayBuffer,
    width,
    height,
    scaleFactor,
    geometryPositions,
  );
  return getGepthFloatsFromGeometryPositions(geometryPositions);
};
export const getDepthFloatsFromIndexedGeometry = geometry => getGepthFloatsFromGeometryPositions(geometry.attributes.position.array);

//

export const snapPointCloudToCamera = (pointCloudArrayBuffer, width, height, camera) => {
  pointCloudArrayBuffer = pointCloudArrayBuffer.slice();

  const frustum = localFrustum.setFromProjectionMatrix(camera.projectionMatrix);
  const offset = camera.near;
  // for (const plane of frustum.planes) {
  //   // plane.translate(localVector.set(0, 0, offset));
  // }

  // THREE.JS planes are in the following order:
  // 0: left
  // 1: right
  // 2: top
  // 3: bottom
  // 4: near
  // 5: far

  const scaleFactor = 1 / width;
  const dataView = new DataView(pointCloudArrayBuffer);
  for (
    let i = 0;
    i < pointCloudArrayBuffer.byteLength;
    i += pointCloudPositionalStride
  ) {
    let x = dataView.getFloat32(i    , true);
    let y = dataView.getFloat32(i + 4, true);
    let z = dataView.getFloat32(i + 8, true);

    x *= scaleFactor;
    y *= -scaleFactor;
    z *= -scaleFactor;

    const p = localVector.set(x, y, z);

    p.z += offset;

    // clamp the point to the camera frustum
    let modified = false;
    // for (let j = 0; j < frustum.planes.length; j++) { // ignore near and far planes?
    for (let j = 0; j < 4; j++) {
      const plane = frustum.planes[j];
      const distance = plane.distanceToPoint(p);
      if (distance < 0) {
        // adjust outwards
        const outerPlane = plane;
        const outerDistance = outerPlane.distanceToPoint(p);
        p.addScaledVector(outerPlane.normal, -outerDistance);
        modified = true;
      }
    }

    // if (modified) {
      // p.z += offset;

      p.x /= scaleFactor;
      p.y /= -scaleFactor;
      p.z /= -scaleFactor;

      dataView.setFloat32(i + 0, p.x, true);
      dataView.setFloat32(i + 4, p.y, true);
      dataView.setFloat32(i + 8, p.z, true);
    // }
  }

  return pointCloudArrayBuffer;
};

//

export function decorateGeometryTriangleIds(geometry) {
  const triangleIdAttribute = new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1);
  for (let i = 0; i < triangleIdAttribute.count; i++) {
    triangleIdAttribute.array[i] = Math.floor(i / 3);
  }
  geometry.setAttribute('triangleId', triangleIdAttribute);
}

//

function viewZToOrthographicDepth(viewZ, near, far) {
  return ( viewZ + near ) / ( near - far );
}
function orthographicDepthToViewZ(orthoZ, near, far) {
  return orthoZ * ( near - far ) - near;
}
export const setCameraViewPositionFromViewZ = (x, y, viewZ, camera, target) => {
  const {near, far, projectionMatrix, projectionMatrixInverse} = camera;
  
  const depth = viewZToOrthographicDepth(viewZ, near, far);

  const clipW = projectionMatrix.elements[2 * 4 + 3] * viewZ + projectionMatrix.elements[3 * 4 + 3];
  const clipPosition = new THREE.Vector4(
    (x - 0.5) * 2,
    (y - 0.5) * 2,
    (depth - 0.5) * 2,
    1
  );
  clipPosition.multiplyScalar(clipW);
  const viewPosition = clipPosition.applyMatrix4(projectionMatrixInverse);
  
  target.x = viewPosition.x;
  target.y = viewPosition.y;
  target.z = viewPosition.z;
  return target;
};
export const setCameraViewPositionFromOrthographicViewZ = (x, y, viewZ, camera, target) => {
  const {near, far, projectionMatrix, projectionMatrixInverse} = camera;

  // if (isNaN(viewZ)) {
  //   console.warn('viewZ is nan', viewZ, near, far);
  //   debugger;
  // }

  const depth = viewZToOrthographicDepth(viewZ, near, far);
  // const depth = viewZ;
  // if (isNaN(depth)) {
  //   console.warn('depth is nan', depth, viewZ, near, far);
  //   debugger;
  // }

  // get the ndc point, which we will use for the unproject
  const ndcPoint = new THREE.Vector3(
    (x - 0.5) * 2,
    (y - 0.5) * 2,
    (depth - 0.5) * 2
  );
  // if (isNaN(ndcPoint.x)) {
  //   console.warn('ndcPoint.x is nan', ndcPoint.toArray());
  //   debugger;
  // }

  // apply the unprojection
  const worldPoint = ndcPoint.clone()
    // .unproject(camera);
    .applyMatrix4(projectionMatrixInverse);

  // if (isNaN(worldPoint.x)) {
  //   console.warn('worldPoint.x is nan', worldPoint.toArray());
  //   debugger;
  // }

  target.x = worldPoint.x;
  target.y = worldPoint.y;
  target.z = worldPoint.z;
  return target;
}
