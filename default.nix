{ medable ? import
    (fetchTarball {
      name = "medable-2023-01-12";
      url = "https://github.com/Medable/nix/archive/611ef8d5bcbf2a4d2fa7441907fec8d017512ae3.tar.gz";
      sha256 = "08qgscc8w4nzjclp78w4cvli8aw2pr278l578d62v6vgl7gy38jk";
    })
    { }
, pkgs ? medable.pkgs
, jacobi ? medable.jacobi
}:
let
  node = jacobi.nodejs-16_x;

  tools = with jacobi; {
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

  shell = pkgs.mkShell {
    name = "mdctl";
    packages = jacobi._toolset tools;
  };
in
shell
