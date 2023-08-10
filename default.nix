{ medable ? import
    (fetchTarball {
      name = "medable-2023-08-10";
      url = "https://github.com/Medable/nix/archive/8396a01b8221fd0c22c11d87648a0189227bbaec.tar.gz";
      sha256 = "0pdac1va73l10gfj4vvlpgmnfljhicsyax7z4q5vjd1lmfm5fgnd";
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
