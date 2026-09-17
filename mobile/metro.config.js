const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    /**
     * Native build output inside node_modules is not source and must never be
     * crawled. Gradle writes thousands of files under
     * `node_modules/<pkg>/android/build/**` (and CocoaPods does the same under
     * `ios/build`), which Metro would otherwise try to watch — exhausting the
     * Linux inotify watch limit and failing the bundle with ENOSPC once any
     * native build has run.
     */
    blockList: [
      /\/node_modules\/.*\/android\/build\/.*/,
      /\/node_modules\/.*\/ios\/build\/.*/,
      /\/node_modules\/.*\/\.cxx\/.*/,
      /\/android\/build\/.*/,
      /\/android\/app\/build\/.*/,
      /\/android\/\.gradle\/.*/,
    ],
  },
  transformer: {
    minifierConfig: {
      mangle: {
        toplevel: true,
      },
      output: {
        comments: false,
      },
      compress: {
        drop_console: true,
      },
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
