# Eavesbard

Listens to a tabletop RPG session and plays fitting ambient music without anyone touching it. See [DESIGN.md](DESIGN.md).

Deployed at <https://benbirt.github.io/eavesbard/>. Desktop Chrome only.

## Building

The build uses [Bazel](https://bazel.build/) via [Bazelisk](https://github.com/bazelbuild/bazelisk), which picks up the pinned version from `.bazelversion`. Nothing else needs installing: Bazel fetches Node, TypeScript and esbuild itself.

```sh
bazel test //...                   # type-check, build and run the tests
bazel build //src:site             # the deployable site, in bazel-bin/src/site
bazel run //tools:serve -- 8080    # serve it at http://localhost:8080/
```

npm dependencies are managed with pnpm. After changing `package.json`, run `pnpm install --lockfile-only` and commit `pnpm-lock.yaml`.

Pushes to `main` are tested and deployed to GitHub Pages by `.github/workflows/ci.yml`.

## Third-party content

The ambiences are by [Tabletop Audio](https://tabletopaudio.com/) and licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). They are streamed from Tabletop Audio's own servers; this repo contains no audio. Track metadata (titles, descriptions and tags) is Tabletop Audio's, generated from tabletopaudio.com. None of this is covered by this repo's MIT licence.
