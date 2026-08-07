/**
 * cordova-plugin-truid hook: make cordova-android 10.x build under AGP 8.
 *
 * AGP 8 (required by the TruID SDK's transitive AndroidX/Compose
 * dependencies) removed the fallback of reading a module's namespace from the
 * AndroidManifest.xml `package` attribute. cordova-android 10.x's generated
 * build files predate that requirement, so this hook injects:
 *
 *   - namespace "org.apache.cordova"   into CordovaLib/build.gradle
 *   - namespace "<the app's widget id>" into app/build.gradle
 *
 * The widget id is read from the host app's config.xml, so the plugin works
 * unmodified in any application. Registered for after_platform_add,
 * after_prepare and before_build so the patch survives `rm -rf platforms`.
 *
 * The injection is gated on the host's AGP version. `namespace` only exists in
 * the DSL from AGP 7.0; on an older host - such as the compileSdk 30
 * integrators this branch targets, who build with AGP 4.1.3 - injecting it
 * fails the build outright with
 *
 *   Could not find method namespace() for arguments [...]
 *
 * so on AGP < 7 the hook does nothing and Cordova's manifest `package`
 * attribute keeps serving as the namespace, exactly as it always did.
 */
const fs = require('fs');
const path = require('path');

/**
 * Read the AGP major version from the generated root build.gradle, e.g.
 * "classpath 'com.android.tools.build:gradle:4.1.3'" -> 4.
 * Returns null when it cannot be determined, in which case the caller skips
 * the patch rather than risk breaking an older host.
 */
function agpMajor(androidDir) {
    for (const f of ['build.gradle', path.join('CordovaLib', 'build.gradle')]) {
        const p = path.join(androidDir, f);
        if (!fs.existsSync(p)) continue;
        const m = fs.readFileSync(p, 'utf8')
            .match(/com\.android\.tools\.build:gradle(?:-api)?:(\d+)\.(\d+)/);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

/**
 * The SDK's dependencies are AndroidX, so the host must build with
 * android.useAndroidX=true. cordova-android does not set it, and AGP reads it
 * from gradle.properties too early for a merged build script to help, so the
 * host would otherwise have to edit gradle.properties by hand. Cordova
 * regenerates that file on prepare, which is why this re-runs with the hook.
 * Existing values are never overwritten.
 */
function ensureAndroidX(androidDir) {
    const p = path.join(androidDir, 'gradle.properties');
    let content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    if (/^\s*android\.useAndroidX\s*=/m.test(content)) return;
    if (content.length && !content.endsWith('\n')) content += '\n';
    content += 'android.useAndroidX=true\n';
    fs.writeFileSync(p, content);
    console.log('[cordova-plugin-truid] set android.useAndroidX=true in ' +
        path.relative(process.cwd(), p));
}

function injectNamespace(gradleFile, ns) {
    if (!fs.existsSync(gradleFile)) return;
    const content = fs.readFileSync(gradleFile, 'utf8');
    if (/^\s*namespace\s/m.test(content)) return; // already set
    const patched = content.replace(/android\s*\{/, 'android {\n    namespace "' + ns + '"');
    if (patched === content) {
        console.warn('[cordova-plugin-truid] could not find android { } block in ' + gradleFile);
        return;
    }
    fs.writeFileSync(gradleFile, patched);
    console.log('[cordova-plugin-truid] set namespace "' + ns + '" in ' +
        path.relative(process.cwd(), gradleFile));
}

module.exports = function (ctx) {
    const root = ctx.opts.projectRoot;
    const androidDir = path.join(root, 'platforms', 'android');
    if (!fs.existsSync(androidDir)) return;

    ensureAndroidX(androidDir);

    const agp = agpMajor(androidDir);
    if (agp === null) {
        console.log('[cordova-plugin-truid] could not determine the Android Gradle ' +
            'plugin version; leaving module namespaces alone');
        return;
    }
    if (agp < 7) {
        console.log('[cordova-plugin-truid] AGP ' + agp + '.x does not have the ' +
            'namespace DSL; leaving module namespaces alone');
        return;
    }

    // The app module's namespace must match the application id (R/BuildConfig
    // packages), which Cordova derives from the config.xml widget id.
    let widgetId = null;
    try {
        const cfg = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');
        const m = cfg.match(/<widget[^>]*\sid="([^"]+)"/);
        if (m) widgetId = m[1];
    } catch (e) { /* fall through */ }

    injectNamespace(path.join(androidDir, 'CordovaLib', 'build.gradle'), 'org.apache.cordova');
    if (widgetId) {
        injectNamespace(path.join(androidDir, 'app', 'build.gradle'), widgetId);
    } else {
        console.warn('[cordova-plugin-truid] could not read widget id from config.xml; ' +
            'app module namespace not patched');
    }
};
