# Eavesbard

Listens to a tabletop RPG session and plays fitting ambient music without anyone touching it. See [DESIGN.md](DESIGN.md).

Deployed at <https://benbirt.github.io/eavesbard/>. Needs an up-to-date Chrome with WebGPU (desktop or Android). Work still to do is in [BACKLOG.md](BACKLOG.md).

## Building

The build uses [Bazel](https://bazel.build/) via [Bazelisk](https://github.com/bazelbuild/bazelisk), which picks up the pinned version from `.bazelversion`. Nothing else needs installing: Bazel fetches Node, TypeScript and esbuild itself.

```sh
bazel test //...                   # type-check, build and run the tests
bazel build //src:site             # the deployable site, in bazel-bin/src/site
bazel run //tools:serve -- 8080    # serve it at http://localhost:8080/
bazel run //scripts:build_index    # regenerate data/tracks.json from tabletopaudio.com
ANTHROPIC_API_KEY=... bazel run //scripts:classifier_check   # try the classifier on scripted transcripts
```

To compare scene models on this computer's GPU (experiment E9), build `//src:eval_site`, then in `experiments/e9` run `npm install --ignore-scripts` and `node browser-eval.mjs --repo <model> --variants current --name <run>`, and score the run with `node analyse.mjs results/<run>.json` (after `bazel build //src:app`). It drives your installed Chrome headless, keeping downloaded models in `experiments/e9/.chrome-profile`.

`data/tracks.json` is generated: don't edit it by hand. The *Update track index* workflow regenerates it weekly and opens a pull request when it changes.

npm dependencies are managed with pnpm. After changing `package.json`, run `pnpm install --lockfile-only` and commit `pnpm-lock.yaml`.

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/ci.yml`.

## Third-party content

The ambiences are by [Tabletop Audio](https://tabletopaudio.com/) and licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). They are streamed from Tabletop Audio's own servers; this repo contains no audio. Track metadata (titles, descriptions and tags) is Tabletop Audio's, generated from tabletopaudio.com. None of this is covered by this repo's MIT licence.
