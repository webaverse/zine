export const mainImageKey = 'image';
export const promptKey = 'prompt';
export const layer0Specs = [
  mainImageKey,
  promptKey,
];

//

export const layer1Specs = [
  'resolution',
  'position',
  'quaternion',
  'scale',
  'segmentMask',
  'cameraJson',
  'pointCloudHeaders',
  'pointCloud',
  'planesJson',
  'planesMask',
  'portalJson',
  'segmentSpecs',
  'planeSpecs',
  'portalSpecs',
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
  'paths',
];

//

export const layer2Specs = [
  'maskImg',
  'editedImg',
  'pointCloudHeaders',
  'pointCloud',
  'depthFloatImageData',
  'distanceFloatImageData',
  'distanceNearestPositions',
  'newDepthFloatImageData',
  'reconstructedDepthFloats',
  'planesJson',
  'planesMask',
  'portalJson',
  'floorResolution',
  'floorNetDepths',
  'floorNetCameraJson',
  'segmentMask',
  'editCameraJson',
];