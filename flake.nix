{
  # A development shell for NixOS, where Bazel's downloaded binaries (Bazel
  # itself, Node, esbuild) can't run directly: `nix develop` opens a shell in
  # an FHS environment with Bazelisk (as `bazel`) and Chrome for the browser
  # experiments. Elsewhere, install Bazelisk and Chrome instead (README.md).
  description = "Eavesbard development shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true; # Google Chrome
      };
      bazel = pkgs.writeShellScriptBin "bazel" ''exec ${pkgs.bazelisk}/bin/bazelisk "$@"'';
      fhs = pkgs.buildFHSEnv {
        name = "eavesbard";
        targetPkgs = p: [
          bazel
          p.bazelisk
          p.bash
          p.coreutils
          p.gcc
          p.git
          p.python3
          p.zlib
          p.google-chrome
        ];
        # The browser experiments launch this Chrome (experiments/paths.mjs).
        profile = ''
          export CHROME_PATH=${pkgs.google-chrome}/bin/google-chrome-stable
        '';
      };
    in
    {
      # `nix develop` for an interactive shell; for one command,
      # `nix run . -- -c 'bazel test //...'`.
      devShells.${system}.default = fhs.env;
      packages.${system}.default = fhs;
    };
}
