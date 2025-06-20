find ./build/module -name "*.js" -exec sh -c 'mv "$0" "${0%.js}.mjs"' {} \;

find ./build/module -name '*.mjs' -exec sed -i -e "s/\.js'/.mjs'/g" {} \;

# files with `.mjs-e` extension are created by the command above.
find ./build/module -name '*.mjs-e' -exec rm {} \;
