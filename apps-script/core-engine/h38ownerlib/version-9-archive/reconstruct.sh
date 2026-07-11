#!/usr/bin/env bash
set -euo pipefail
base64 --decode h38-owner-library-v9-export.zip.b64 > h38-owner-library-v9-export.zip
printf '%s  %s\n' 'b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5' 'h38-owner-library-v9-export.zip' | sha256sum --check -
unzip -l h38-owner-library-v9-export.zip
