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
 */
const fs = require('fs');
const path = require('path');

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
