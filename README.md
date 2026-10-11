# Eavesbard

Listens to a tabletop RPG session and plays fitting ambient music without anyone touching it. See [DESIGN.md](DESIGN.md).

Deployed at <https://benbirt.github.io/eavesbard/>. Needs an up-to-date Chrome with WebGPU (desktop or Android). Work still to do is in [BACKLOG.md](BACKLOG.md).

## Building

Everything builds and runs through [Bazel](https://bazel.build/), via [Bazelisk](https://github.com/bazelbuild/bazelisk), which picks up the pinned version from `.bazelversion`. Nothing else needs installing: Bazel fetches Node, pnpm, TypeScript, esbuild and the npm packages itself.

```sh
bazel test //...                   # type-check, build and run the tests
bazel build //src:site             # the deployable site, in bazel-bin/src/site
bazel run //tools:serve -- 8080    # serve it at http://localhost:8080/
bazel run //scripts:build_index    # regenerate data/tracks.json from tabletopaudio.com
ANTHROPIC_API_KEY=... bazel run //scripts:classifier_check   # try the classifier on scripted transcripts
bazel run //experiments/ui:ui_check         # drive the app through its main states in headless Chrome
bazel run //experiments/ui:download_check   # model downloads: pause, resume, resume after a reload
```

To compare scene models on this computer's GPU (experiment E9), run `bazel run //experiments/e9:browser_eval -- --repo <model> --variants current --name <run>`, then score the run with `bazel run //experiments/e9:analyse -- experiments/e9/results/<run>.json`. The browser targets drive your installed Chrome headless, keeping downloaded models in `experiments/e9/.chrome-profile`. Each experiment's targets are listed in its `BUILD.bazel`.

`data/tracks.json` is generated: don't edit it by hand. The *Update track index* workflow regenerates it weekly and opens a pull request when it changes.

npm dependencies are in `package.json` and `pnpm-lock.yaml`, managed with the pnpm Bazel provides, for example `bazel run -- @pnpm//:pnpm --dir $PWD add --save-exact --lockfile-only <package>` (likewise `remove` or `update`). Commit both files.

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/ci.yml`.

## Third-party content

The ambiences are by [Tabletop Audio](https://tabletopaudio.com/) and licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). They are streamed from Tabletop Audio's own servers; this repo contains no audio. Track metadata (titles, descriptions and tags) is Tabletop Audio's, generated from tabletopaudio.com. The scene art in `src/art` is official Dungeons & Dragons art, © Wizards of the Coast, used under the [Wizards Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy); the credits are in the app's About panel and `src/art/scene-art.ts`. None of this is covered by this repo's MIT licence.
