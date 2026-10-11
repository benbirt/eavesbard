// Paths for experiment scripts, which run with `bazel run`: built files come
// from the target's runfiles (its `data`), so Bazel builds them first, and
// anything the script keeps (results, screenshots, a browser profile) goes in
// the source tree.

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = process.env.BUILD_WORKSPACE_DIRECTORY;
if (!workspace) {
  console.error("Run this with bazel run: see the experiment's BUILD.bazel or README.md.");
  process.exit(2);
}

/** A path in the source tree, for files the script keeps. */
export const source = (...parts) => join(workspace, ...parts);

/** A path given on the command line, relative to where bazel run was started. */
export const given = (path) => resolve(process.env.BUILD_WORKING_DIRECTORY ?? workspace, path);

/** A built file from the target's runfiles, e.g. built("src/site"). */
export const built = (...parts) => join(process.env.JS_BINARY__RUNFILES, "_main", ...parts);

/** Imports a built module, e.g. await builtModule("src/eval/large-set.js"). */
export const builtModule = (...parts) => import(pathToFileURL(built(...parts)).href);

/** How to launch Chrome: CHROME_PATH if set (the Nix shell sets it, flake.nix), else the installed Chrome. */
export const chrome = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
