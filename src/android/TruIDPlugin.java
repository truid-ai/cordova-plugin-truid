package com.truid.plugin;

import android.app.Activity;
import android.content.Intent;

import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CallbackContext;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import com.truid.android.TruID;
import com.truid.android.AuthenticateWithTruID;
import com.truid.android.TruIDFingerprintResult;
import com.truid.android.vision.FingerprintOptions;
import com.truid.android.vision.FingersToScan;

import android.util.Base64;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class TruIDPlugin extends CordovaPlugin {

    private static final int TRUID_REQUEST_CODE = 8571;

    private CallbackContext callbackContext;
    private final AuthenticateWithTruID authenticateContract = new AuthenticateWithTruID();

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if (action.equals("launchSDK")) {
            this.launchSDK(args, callback);
            return true;
        }
        if (action.equals("readFingerprintFile")) {
            this.readFingerprintFile(args, callback);
            return true;
        }
        return false;
    }

    private void launchSDK(JSONArray args, CallbackContext callback) throws JSONException {
        final String appToken = args.optString(0, "");
        final String endPoint = args.optString(1, "");
 
        if (appToken.isEmpty() || endPoint.isEmpty()) {
            callback.error("apiKey and endPoint are required");
            return;
        }

        this.callbackContext = callback;

        // Token generation must not run on the WebView thread.
        cordova.getThreadPool().execute(() -> {
            try {
                String token = generateToken(appToken, endPoint);
                if (token != null && !token.isEmpty()) {
                    launchTruIDSDK(token, endPoint);
                } else {
                    fail("Failed to generate token");
                }
            } catch (Exception e) {
                fail("Token generation failed: " + e.getMessage());
            }
        });
    }

    private void launchTruIDSDK(final String token, final String endPoint) {
        final Activity activity = cordova.getActivity();
        activity.runOnUiThread(() -> {
            try {
                TruID.INSTANCE.setAPILink(endPoint);

                AuthenticateWithTruID.Input input = new AuthenticateWithTruID.Input(
                    token,
                    true,  // enableFaceLiveness
                    false, // enableOnDeviceLiveness
                    true,  // enableDocumentCapture
                    false, // enableExtractData
                    false, // enableDocumentAuthenticity
                    true,  // enableDocumentBacksideCapture
                    true,  // enableIDtoSelfieMatching
                    false, // enableVerisysVerification
                    false, // enableFingerSelection
                    true,  // enableFingerprintCapture
                    false, // enablePersonalInformationVerification
                    false, // enableMobileNumberVerification
                    false, // enableUndertaking
                    false, // enableAccountOptions
                    false, // enableAgentVerification
                    true,  // displayHelpScreens
                    new FingerprintOptions(
                        FingersToScan.LEFT_4_Right_4,
                        30,    // minimumNIST
                        false  // displayFingerprintResults
                    ),
                    false, // enableReportScreen
                    false, // disableLocationCapture
                    false, // displayFingerprintHelpPopup
                    false  // shouldShowStartScreen
                );

                // CordovaActivity is not an AndroidX ComponentActivity, so
                // registerForActivityResult() is unavailable. Drive the SDK's
                // ActivityResultContract manually through Cordova's
                // startActivityForResult/onActivityResult instead.
                Intent intent = authenticateContract.createIntent(activity, input);
                cordova.startActivityForResult(TruIDPlugin.this, intent, TRUID_REQUEST_CODE);
            } catch (Exception e) {
                fail("Failed to launch TruID SDK: " + e.getMessage());
            }
        });
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != TRUID_REQUEST_CODE || callbackContext == null) {
            return;
        }
        try {
            AuthenticateWithTruID.Output result = authenticateContract.parseResult(resultCode, data);
            JSONObject ret = new JSONObject();
            ret.put("sessionId", result.getSessionID() == null ? "" : result.getSessionID());
            ret.put("verificationStatus", result.getVerificationStatus());
            final String truidError = result.getError() == null ? "" : result.getError();
            ret.put("error", truidError);
            // On user cancel the SDK returns no status code (getStatusCode() is
            // null) and only sets getError() == "user cancelled", which would
            // surface as an empty statusCode. Map it to the documented 2017 so
            // callers can handle cancel like any other outcome.
            if ("user cancelled".equals(truidError)) {
                ret.put("statusCode", "2017");
            } else {
                ret.put("statusCode", result.getStatusCode() == null ? "" : result.getStatusCode());
            }

            // Fingerprint capture results. Each finger image rides along as base64, ready
            // to render. The WSQ template stays a file in the app cache and is fetched on
            // demand with readFingerprintFile(), because it is the bigger of the two and
            // most apps only upload it.
            ret.put("hasFingerprints", result.getHasWSQ());
            ret.put("fingerprints", fingerprintsToJson(result.getFingerprints()));

            callbackContext.success(ret);
        } catch (Exception e) {
            callbackContext.error("Error processing result: " + e.getMessage());
        }
        callbackContext = null;
    }

    private void fail(String message) {
        if (callbackContext != null) {
            callbackContext.error(message);
            callbackContext = null;
        }
    }

    /**
     * One JSON object per captured finger. fingerIndex is the ANSI/NIST number, fixed per
     * finger: 1 right thumb, 2..5 right index to pinky, 6 left thumb, 7..10 left index to
     * pinky. imageBase64 is the PNG image inline, ready for a data URI; wsqPath is the WSQ
     * template of the same finger, read it with readFingerprintFile().
     */
    private JSONArray fingerprintsToJson(List<TruIDFingerprintResult> fingerprints) throws JSONException {
        JSONArray array = new JSONArray();
        if (fingerprints == null) {
            return array;
        }
        for (TruIDFingerprintResult fingerprint : fingerprints) {
            JSONObject item = new JSONObject();
            item.put("fingerIndex", fingerprint.getFingerIndex());
            item.put("fingerName", fingerprint.getFingerName());
            item.put("imageBase64", fingerprint.getImageBase64());
            item.put("wsqPath", fingerprint.getWsqPath());
            item.put("wsqSize", new File(fingerprint.getWsqPath()).length());
            array.put(item);
        }
        return array;
    }

    /**
     * Reads the WSQ file of a captured finger and returns it base64 encoded, so the WebView
     * can upload or store the template. Runs off the WebView thread because a full hand is
     * several megabytes. The finger images need no call - they arrive as imageBase64.
     */
    private void readFingerprintFile(JSONArray args, CallbackContext callback) {
        final String path = args.optString(0, "");
        if (path.isEmpty()) {
            callback.error("path is required");
            return;
        }

        cordova.getThreadPool().execute(() -> {
            try {
                File file = new File(path);
                // Only the SDK's own capture files may be read this way.
                String canonical = file.getCanonicalPath();
                String cacheRoot = cordova.getActivity().getCacheDir().getCanonicalPath();
                if (!canonical.startsWith(cacheRoot)) {
                    callback.error("path is outside the app cache directory");
                    return;
                }
                if (!file.exists()) {
                    callback.error("file no longer exists: " + path);
                    return;
                }

                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                FileInputStream input = new FileInputStream(file);
                try {
                    byte[] chunk = new byte[8192];
                    int read;
                    while ((read = input.read(chunk)) != -1) {
                        buffer.write(chunk, 0, read);
                    }
                } finally {
                    input.close();
                }

                callback.success(Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));
            } catch (Exception e) {
                callback.error("Could not read " + path + ": " + e.getMessage());
            }
        });
    }

    private String generateToken(String apiKey, String endPoint) throws Exception {
        URL url = new URL(endPoint + "/generate-token/");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Authorization", "Api-Key" +" "+ apiKey);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(30000);
            connection.setDoOutput(true);
            connection.getOutputStream().write("{}".getBytes(StandardCharsets.UTF_8));

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();

            StringBuilder body = new StringBuilder();
            if (stream != null) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) {
                    body.append(line);
                }
                reader.close();
            }

            if (status < 200 || status >= 300) {
                throw new Exception(body.length() > 0 ? body.toString() : "Error generating token (HTTP " + status + ")");
            }

            JSONObject response = new JSONObject(body.toString());
            return response.optString("token", "");
        } finally {
            connection.disconnect();
        }
    }
}
