import Foundation

struct Usage: Codable, Equatable {
    let used: Int
    let limit: Int
    let remaining: Int
}

struct User: Codable, Equatable {
    let id: String
    let email: String?
    let name: String?
    let hasApple: Bool
    let usage: Usage
}

struct AuthResponse: Codable {
    let success: Bool
    let token: String
    let user: User
}

struct MeResponse: Codable {
    let user: User
}

struct Source: Codable, Hashable, Identifiable {
    let title: String
    let url: String
    var id: String { url }
}

struct CheckResult: Codable, Equatable {
    let verdict: String
    let reasons: [String]
    let claimSummary: String?
    let sources: [Source]
    let usage: Usage?
}

struct ErrorBody: Codable {
    let error: String
    let code: String?
}

struct EmptyResponse: Codable {}
