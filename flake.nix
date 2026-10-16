{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.follows = "baskingspot/flake-parts";
    baskingspot = {
      url = "github:baskingspot/nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = with inputs.baskingspot.flakeModules; [
        base
        terraform
      ];

      perSystem =
        { pkgs, config, ... }:
        let
          # Wrangler as a thin wrapper: the flake pins the version and npm
          # owns the bits. The release-age guard is lifted for this one tool
          # so a day-zero release stays installable.
          wrangler = pkgs.writeShellApplication {
            name = "wrangler";
            runtimeEnv.NPM_CONFIG_MIN_RELEASE_AGE = "0";
            text = ''exec ${pkgs.nodejs_24}/bin/npx --yes "wrangler@4.151.0" "$@"'';
          };
        in
        {
          devShells.default = pkgs.mkShell {
            inputsFrom = with config.devShells; [
              base
              terraform
            ];

            packages = [
              pkgs.nodejs_24
              pkgs.oxfmt
              pkgs.oxlint
              wrangler
            ];
          };
        };
    };
}
