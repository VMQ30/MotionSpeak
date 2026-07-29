module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator',
    'react-native-worklets-core/plugin',
    // 'react-native-reanimated/plugin', // Keep reanimated at the absolute bottom if you use it
  ],
};
