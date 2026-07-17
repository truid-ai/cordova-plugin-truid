export interface LaunchOptions {
    apiKey: string;
    endPoint: string;
    applicationId: number;
}

export interface LaunchResult {
    success?: boolean;
    sessionId: string;
    verificationStatus?: string;
    error?: string;
}

export interface TruIDPlugin {
    launchSDK(options: LaunchOptions): Promise<LaunchResult>;
}

declare global {
    interface Window {
        TruIDPlugin: TruIDPlugin;
    }
}

function getNativePlugin(): TruIDPlugin | null {
    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins && cordova.plugins.TruIDPlugin) {
        return cordova.plugins.TruIDPlugin as TruIDPlugin;
    }
    return null;
}

/**
 * Access the TruID plugin.
 * Usage: const result = await TruIDPlugin.launchSDK({...})
 *
 * The native plugin is resolved lazily at call time so that this module can
 * be imported before Cordova's `deviceready` has fired.
 */
export const TruIDPlugin: TruIDPlugin = {
    launchSDK: (options: LaunchOptions): Promise<LaunchResult> => {
        const plugin = getNativePlugin();
        if (!plugin) {
            return Promise.reject(new Error('TruIDPlugin not available - run on a device/emulator with the plugin installed'));
        }
        return plugin.launchSDK(options);
    }
};
