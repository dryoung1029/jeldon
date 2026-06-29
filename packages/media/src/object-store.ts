/**
 * ObjectStore adapters. `R2ObjectStore` wraps a Cloudflare R2 binding (the BoH
 * `IMAGES_BUCKET`); `NullObjectStore` is the no-op default for synthesis-only
 * or test paths (every `get` misses, every `put` discards). The engine reaches
 * blobs only through the `ObjectStore` interface — neither the synth nor image
 * flow imports an R2 type.
 */

import type { ObjectStore, PutOptions, StoredObject } from './types.js';

/** The slice of the CF R2 binding surface we use. Declared structurally so the
 *  package needs no `@cloudflare/workers-types` dependency. */
export interface R2LikeBucket {
  get(key: string): Promise<R2LikeObject | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
}

export interface R2LikeObject {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Wraps a CF R2 (or any R2-shaped) bucket binding. */
export class R2ObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2LikeBucket) {}

  async get(key: string): Promise<StoredObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return { body: await obj.arrayBuffer() };
  }

  async put(key: string, body: ArrayBuffer, opts?: PutOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType: opts?.contentType,
        cacheControl: opts?.cacheControl,
      },
      customMetadata: opts?.customMetadata,
    });
  }
}

/** No-op store: nothing is cached, nothing is persisted. Synthesis still works
 *  (the outro is regenerated each call); cache-by-hash simply always misses. */
export class NullObjectStore implements ObjectStore {
  async get(): Promise<StoredObject | null> {
    return null;
  }
  async put(): Promise<void> {
    /* discard */
  }
}
