// Expo's default Metro config, plus Sentry debug ids so release source maps resolve.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
