import Foundation

struct APIError: LocalizedError {
    let message: String
    let code: String?
    let status: Int

    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 && code == "unauthorized" }
}

/// Talks to the StoryStamper Cloudflare Worker.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 90 // fact-checks with web search can take a while
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        session = URLSession(configuration: config)
    }

    // MARK: Auth

    func signIn(email: String, password: String) async throws -> AuthResponse {
        try await send("api/auth/login", method: "POST", json: ["email": email, "password": password])
    }

    func signUp(email: String, password: String, inviteCode: String) async throws -> AuthResponse {
        try await send("api/auth/signup", method: "POST",
                       json: ["email": email, "password": password, "inviteCode": inviteCode])
    }

    func signInWithApple(identityToken: String, nonce: String, authorizationCode: String?,
                         name: String?, inviteCode: String?) async throws -> AuthResponse {
        var body = ["identityToken": identityToken, "nonce": nonce]
        if let authorizationCode { body["authorizationCode"] = authorizationCode }
        if let name, !name.isEmpty { body["name"] = name }
        if let inviteCode, !inviteCode.isEmpty { body["inviteCode"] = inviteCode }
        return try await send("api/auth/apple", method: "POST", json: body)
    }

    func me() async throws -> User {
        let response: MeResponse = try await send("api/me")
        return response.user
    }

    func signOut() async {
        _ = try? await send("api/auth/logout", method: "POST") as EmptyResponse
    }

    func deleteAccount() async throws {
        let _: EmptyResponse = try await send("api/account", method: "DELETE")
    }

    // MARK: Fact-check

    func check(jpegData: Data) async throws -> CheckResult {
        let boundary = "StoryStamper-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"image\"; filename=\"screenshot.jpg\"\r\n".utf8))
        body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpegData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = makeRequest("api/check", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return try await perform(request)
    }

    // MARK: Plumbing

    private func makeRequest(_ path: String, method: String) -> URLRequest {
        var request = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("ios", forHTTPHeaderField: "X-Client")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = Keychain.loadToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send<T: Decodable>(_ path: String, method: String = "GET",
                                    json: [String: String]? = nil) async throws -> T {
        var request = makeRequest(path, method: method)
        if let json {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let result: (Data, URLResponse)
        do {
            result = try await session.data(for: request)
        } catch {
            throw APIError(message: "Couldn't reach StoryStamper. Check your internet connection.",
                           code: "network", status: 0)
        }
        let (data, response) = result
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(status) else {
            if let body = try? decoder.decode(ErrorBody.self, from: data) {
                throw APIError(message: body.error, code: body.code, status: status)
            }
            throw APIError(message: "Something went wrong (error \(status)). Please try again.",
                           code: nil, status: status)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError(message: "Unexpected response from the server.", code: "decode", status: status)
        }
    }
}
