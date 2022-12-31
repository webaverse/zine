import {
  makeId,
} from './id-utils.js';
// import {makePromise} from './utils.js';

const makePromise = () => {
  let accept, reject;
  const promise = new Promise((a, r) => {
    accept = a;
    reject = r;
  });
  promise.accept = accept;
  promise.reject = reject;
  return promise;
};

const defaultNumWorkers = 4;

export class ZineCompressionClient {
  constructor({
    numWorkers = defaultNumWorkers,
  } = {}) {
    this.workers = [];
    for (let i = 0; i < numWorkers; i++) {
      const u = new URL('./zine-compression-server.js', import.meta.url);
      const worker = new Worker(u, {
        // type: 'module',
      });
      const messageChannel = new MessageChannel();
      
      const readPort = messageChannel.port1;
      const writePort = messageChannel.port2;
      
      worker.postMessage({
        method: 'init',
        args: {
          port: readPort,
        },
      }, [readPort]);
      worker.port = writePort;
      this.workers.push(worker);
    }
    this.nextWorkerIndex = 0;
    this.cbs = new Map();
  }
  async request(method, args, {transfers} = {}) {
    const id = makeId();
    
    const promise = makePromise();
    this.cbs.set(id, (error, result) => {
      if (!error) {
        promise.accept(result);
      } else {
        promise.reject(error);
      }
    });
    
    const worker = this.workers[this.nextWorkerIndex];
    worker.port.postMessage({
      id,
      method,
      args,
    }, transfers);
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;

    const result = await promise;
    return result;
  }
  async compress(type, value, {transfers} = {}) {
    const result = await this.request('compress', {
      type,
      value,
    }, {transfers});
    return result;
  }
  async decompress(type, value, {transfers} = {}) {
    const result = await this.request('decompress', {
      type,
      value,
    }, {transfers});
    return result;
  }
}