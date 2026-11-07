import Foundation
import Security

/// Stores the session token in the Keychain, shared with the Share extension via the App Group.
enum Keychain {
    private static let service = "StoryStamper"
    private static let account = "session-token"

    private static func baseQuery() -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let group = AppConfig.appGroupID
        if !group.isEmpty {
            query[kSecAttrAccessGroup as String] = group
        }
        return query
    }

    static func saveToken(_ token: String) {
        deleteToken()
        var query = baseQuery()
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            print("Keychain save failed: \(status)")
        }
    }

    static func loadToken() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func deleteToken() {
        SecItemDelete(baseQuery() as CFDictionary)
    }
}
