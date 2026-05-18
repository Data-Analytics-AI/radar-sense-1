// Backwards-compatible shim. New code should import from ./object-store.ts
// (IObjectStore abstraction with Huawei + in-memory backends). This file
// preserves the old surface used by server/index.ts and server/routes.ts.

export {
  getObjectStore,
  isObjectStoreReal,
  pingObjectStore,
} from "./object-store.js";
import { getObjectStore, pingObjectStore, type ObjectStoreHealth } from "./object-store.js";

export function isObsConfigured(): boolean {
  return Boolean(
    process.env.HUAWEI_OBS_AK &&
      process.env.HUAWEI_OBS_SK &&
      process.env.HUAWEI_OBS_ENDPOINT &&
      process.env.HUAWEI_OBS_BUCKET,
  );
}

export function getObsBucket(): string {
  return getObjectStore().bucket;
}

export function getObsEndpoint(): string {
  return getObjectStore().endpoint;
}

export type ObsHealth = ObjectStoreHealth & {
  status?: number;
  storageClass?: string;
  sampleObjectCount?: number;
};

export async function pingObs(): Promise<ObsHealth> {
  return pingObjectStore();
}
