import Foundation
import SwiftUI
import TruID
import Alamofire

@objc(TruIDPlugin) class TruIDPlugin: CDVPlugin {

    private var token: String?
    private var session: TruID.SessionResult?
    private var error: String?
    private var statusCode: Int?

    @objc(launchSDK:)
    func launchSDK(command: CDVInvokedUrlCommand) {
        guard let apiKey = command.argument(at: 0) as? String,
              let endPoint = command.argument(at: 1) as? String,
              let applicationId = command.argument(at: 2) as? NSNumber else {
            let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR,
                messageAs: "apiKey, endPoint and applicationId are required")
            self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)
            return
        }

        self.generateToken(apiKey: apiKey, endPoint: endPoint) { [weak self] token in
            guard let self = self else { return }

            if let token = token {
                self.token = token
                self.launchTruIDSDK(token: token, endPoint: endPoint,
                    applicationId: applicationId.intValue, command: command)
            } else {
                let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR,
                    messageAs: "Failed to generate token")
                self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)
            }
        }
    }

    private func launchTruIDSDK(token: String, endPoint: String,
            applicationId: Int, command: CDVInvokedUrlCommand) {

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
                success: { sessionResult, statusCode in
                    self.session = sessionResult
                    self.token = nil
                    self.statusCode = statusCode

                    let resultDict: [String: Any] = [
                        "success": true,
                        "sessionId": sessionResult.id ?? ""
                        "statusCode": self.statusCode ?? -1
                    ]

                    let pluginResult = CDVPluginResult(status: CDVCommandStatus_OK,
                        messageAs: resultDict)
                    self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)

                    self.viewController?.dismiss(animated: true)
                },
                failure: { sessionId, error, statusCode in
                    self.token = nil
                    self.error = error.message
                    self.statusCode = statusCode

                    let pluginResult = CDVPluginResult(status: CDVCommandStatus_ERROR,
                        messageAs: "TruID verification failed: \(error.message)")
                    self.commandDelegate!.send(pluginResult, callbackId: command.callbackId)

                    self.viewController?.dismiss(animated: true)
                }
            )

            let hostingController = UIHostingController(rootView: truidView)
            hostingController.modalPresentationStyle = .fullScreen
            self.viewController?.present(hostingController, animated: true)
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
