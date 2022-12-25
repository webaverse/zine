export const panelSize = 1024;

export const floorNetWorldSize = 100;
export const floorNetWorldDepth = 1000;
export const floorNetResolution = 0.1;
export const floorNetPixelSize = floorNetWorldSize / floorNetResolution;

export const pointcloudStride = 4 + 4 + 4;
export const physicsPixelStride = 8; // factor to reduce the physics mesh by

export const portalExtrusion = 1; // 1m

export const entranceExitHeight = 2;
export const entranceExitWidth = 2;
export const entranceExitDepth = 10; // backward depth of an exit

export const entranceExitEmptyDiameter = portalExtrusion / 2;
