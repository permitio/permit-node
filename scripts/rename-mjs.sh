# This script renames all import files extensions from `.js` to `.mjs`
# It's important to run this first, as if we run this after the conversion to `.mjs`
# we may do unnecessary work by reworking files that have already been converted.
find ./build/module -name '*.js' -exec sed -i -e "s/\.js'/.mjs'/g" {} \;

# files with `.mjs-e` extension are created by the command above.
find ./build/module -name '*.js-e' -exec rm {} \;

find ./build/module -name "*.js" -exec sh -c 'mv "$0" "${0%.js}.mjs"' {} \;