import { stampWorkingTree } from "./pwa-version.mjs";

const version = stampWorkingTree();
console.log("Stamped Digital Register PWA version " + version);
