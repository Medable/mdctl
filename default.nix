{ medable ? import
    (fetchTarball {
      name = "medable-2023-07-17";
      url = "https://github.com/Medable/nix/archive/4f940f1e514103271ac27116cdf7077679f3928d.tar.gz";
      sha256 = "0si61d31sjxd3nzz7mlh3694fckmnjqz3c88pdmfnw91k59g7c6a";
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
