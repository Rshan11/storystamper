import Foundation
import Security

/// Stores the session token in the Keychain, shared with the Share extension via the App Group.
enum Keychain {
    private static let service = "StoryStamper"
    private static let account = "session-token"

    private static func baseQuery(shared: Bool) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let group = AppConfig.appGroupID
        if shared && !group.isEmpty {
            query[kSecAttrAccessGroup as String] = group
        }
        return query
    }

    static func saveToken(_ token: String) {
        deleteToken()
        for shared in [true, false] {
            var query = baseQuery(shared: shared)
            query[kSecValueData as String] = Data(token.utf8)
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let status = SecItemAdd(query as CFDictionary, nil)
            if status == errSecSuccess { return }
            // errSecMissingEntitlement: App Group not set up; fall back to the app's own keychain
            print("Keychain save failed (shared: \(shared)): \(status)")
            if status != errSecMissingEntitlement { return }
        }
    }

    static func loadToken() -> String? {
        for shared in [true, false] {
            var query = baseQuery(shared: shared)
            query[kSecReturnData as String] = true
            query[kSecMatchLimit as String] = kSecMatchLimitOne
            var item: CFTypeRef?
            if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
               let data = item as? Data {
                return String(data: data, encoding: .utf8)
            }
        }
        return nil
    }

    static func deleteToken() {
        SecItemDelete(baseQuery(shared: true) as CFDictionary)
        SecItemDelete(baseQuery(shared: false) as CFDictionary)
    }
}
