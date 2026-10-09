"""Shared TypeScript build macros."""

load("@aspect_rules_js//js:defs.bzl", "js_test")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")

def ts_lib(name, srcs, deps = [], tsconfig = "//:tsconfig", **kwargs):
    """A TypeScript library, type-checked and compiled to JavaScript."""
    ts_project(
        name = name,
        srcs = srcs,
        declaration = True,
        resolve_json_module = True,
        source_map = True,
        tsconfig = tsconfig,
        deps = deps,
        **kwargs
    )

def ts_tests(name, srcs, deps = [], data = []):
    """Compiles `*.test.ts` files and runs each one as a node:test js_test.

    Tests run from the workspace root of the runfiles tree, so `data` files
    are readable at their workspace-relative paths.
    """
    ts_lib(
        name = name,
        srcs = srcs,
        tsconfig = "//:tsconfig_node",
        deps = deps + ["//:node_modules/@types/node"],
    )
    for src in srcs:
        js_test(
            name = src.removesuffix(".ts").replace("/", "_").replace(".", "_").replace("-", "_"),
            data = [":" + name] + data,
            entry_point = src.removesuffix(".ts") + ".js",
            size = "small",
        )
