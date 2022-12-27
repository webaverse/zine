import {
  compressImage,
  compressPointCloud,
  decompressPointCloud,
  compressDepth,
  compressDepthQuantized,
  decompressDepth,
  decompressDepthQuantized,
  compressByteAttribute,
  decompressByteAttribute,
  compressGeneric,
  decompressGeneric,
} from './zine-compression-utils.js';
import {
  layer0CompressionSpecs,
  layer1CompressionSpecs,
} from './zine-data-specs.js';

//

const maxDepth = 10000;
const quantization = 16;
const layersCompressionSpecs = [
  layer0CompressionSpecs,
  layer1CompressionSpecs,
];

//

export class ZineStoryboardCompressor {
  async compress(storyboard) {
    const panels = storyboard.getPanels();
    for (const panel of panels) {
      const layers = panel.getLayers();
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const compressionSpecs = layersCompressionSpecs[i];
        if (compressionSpecs) {
          for (const {key, type} of compressionSpecs) {
            const value = layer.getData(key);
            if (value !== undefined) {
              let compressedValue;
              if (type === 'image') {
                compressedValue = await compressImage(value);
              } else if (type === 'pointCloud') {
                compressedValue = await compressPointCloud(new Float32Array(value));
              } else if (type === 'depthQuantized') {
                compressedValue = await compressDepthQuantized(new Float32Array(value, maxDepth));
              } else if (type === 'depth') {
                compressedValue = await compressDepth(new Float32Array(value), quantization);
              } else if (type === 'byteAttribute') {
                compressedValue = await compressByteAttribute(value);
              } else if (type === 'generic') {
                compressedValue = await compressGeneric(value);
              } else {
                throw new Error('unknown compression type: ' + type);
              }
              // console.log(`compression ratio: ${key} ${type} ${(compressedValue.byteLength / value.byteLength * 100).toFixed(2)}%`);
              layer.setData(key, compressedValue);
            }
          }
        }
      }
    }
  }
  async decompress(storyboard) {
    const panels = storyboard.getPanels();
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const layers = panel.getLayers();
      const layer1 = layers[1];
      if (layer1) {
        for (let j = 0; j < layer1CompressionSpecs.length; j++) {
          const compressionSpec = layer1CompressionSpecs[j];

          const {key, type} = compressionSpec;
          const value = layer1.getData(key);
          if (value !== undefined) {
            // console.log('had decompressible data', key, type, value);
            let decompressedValue;
            if (type === 'pointCloud') {
              decompressedValue = await decompressPointCloud(value);
              if (decompressedValue.byteOffset !== 0) {
                throw new Error('unexpected byteOffset');
              }
              decompressedValue = decompressedValue.buffer;
            } else if (type === 'depthQuantized') {
              decompressedValue = await decompressDepthQuantized(value);
            } else if (type === 'depth') {
              decompressedValue = await decompressDepth(value);
            } else if (type === 'byteAttribute') {
              decompressedValue = await decompressByteAttribute(value);
            } else if (type === 'generic') {
              decompressedValue = await decompressGeneric(value);
            } else {
              throw new Error('unknown compression type: ' + type);
            }
            // console.log('decompressed', key, type, value, decompressedValue);
            layer1.setData(key, decompressedValue);
          }
        }
      }
    }
  }
}