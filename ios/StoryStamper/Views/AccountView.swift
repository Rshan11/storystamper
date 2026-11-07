import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var confirmDelete = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    private var version: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
        return "\(short) (\(build))"
    }

    var body: some View {
        NavigationStack {
            List {
                if let user = auth.user {
                    Section("Account") {
                        LabeledContent("Signed in as", value: user.email ?? "Apple ID")
                        if user.hasApple {
                            Label("Sign in with Apple linked", systemImage: "apple.logo")
                                .foregroundStyle(.secondary)
                        }
                    }

                    Section("Today") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("\(user.usage.remaining) of \(user.usage.limit) checks left")
                            ProgressView(value: Double(user.usage.used), total: Double(max(user.usage.limit, 1)))
                        }
                        .padding(.vertical, 4)
                        Text("Resets at midnight UTC.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("About") {
                    Link("Privacy Policy", destination: AppConfig.privacyURL)
                    Link("Support", destination: AppConfig.supportURL)
                    LabeledContent("Version", value: version)
                }

                Section {
                    Button("Sign out") {
                        Task {
                            isWorking = true
                            await auth.signOut()
                            isWorking = false
                            dismiss()
                        }
                    }
                    .disabled(isWorking)
                }

                Section {
                    Button("Delete account", role: .destructive) { confirmDelete = true }
                        .disabled(isWorking)
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else {
                        Text("Permanently deletes your account and usage history.")
                    }
                }
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Delete your StoryStamper account?", isPresented: $confirmDelete,
                                titleVisibility: .visible) {
                Button("Delete account", role: .destructive) {
                    Task {
                        isWorking = true
                        errorMessage = nil
                        do {
                            try await auth.deleteAccount()
                            dismiss()
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                        isWorking = false
                    }
                }
            } message: {
                Text("This can't be undone.")
            }
        }
    }
}
