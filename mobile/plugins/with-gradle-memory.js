const { withGradleProperties } = require('expo/config-plugins');

/**
 * The template's Gradle daemon limits (2 GB heap, 512 MB metaspace) are too small for a debug
 * build that includes the dev client: packaging dies with "OutOfMemoryError: Metaspace".
 * Applied on every `expo prebuild`, so the generated android/gradle.properties always has room.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === 'org.gradle.jvmargs');
    if (existing) existing.value = JVM_ARGS;
    else cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    return cfg;
  });
};
