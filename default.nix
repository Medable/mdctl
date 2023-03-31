{ medable ? import
    (fetchTarball {
      name = "medable-2023-03-10";
      url = "https://github.com/Medable/nix/archive/59e6219a0dce236beffdde5b0a3d4ca25d9298e0.tar.gz";
      sha256 = "0klf6vkg9bb6w2pp8rravqafgibn3lg3gs53g0771bv350d6fdv7";
    })
    { }
, nixpkgs ? medable.jacobi
}:
let
  inherit (nixpkgs.lib) flatten;

  name = "mdctl";
  node = nixpkgs.nodejs-16_x;

  tools = with nixpkgs; {
    cli = [ ];
    deps = [
      gcc
      glib
      gnumake
      libsecret
      pkg-config
      sqlite
    ];
    nix = [
      nixpkgs-fmt
    ];
    npm = with node.pkgs; [
      lerna
      node-gyp
      node-pre-gyp
    ];
    osSpecific = with pkgs.darwin.apple_sdk.frameworks; if pkgs.stdenv.isDarwin then [
      Security
      AppKit
      xcbuild
    ] else [ ];
    scripts =
      let
        npm = "${node}/bin/npm";
        lerna = "${node.pkgs.lerna}/bin/lerna";
      in
      [
        (writeShellScriptBin "_npm_setup" ''
          ${npm} install --ci
        '')
        (writeShellScriptBin "_npm_publish_alpha" ''
          ${lerna} publish from-package --dist-tag=alpha "$@"
        '')
        (writeShellScriptBin "_npm_publish_latest" ''
          ${lerna} publish from-package --dist-tag=latest "$@"
        '')
      ];
  };

  paths = flatten [ (flatten (builtins.attrValues tools)) ];
  shell = nixpkgs.mkShell {
    inherit name;
    packages = paths;
  };
in
shell
