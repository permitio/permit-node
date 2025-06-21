# After the first time the module is build, these files are generated
# When .rollup.cache has content, rollup randomly throws this error
# [!] RollupError: src/index.ts (29:7): Expected '{', got 'interface' (Note that you need plugins to import files that are not JavaScript)
# And build file is deleted because somehow rollups takes more time
# indexing/reading it than rebuilding it from ground up
rm -rf build .rollup.cache