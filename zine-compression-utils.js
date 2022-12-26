// compression utils

import DracoEncoderModule from './lib/draco/draco_encoder.js';
import DracoDecoderModule from './lib/draco/draco_decoder.js';

export const compressPointCloud = async vertices => {
  const numPoints = vertices.length / 3;
  
  const [
    encoderModule,
    // decoderModule,
  ] = await Promise.all([
    DracoEncoderModule(),
    // DracoDecoderModule(),
  ]);
  
  const encoder = new encoderModule.Encoder();
  const pointCloudBuilder = new encoderModule.PointCloudBuilder();
  const dracoPointCloud = new encoderModule.PointCloud();

  const positionAttribute = pointCloudBuilder.AddFloatAttribute(dracoPointCloud, encoderModule.POSITION, numPoints, 3, vertices);

  const encodedData = new encoderModule.DracoInt8Array();
  // Use default encoding setting.
  // long EncodePointCloudToDracoBuffer(PointCloud pc, boolean deduplicate_values, DracoInt8Array encoded_data);
  const encodedLen = encoder.EncodePointCloudToDracoBuffer(dracoPointCloud, false, encodedData);
  const uint8Array = new Uint8Array(encodedLen);
  const int8Array = new Int8Array(uint8Array.buffer);
  for (let i = 0; i < encodedLen; i++) {
    int8Array[i] = encodedData.GetValue(i);
  }
  const result = uint8Array;

  encoderModule.destroy(encodedData);
  encoderModule.destroy(dracoPointCloud);
  encoderModule.destroy(encoder);
  encoderModule.destroy(pointCloudBuilder);

  return result;
};
export const decompressPointCloud = async byteArray => {
  const [
    // encoderModule,
    decoderModule,
  ] = await Promise.all([
    // DracoEncoderModule(),
    DracoDecoderModule(),
  ]);

  // Create the Draco decoder.
  const buffer = new decoderModule.DecoderBuffer();
  buffer.Init(byteArray, byteArray.length);

  // Create a buffer to hold the encoded data.
  const decoder = new decoderModule.Decoder();
  const geometryType = decoder.GetEncodedGeometryType(buffer);

  // Decode the encoded geometry.
  let outputGeometry;
  let status;
  if (geometryType == decoderModule.TRIANGULAR_MESH) {
    // outputGeometry = new decoderModule.Mesh();
    // status = decoder.DecodeBufferToMesh(buffer, outputGeometry);
    throw new Error('decompress failed because the encoded geometry is not a point cloud');
  } else {
    outputGeometry = new decoderModule.PointCloud();
    status = decoder.DecodeBufferToPointCloud(buffer, outputGeometry);
  }

  const pc = outputGeometry;
  // long GetAttributeId([Ref, Const] PointCloud pc, draco_GeometryAttribute_Type type);
  const positionAttribute = decoder.GetAttribute(pc, 0);
  // boolean GetAttributeFloatForAllPoints([Ref, Const] PointCloud pc, [Ref, Const] PointAttribute pa, DracoFloat32Array out_values);
  const positionAttributeData = new decoderModule.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(pc, positionAttribute, positionAttributeData);

  // copy data
  const float32Array = new Float32Array(positionAttributeData.size());
  for (let i = 0; i < float32Array.length; i++) {
    float32Array[i] = positionAttributeData.GetValue(i);
  }

  // You must explicitly delete objects created from the DracoDecoderModule
  // or Decoder.
  decoderModule.destroy(pc);
  decoderModule.destroy(positionAttribute);
  decoderModule.destroy(positionAttributeData);
  decoderModule.destroy(decoder);
  decoderModule.destroy(buffer);

  return float32Array;
};
const testPointCloudCompression = async () => {
  const testData = Float32Array.from([
    1, 2, 3,
    1, 2, 3,
    1, 2, 3,
    4, 5, 6,
    4, 5, 6,
    4, 5, 6,
    7, 8, 9,
    7, 8, 9,
    7, 8, 9,
  ]);
  const uint8Array = await compressPointCloud(testData);
  const decodedPointCloud = await decompressPointCloud(uint8Array);
  // check that they are the same
  for (let i = 0; i < testData.length; i++) {
    if (testData[i] !== decodedPointCloud[i]) {
      throw new Error('compression test failed due to data mismatch');
    }
  }
  console.log(`compression test compression ratio: ${compressionRatioString(uint8Array, testData)}`, {
    testData,
    decodedPointCloud,
  });
};
globalThis.testPointCloudCompression = testPointCloudCompression;

//

