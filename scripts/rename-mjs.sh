find ./build/module -name "*.js" -exec sh -c 'mv "$0" "${0%.js}.mjs"' {} \;


