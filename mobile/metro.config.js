const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
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
