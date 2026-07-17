var exec = require('cordova/exec');

var TruIDPlugin = {
    /**
     * Launch TruID SDK with verification options
     * @param {Object} options - Configuration options
     * @param {string} options.apiKey - API key for authentication
     * @param {string} options.endPoint - Backend endpoint URL
     * @param {number} options.applicationId - Application ID
     * @returns {Promise<Object>} - Promise resolving to {sessionId, verificationStatus, error}
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
                [options.apiKey, options.endPoint, options.applicationId]
            );
        });
    }
};

module.exports = TruIDPlugin;