export const compressDepth = async (float32Array, quantization = -1) => {
  const numPoints = float32Array.length;
  
  const [
    encoderModule,
    // decoderModule,
  ] = await Promise.all([
    DracoEncoderModule(),
    // DracoDecoderModule(),
  ]);
  
  const encoder = new encoderModule.Encoder();
  const pointCloudBuilder = new encoderModule.PointCloudBuilder();
  const dracoPointCloud = new encoderModule.PointCloud();

  encoder.SetEncodingMethod(encoderModule.POINT_CLOUD_SEQUENTIAL_ENCODING);
  // encoder.SetEncodingMethod(encoderModule.POINT_CLOUD_KD_TREE_ENCODING);
  if (quantization !== -1) {
    encoder.SetAttributeQuantization(encoderModule.POSITION, quantization);
    encoder.SetAttributeQuantization(encoderModule.GENERIC, quantization);
  }

  const positionAttribute = pointCloudBuilder.AddFloatAttribute(
    dracoPointCloud,
    encoderModule.POSITION,
    numPoints,
    1,
    float32Array,
  );

  const encodedData = new encoderModule.DracoInt8Array();
  const encodedLen = encoder.EncodePointCloudToDracoBuffer(dracoPointCloud, false, encodedData);
  const uint8Array = new Uint8Array(encodedLen);
  const int8Array = new Int8Array(uint8Array.buffer);
  for (let i = 0; i < encodedLen; i++) {
    int8Array[i] = encodedData.GetValue(i);
  }
  const result = uint8Array;

  encoderModule.destroy(encodedData);
  encoderModule.destroy(dracoPointCloud);
  encoderModule.destroy(encoder);
  encoderModule.destroy(pointCloudBuilder);

  return result;
};
export const decompressDepth = async (byteArray) => {
  const [
    // encoderModule,
    decoderModule,
  ] = await Promise.all([
    // DracoEncoderModule(),
    DracoDecoderModule(),
  ]);

  // Create the Draco decoder.
  const buffer = new decoderModule.DecoderBuffer();
  buffer.Init(byteArray, byteArray.length);

  // Create a buffer to hold the encoded data.
  const decoder = new decoderModule.Decoder();
  const geometryType = decoder.GetEncodedGeometryType(buffer);

  // Decode the encoded geometry.
  let outputGeometry;
  let status;
  if (geometryType == decoderModule.TRIANGULAR_MESH) {
    // outputGeometry = new decoderModule.Mesh();
    // status = decoder.DecodeBufferToMesh(buffer, outputGeometry);
    throw new Error('decompress failed because the encoded geometry is not a point cloud');
  } else {
    outputGeometry = new decoderModule.PointCloud();
    status = decoder.DecodeBufferToPointCloud(buffer, outputGeometry);
  }

  if (status.ok()) {
    const pc = outputGeometry;
    // long GetAttributeId([Ref, Const] PointCloud pc, draco_GeometryAttribute_Type type);
    const positionAttribute = decoder.GetAttribute(pc, 0);
    const positionAttributeData = new decoderModule.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(pc, positionAttribute, positionAttributeData);
    // const positionAttributeData = new decoderModule.DracoFloat32Array();
    // decoder.GetAttributeFloatForAllPoints(pc, positionAttribute, positionAttributeData);
    // const indexAttribute = decoder.GetAttribute(pc, 1);
    // const indexAttributeData = new decoderModule.DracoUInt16Array();
    // decoder.GetAttributeUInt16ForAllPoints(pc, indexAttribute, indexAttributeData);
    
    // copy data
    const float32Array = new Float32Array(positionAttributeData.size());
    for (let i = 0; i < float32Array.length; i++) {
      float32Array[i] = positionAttributeData.GetValue(i);
    }

    // You must explicitly delete objects created from the DracoDecoderModule
    // or Decoder.
    decoderModule.destroy(pc);
    decoderModule.destroy(positionAttribute);
    decoderModule.destroy(positionAttributeData);
    decoderModule.destroy(decoder);
    decoderModule.destroy(buffer);

    return float32Array;
  } else {
    debugger;
    throw new Error('decompress failed');
  }
};
const compressionRatioString = (encoded, raw) => ((encoded.byteLength / raw.byteLength) * 100).toFixed(2) + '%';
const testDepthCompression = async () => {
  const testData = Float32Array.from([
    1, 2, 3,
    1, 2, 3,
    1, 2, 3,
    4, 5, 6,
    4, 5, 6,
    4, 5, 6,
    7, 8, 9,
    7, 8, 9,
    7, 8, 9,
  ].concat(Array(128).fill(7))).map(n => n * 1000);
  const uint8Array = await compressDepth(testData);
  const decodedDepth = await decompressDepth(uint8Array);
  // for (let i = 0; i < testData.length; i++) {
  //   if (testData[i] !== decodedDepth[i]) {
  //     throw new Error('compression test failed due to data mismatch');
  //   }
  // }
  console.log(`compression test compression ratio: ${compressionRatioString(uint8Array, testData)}`, {
    testData,
    decodedDepth,
  });
};
globalThis.testDepthCompression = testDepthCompression;