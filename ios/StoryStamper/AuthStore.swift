import AuthenticationServices
import CryptoKit
import Foundation
import Security

/// Holds sign-in state for the app.
@MainActor
final class AuthStore: ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(User)
    }

    /// A Sign in with Apple attempt waiting on an invite code (new accounts only).
    struct PendingApple {
        let identityToken: String
        let nonce: String
        let authorizationCode: String?
        let name: String?
    }

    @Published private(set) var state: State = .loading
    @Published var pendingApple: PendingApple?

    /// Raw nonce for the in-flight Apple request; Apple gets its SHA-256.
    private var currentNonce: String?

    var user: User? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    // MARK: Session

    func restore() async {
        guard Keychain.loadToken() != nil else {
            state = .signedOut
            return
        }
        do {
            let user = try await APIClient.shared.me()
            state = .signedIn(user)
        } catch let error as APIError where error.isUnauthorized {
            Keychain.deleteToken()
            state = .signedOut
        } catch {
            // Offline or server down: keep the token; the next launch or foreground retries.
            state = .signedOut
        }
    }

    func refresh() async {
        guard user != nil else { return }
        do {
            let user = try await APIClient.shared.me()
            state = .signedIn(user)
        } catch let error as APIError where error.isUnauthorized {
            Keychain.deleteToken()
            state = .signedOut
        } catch {}
    }

    func updateUsage(_ usage: Usage) {
        guard let user else { return }
        state = .signedIn(User(id: user.id, email: user.email, name: user.name,
                               hasApple: user.hasApple, usage: usage))
    }

    private func complete(_ response: AuthResponse) {
        Keychain.saveToken(response.token)
        pendingApple = nil
        state = .signedIn(response.user)
    }

    // MARK: Email + password

    func signIn(email: String, password: String) async throws {
        let response = try await APIClient.shared.signIn(email: email, password: password)
        complete(response)
    }

    func signUp(email: String, password: String, inviteCode: String) async throws {
        let response = try await APIClient.shared.signUp(email: email, password: password, inviteCode: inviteCode)
        complete(response)
    }

    // MARK: Sign in with Apple

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Signs in with Apple. If a new account needs an invite code, sets `pendingApple` instead.
    func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .failure(let error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return }
            throw APIError(message: "Sign in with Apple didn't complete. Please try again.", code: nil, status: 0)
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8),
                  let nonce = currentNonce else {
                throw APIError(message: "Sign in with Apple didn't return a token.", code: nil, status: 0)
            }
            let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
            let name = credential.fullName.map {
                PersonNameComponentsFormatter.localizedString(from: $0, style: .default)
            }
            let pending = PendingApple(identityToken: identityToken, nonce: nonce,
                                       authorizationCode: code, name: name)
            try await submitApple(pending, inviteCode: nil)
        }
    }

    func submitApple(_ pending: PendingApple, inviteCode: String?) async throws {
        do {
            let response = try await APIClient.shared.signInWithApple(
                identityToken: pending.identityToken,
                nonce: pending.nonce,
                authorizationCode: pending.authorizationCode,
                name: pending.name,
                inviteCode: inviteCode
            )
            complete(response)
        } catch let error as APIError where error.code == "invite_required" {
            pendingApple = pending
        }
    }

    // MARK: Sign out / delete

    func signOut() async {
        await APIClient.shared.signOut()
        Keychain.deleteToken()
        state = .signedOut
    }

    func deleteAccount() async throws {
        try await APIClient.shared.deleteAccount()
        Keychain.deleteToken()
        state = .signedOut
    }

    // MARK: Nonce helpers

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        precondition(status == errSecSuccess, "Unable to generate nonce")
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
