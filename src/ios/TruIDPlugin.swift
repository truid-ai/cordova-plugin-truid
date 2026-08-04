import Foundation
import SwiftUI
import TruID
import Alamofire

/// Hosting controller that reports its own disappearance so the plugin can
/// answer the JS callback when the SDK is closed without calling success/failure
/// (e.g. the user taps the SDK's close button or swipes the modal away).
/// Lets the plugin clear the disappearance handler without having to name the
/// hosting controller's generic rootView type.
protocol TruIDDismissReporting: AnyObject {
    var onDisappear: (() -> Void)? { get set }
}

class TruIDHostingController<Content: View>: UIHostingController<Content>, TruIDDismissReporting {
    var onDisappear: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // isBeingDismissed is false when we are merely covered by another VC.
        if self.isBeingDismissed || self.presentingViewController == nil {
            let handler = self.onDisappear
            self.onDisappear = nil
            handler?()
        }
    }
}

@objc(TruIDPlugin) class TruIDPlugin: CDVPlugin {

    private var token: String?
    private var session: TruID.SessionResult?
    private var error: String?

    /// Callback for the launch currently in flight. Cleared as soon as a result
    /// is sent so we can never answer the same callbackId twice.
    private var pendingCallbackId: String?
    private weak var hostingController: UIViewController?

    @objc(launchSDK:)
    func launchSDK(command: CDVInvokedUrlCommand) {
        guard let apiKey = command.argument(at: 0) as? String,
              let endPoint = command.argument(at: 1) as? String,
             let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR,
                messageAs: "apiKey, endPoint are required")
            self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)
            return
        }

        // A launch is already showing; don't start a second SDK instance or the
        // first callbackId would be orphaned.
        if self.pendingCallbackId != nil {
            let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR,
                messageAs: "TruID verification is already in progress")
            self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)
            return
        }

        self.pendingCallbackId = command.callbackId

        self.generateToken(apiKey: apiKey, endPoint: endPoint) { [weak self] token in
            guard let self = self else { return }

            if let token = token {
                self.token = token
                self.launchTruIDSDK(token: token, endPoint: endPoint,
            } else {
                self.sendFailure(sessionId: nil, statusCode: "2016",
                    message: "Failed to generate token")
            }
        }
    }

<<<<<<< HEAD
    private func launchTruIDSDK(token: String, endPoint: String, applicationId: Int) {
=======
    private func launchTruIDSDK(token: String, endPoint: String, command: CDVInvokedUrlCommand) {
>>>>>>> 9916edb (application id is removed from the plugin)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let truidView = TruidMain(
                token: token,
                API_URL: endPoint,
                face_liveness: true,
                document_capture: true,
                extract_data: true,
                document_authenticity: true,
                document_backside_capture: true,
                id_to_selfie_matching: true,
                fingerprint_capture: true,
                fingerprint_selection: true,
                fingerprint_to_scan: .LEFT_4_RIGHT_4,
                fingerprint_instruction_popup: true,
                enableLanguageSelect: true,
                enableHelpScreens: true,
                enableReportScreen: true,
                isTestAccount: false,
                themeColor: .blue,
                success: { [weak self] sessionResult, statusCode, truidResults in
                    guard let self = self else { return }
                    self.session = sessionResult
                    self.token = nil
                    self.sendSuccess(sessionResult: sessionResult, statusCode: statusCode, truidResults: truidResults)
                    self.dismissSDK()
                },
                failure: { [weak self] sessionId, error, statusCode in
                    guard let self = self else { return }
                    self.token = nil
                    self.error = error.message
                    self.sendFailure(sessionId: String(sessionId),
                        statusCode: String(statusCode),
                        message: "\(error.message)")
                    self.dismissSDK()
                }
            )

            let hostingController = TruIDHostingController(rootView: truidView)
            hostingController.modalPresentationStyle = .fullScreen
            // Fires when the SDK closes itself without invoking success/failure.
            // Android always gets onActivityResult here and maps it to 2017;
            // without this the JS callback would never resolve on iOS.
            hostingController.onDisappear = { [weak self] in
                self?.sendCancelledIfPending()
            }
            self.hostingController = hostingController
            self.viewController?.present(hostingController, animated: true)
        }
    }

    // MARK: - Result plumbing

    /// Match the Android payload exactly: sessionId, verificationStatus,
    /// statusCode and error are always present so the JS layer can render a
    /// status without platform-specific branching.
  private func sendSuccess(sessionResult: TruID.SessionResult, statusCode: Int, truidResults: [FingerprintResult]) {
        let resultDict: [String: Any] = [
            "success": true,
            "sessionId": sessionResult.id ,
            "verificationStatus": statusCode,
            "statusCode": statusCode,
            "truidResults": truidResults
            "error": ""
        ]
        self.send(CDVPluginResult(status: CDVCommandStatus_OK, messageAs: resultDict))
    }

    private func sendFailure(sessionId: String?, statusCode: String, message: String) {
        let resultDict: [String: Any] = [
            "statusCode": statusCode,
            "error": message
        ]
        self.send(CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: resultDict))
    }

    private func sendCancelledIfPending() {
        guard self.pendingCallbackId != nil else { return }
        self.token = nil
        // Same status code Android reports for a user-initiated exit.
        let resultDict: [String: Any] = [
            "success": false,
            "sessionId": "",
            "verificationStatus": "CANCELLED",
            "statusCode": "2017",
            "error": "user cancelled"
        ]
        self.send(CDVPluginResult(status: CDVCommandStatus_ERROR, messageAs: resultDict))
    }

    private func send(_ pluginResult: CDVPluginResult?) {
        guard let callbackId = self.pendingCallbackId else { return }
        self.pendingCallbackId = nil
        self.commandDelegate?.send(pluginResult, callbackId: callbackId)
    }

    private func dismissSDK() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Clear onDisappear first: the result is already sent, and
            // sendCancelledIfPending would no-op anyway, but this keeps the
            // controller from retaining the closure past dismissal.
            (self.hostingController as? TruIDDismissReporting)?.onDisappear = nil
            self.hostingController?.dismiss(animated: true)
            self.hostingController = nil
        }
    }

    private func generateToken(apiKey: String, endPoint: String,
            completion: @escaping (String?) -> Void) {

        let headers: HTTPHeaders = [
            "Authorization": "Api-Key \(apiKey)"
        ]

        let payload: [String: String] = [
            "token": "",
            "platform": "ios"
        ]

        DispatchQueue(label: "ai.truid.tokenqueue").async {
            AF.request(
                "\(endPoint)/generate-token/",
                method: .post,
                parameters: payload,
                encoding: JSONEncoding.default,
                headers: headers
            )
            .responseDecodable(of: GenerateTokenResponse.self) { response in
                switch response.result {
                case .success(let data):
                    completion(data.token)
                case .failure(let error):
                    print("Error generating token: \(error)")
                    completion(nil)
                }
            }
        }
    }
}

// MARK: - Codable Models
struct GenerateTokenRequest: Codable {
    let token: String
    let platform: String
}

struct GenerateTokenResponse: Codable {
    let token: String
}
