with builtins;
{ pkgs ? import
    (
      fetchTarball {
        name = "nixpkgs-unstable-2022-05-04";
        url = "https://github.com/NixOS/nixpkgs/archive/ccb9c0e53779ec8995d22b26cbc792ad13f8d503.tar.gz";
        sha256 = "08kplx00lkxg78zf8idfaw30mxrqc2a0f4da342f7hhf32xg41jk";
      }
    )
    {
      config = {
        allowUnfree = true;
      };
      overlays = [ ];
    }
}:
let
  inherit (pkgs.lib) flatten;

  node = pkgs.nodejs-14_x;

  tools = with pkgs; {
    cli = [ ];
    deps = [
      gcc
      glib
      gnumake
      libsecret
      nodePackages.node-gyp
      nodePackages.node-pre-gyp
      pkg-config
      sqlite
    ];
    nix = [
      nixpkgs-fmt
    ];
    node = [
      node
      node.pkgs.lerna
    ];
    osSpecific = with pkgs.darwin.apple_sdk.frameworks; if pkgs.stdenv.isDarwin then [
      Security
      AppKit
      xcbuild
    ] else [ ];
    scripts = [
      (writeShellScriptBin "_npm_setup" ''
        ${node}/bin/npm install --ci
        ${node.pkgs.lerna}/bin/lerna bootstrap --hoist
      '')
      (writeShellScriptBin "_npm_publish" ''
        ${node.pkgs.lerna}/bin/lerna version
        ${node.pkgs.lerna}/bin/lerna publish from-package --dist-tag=@alpha
      '')
    ];
  };

  shell = pkgs.mkShell {
    name = "mdctl";
    packages = flatten [ (flatten (attrValues tools)) ];
  };
in
shell
