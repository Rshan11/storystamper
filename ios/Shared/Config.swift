import Foundation

enum AppConfig {
    /// Your deployed Cloudflare Worker. Change this if you move to a custom domain.
    static let apiBaseURL = URL(string: "https://storystamper.ryan-b00.workers.dev")!

    static let privacyURL = apiBaseURL.appendingPathComponent("privacy")
    static let supportURL = apiBaseURL.appendingPathComponent("support")

    /// App Group shared by the app and the Share extension (set in Config/Signing.xcconfig).
    static var appGroupID: String {
        Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String ?? ""
    }
}
