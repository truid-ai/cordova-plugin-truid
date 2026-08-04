var exec = require('cordova/exec');

var TruIDPlugin = {
    /**
     * Launch TruID SDK with verification options
     * @param {Object} options - Configuration options
     * @param {string} options.apiKey - API key for authentication
     * @param {string} options.endPoint - Backend endpoint URL
      * @returns {Promise<Object>} - Promise resolving to {sessionId, verificationStatus,
      *   statusCode, error, hasFingerprints, fingerprints}. Each fingerprints entry is
      *   {fingerIndex, fingerName, imagePath, wsqPath, imageSize, wsqSize}; read the file
      *   contents with readFingerprintFile().
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
     * Read one of the fingerprint files reported by launchSDK (Android only).
     * @param {string} path - imagePath or wsqPath taken from a fingerprints entry
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
