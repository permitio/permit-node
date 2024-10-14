for file in ./build/module/**/*.js; do
  sed -i '' "s/\.js'/\.mjs'/g" "$file"
  mv "$file" "${file%.js}.mjs"
done