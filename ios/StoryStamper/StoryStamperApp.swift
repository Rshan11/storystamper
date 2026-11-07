import SwiftUI

@main
struct StoryStamperApp: App {
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .preferredColorScheme(.dark)
                .tint(Color.accentColor)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch auth.state {
            case .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.background)
            case .signedOut:
                LoginView()
            case .signedIn:
                CheckView()
            }
        }
        .task { await auth.restore() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await auth.refresh() } }
        }
    }
}

enum Theme {
    static let background = Color(red: 0.102, green: 0.125, blue: 0.173)
    static let card = Color.white.opacity(0.06)
}
