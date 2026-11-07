import SwiftUI
import UIKit

struct ShareCheckView: View {
    @ObservedObject var model: ShareModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    switch model.phase {
                    case .loading:
                        ProgressView().padding(.top, 80)

                    case .signedOut:
                        message(
                            icon: "person.crop.circle.badge.exclamationmark",
                            title: "Sign in first",
                            text: "Open the StoryStamper app and sign in, then share your screenshot again."
                        )

                    case .checking(let image):
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 300)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .opacity(0.5)
                        ProgressView("Checking sources…")
                        Text("This usually takes 10–30 seconds.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)

                    case .done(let stamped, let result):
                        Image(uiImage: stamped)
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        ResultDetails(result: result)
                        actions(stamped)

                    case .failed(let text):
                        message(icon: "exclamationmark.triangle.fill", title: "Something went wrong", text: text)
                    }
                }
                .padding(20)
            }
            .background(Color(red: 0.102, green: 0.125, blue: 0.173).ignoresSafeArea())
            .navigationTitle("StoryStamper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { model.close() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func actions(_ stamped: UIImage) -> some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Button {
                    Task {
                        do {
                            try await PhotoSaver.save(stamped)
                            model.actionMessage = "Saved to Photos"
                        } catch {
                            model.actionMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    UIPasteboard.general.image = stamped
                    model.actionMessage = "Copied. Paste it into any app."
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
            if let text = model.actionMessage {
                Text(text).font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    private func message(icon: String, title: String, text: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 40)).foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(text).multilineTextAlignment(.center).foregroundStyle(.secondary)
        }
        .padding(.top, 60)
    }
}
