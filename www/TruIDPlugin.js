var exec = require('cordova/exec');

var TruIDPlugin = {
    /**
     * Launch TruID SDK with verification options
     * @param {Object} options - Configuration options
     * @param {string} options.apiKey - API key for authentication
     * @param {string} options.endPoint - Backend endpoint URL
      * @returns {Promise<Object>} - Promise resolving to {sessionId, verificationStatus,
      *   statusCode, error, hasFingerprints, fingerprints}. Each fingerprints entry is
      *   {fingerIndex, fingerName, imageBase64, wsqBase64}, both payloads inline base64:
      *   the PNG image for display and the WSQ template for matching or upload.
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
    }
};

module.exports = TruIDPlugin;
