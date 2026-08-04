var exec = require('cordova/exec');

var TruIDPlugin = {
    /**
     * Launch TruID SDK with verification options
     * @param {Object} options - Configuration options
     * @param {string} options.apiKey - API key for authentication
     * @param {string} options.endPoint - Backend endpoint URL
      * @returns {Promise<Object>} - Promise resolving to {sessionId, verificationStatus,
      *   statusCode, error, hasFingerprints, fingerprints}. Each fingerprints entry is
      *   {fingerIndex, fingerName, imageBase64, wsqPath, wsqSize}: imageBase64 is the PNG
      *   inline, the WSQ template is fetched with readFingerprintFile(wsqPath).
     */
    launchSDK: function(options) {
        options = options || {};
        return new Promise(function(resolve, reject) {
            exec(
                function onSuccess(result) {
                    resolve(result);
                },
                function onError(error) {
                    reject(error);
                },
                'TruIDPlugin',
                'launchSDK',
                [options.apiKey, options.endPoint]
            );
        });
    },

    /**
     * Read the WSQ template of a captured finger (Android only). Finger images need no call,
     * they arrive inline as imageBase64.
     * @param {string} path - wsqPath taken from a fingerprints entry
     * @returns {Promise<string>} - Promise resolving to the file contents, base64 encoded
     */
    readFingerprintFile: function(path) {
        return new Promise(function(resolve, reject) {
            exec(
                function onSuccess(base64) {
                    resolve(base64);
                },
                function onError(error) {
                    reject(error);
                },
                'TruIDPlugin',
                'readFingerprintFile',
                [path]
            );
        });
    }
};

module.exports = TruIDPlugin;
