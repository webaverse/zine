import ZineCompressionWorker from './zine-compression-server.js?worker';
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
      // const u = new URL('./zine-compression-server.js', import.meta.url);
      // const worker = new Worker(u, {
      //   // type: 'module',
      // });
      const worker = new ZineCompressionWorker();
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
      
      writePort.addEventListener('message', e => {
        const {data} = e;
        const {id, result, error} = data;
        const cb = this.cbs.get(id);
        if (cb !== undefined) {
          this.cbs.delete(id);
          cb(error, result);
        } else {
          console.warn('zine compression client: no cb for id: ' + id);
        }
      });
      writePort.start();
      
      this.workers.push(worker);
    }
    this.nextWorkerIndex = 0;

    this.cbs = new Map();

    this.semaphoreValue = this.workers.length;
    this.queue = [];
  }
  async request(method, args, {transfers} = {}) {
    if (this.semaphoreValue > 0) {
      this.semaphoreValue--;
      try {
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
      } finally {
        this.semaphoreValue++;

        if (this.queue.length > 0) {
          const {method, args, transfers, accept, reject} = this.queue.shift();
          this.request(method, args, {transfers})
            .then(accept, reject);
        }
      }
    } else {
      return new Promise((accept, reject) => {
        this.queue.push({
          method,
          args,
          transfers,
          accept,
          reject,
        });
      });
    }
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
  destroy() {
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      worker.terminate();
    }
  }
}