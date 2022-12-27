// export const idKey = 'id';
export const mainImageKey = 'image';
export const promptKey = 'prompt';
export const layer0Specs = [
  // idKey,
  mainImageKey,
  promptKey,
];

//

export const layer1Specs = [
  'resolution',
  'position',
  'quaternion',
  'scale',
  'cameraJson',
  'depthFieldHeaders',
  'depthField',
  'planesJson',
  'portalJson',
  'segmentLabels',
  'segmentLabelIndices',
  'planeLabels',
  'planeLabelIndices',
  'portalLabels',
  // 'segmentSpecs',
  // 'planeSpecs',
  // 'portalSpecs',
  'firstFloorPlaneIndex',
  'floorPlaneJson',
  'floorResolution',
  'floorNetDepths',
  'floorNetCameraJson',
  'floorPlaneLocation',
  'cameraEntranceLocation',
  'entranceExitLocations',
  'portalLocations',
  'candidateLocations',
  'predictedHeight',
  'edgeDepths',
  'paths',
];
export const layer0CompressionSpecs = [
  {
    layer: 0,
    key: mainImageKey,
    type: 'image',
  },
];
export const layer1CompressionSpecs = [
  {
    layer: 1,
    key: 'depthField',
    type: 'depth',
  },
  {
    layer: 1,
    key: 'floorNetDepths',
    type: 'depth',
  }
];

//

export const layer2Specs = [
  'maskImg',
  'editedImg',
  'depthFieldHeaders',
  'depthField',
  'depthFloatImageData',
  'distanceFloatImageData',
  'distanceNearestPositions',
  'newDepthFloatImageData',
  'reconstructedDepthFloats',
  'planesJson',
  'planesMask',
  'portalJson',
  'segmentLabels',
  'segmentLabelIndices',
  'planeLabels',
  'planeLabelIndices',
  'portalLabels',
  // 'segmentSpecs',
  // 'planeSpecs',
  // 'portalSpecs',
  'floorResolution',
  'floorNetDepths',
  'floorNetCameraJson',
  'segmentMask',
  'editCameraJson',
];