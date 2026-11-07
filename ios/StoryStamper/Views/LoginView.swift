import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore

    private enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in"
        case signUp = "Create account"
        var id: String { rawValue }
    }

    private enum Field { case email, password, invite }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var inviteCode = ""
    @State private var appleInviteCode = ""
    @State private var isWorking = false
    @State private var errorMessage: String?
    @FocusState private var focus: Field?

    private var canSubmit: Bool {
        !email.isEmpty && password.count >= (mode == .signUp ? 8 : 1)
            && (mode == .signIn || !inviteCode.isEmpty) && !isWorking
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header

                Picker("Mode", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: mode) { _, _ in errorMessage = nil }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                }

                VStack(spacing: 14) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                        .fieldStyle()

                    SecureField(mode == .signUp ? "Password (8+ characters)" : "Password", text: $password)
                        .textContentType(mode == .signUp ? .newPassword : .password)
                        .focused($focus, equals: .password)
                        .submitLabel(mode == .signUp ? .next : .go)
                        .onSubmit {
                            if mode == .signUp { focus = .invite } else { submit() }
                        }
                        .fieldStyle()

                    if mode == .signUp {
                        TextField("Invite code", text: $inviteCode)
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .invite)
                            .submitLabel(.go)
                            .onSubmit(submit)
                            .fieldStyle()
                    }
                }

                Button(action: submit) {
                    Group {
                        if isWorking {
                            ProgressView().tint(.white)
                        } else {
                            Text(mode.rawValue).fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .disabled(!canSubmit)

                HStack {
                    Rectangle().frame(height: 1).foregroundStyle(.white.opacity(0.12))
                    Text("or").font(.footnote).foregroundStyle(.secondary)
                    Rectangle().frame(height: 1).foregroundStyle(.white.opacity(0.12))
                }

                SignInWithAppleButton(.continue) { request in
                    auth.prepareAppleRequest(request)
                } onCompletion: { result in
                    Task { await run { try await auth.handleAppleCompletion(result) } }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .disabled(isWorking)

                footer
            }
            .padding(24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.background.ignoresSafeArea())
        .sheet(isPresented: Binding(
            get: { auth.pendingApple != nil },
            set: { if !$0 { auth.pendingApple = nil } }
        )) {
            appleInviteSheet
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image("Logo")
                .resizable()
                .frame(width: 72, height: 72)
                .padding(.top, 32)
            Text("StoryStamper")
                .font(.system(size: 34, weight: .bold, design: .serif))
            Text("Upload. Verify. Know the truth.")
                .foregroundStyle(.secondary)
        }
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Text("PRIVATE BETA")
                .font(.caption2.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
                .foregroundStyle(.secondary)
            HStack(spacing: 16) {
                Link("Privacy", destination: AppConfig.privacyURL)
                Link("Support", destination: AppConfig.supportURL)
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding(.top, 8)
    }

    private var appleInviteSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("StoryStamper is invite-only during the beta. Enter your invite code to finish creating your account.")
                    .foregroundStyle(.secondary)
                if let errorMessage {
                    Text(errorMessage).font(.callout).foregroundStyle(.red)
                }
                TextField("Invite code", text: $appleInviteCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .fieldStyle()
                Button {
                    guard let pending = auth.pendingApple else { return }
                    Task { await run { try await auth.submitApple(pending, inviteCode: appleInviteCode) } }
                } label: {
                    Text("Create account").fontWeight(.semibold).frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                .disabled(appleInviteCode.isEmpty || isWorking)
                Spacer()
            }
            .padding(24)
            .navigationTitle("Invite code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { auth.pendingApple = nil }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func submit() {
        guard canSubmit else { return }
        focus = nil
        let email = email.trimmingCharacters(in: .whitespaces)
        Task {
            await run {
                if mode == .signUp {
                    try await auth.signUp(email: email, password: password, inviteCode: inviteCode)
                } else {
                    try await auth.signIn(email: email, password: password)
                }
            }
        }
    }

    private func run(_ action: () async throws -> Void) async {
        isWorking = true
        errorMessage = nil
        do {
            try await action()
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }
}

private extension View {
    func fieldStyle() -> some View {
        padding(14)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.12)))
    }
}
