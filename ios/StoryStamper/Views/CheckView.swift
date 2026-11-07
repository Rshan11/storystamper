import PhotosUI
import SwiftUI
import UIKit

struct CheckView: View {
    @EnvironmentObject private var auth: AuthStore

    private enum Phase {
        case idle
        case checking(UIImage)
        case done(stamped: UIImage, result: CheckResult)
        case failed(String)
    }

    @State private var phase: Phase = .idle
    @State private var pickerItem: PhotosPickerItem?
    @State private var showAccount = false
    @State private var saveMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    switch phase {
                    case .idle:
                        idleView
                    case .checking(let image):
                        checkingView(image)
                    case .done(let stamped, let result):
                        resultView(stamped: stamped, result: result)
                    case .failed(let message):
                        failedView(message)
                    }
                }
                .padding(20)
                .frame(maxWidth: 600)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("StoryStamper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAccount = true } label: {
                        Image(systemName: "person.crop.circle")
                    }
                    .accessibilityLabel("Account")
                }
            }
            .sheet(isPresented: $showAccount) {
                AccountView()
            }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                pickerItem = nil
                Task { await load(item) }
            }
        }
    }

    // MARK: States

    private var idleView: some View {
        VStack(spacing: 20) {
            VStack(spacing: 8) {
                Text("Is that post true?")
                    .font(.system(size: 28, weight: .bold, design: .serif))
                Text("Pick a screenshot of a social media post. We'll check it against current, reputable sources.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 24)

            PhotosPicker(selection: $pickerItem, matching: .images) {
                VStack(spacing: 12) {
                    Image(systemName: "photo.badge.checkmark")
                        .font(.system(size: 44))
                    Text("Choose a screenshot").font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 200)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                        .foregroundStyle(.white.opacity(0.2))
                )
            }
            .buttonStyle(.plain)

            Button {
                if let image = UIPasteboard.general.image {
                    Task { await check(image) }
                } else {
                    phase = .failed("There's no image on your clipboard. Copy a screenshot first.")
                }
            } label: {
                Label("Paste from clipboard", systemImage: "doc.on.clipboard")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)

            if let usage = auth.user?.usage {
                Text("\(usage.remaining) of \(usage.limit) checks left today")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Label("Tip: tap Share on any screenshot in Photos and choose StoryStamper.",
                  systemImage: "square.and.arrow.up")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func checkingView(_ image: UIImage) -> some View {
        VStack(spacing: 20) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 360)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .opacity(0.5)
            ProgressView("Checking sources…")
                .padding(.top, 8)
            Text("This usually takes 10–30 seconds.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 24)
    }

    private func resultView(stamped: UIImage, result: CheckResult) -> some View {
        VStack(spacing: 20) {
            Image(uiImage: stamped)
                .resizable()
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 16))

            ResultDetails(result: result)

            HStack(spacing: 12) {
                ShareLink(
                    item: Image(uiImage: stamped),
                    preview: SharePreview("StoryStamper: \(result.verdict)", image: Image(uiImage: stamped))
                ) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)

                Button {
                    Task {
                        do {
                            try await PhotoSaver.save(stamped)
                            saveMessage = "Saved to Photos"
                        } catch {
                            saveMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }

            if let saveMessage {
                Text(saveMessage).font(.footnote).foregroundStyle(.secondary)
            }

            Button("Check another screenshot") {
                saveMessage = nil
                phase = .idle
            }
            .padding(.top, 4)
        }
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundStyle(.orange)
            Text("Something went wrong").font(.headline)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("Try again") { phase = .idle }
                .buttonStyle(.borderedProminent)
        }
        .padding(.top, 60)
    }

    // MARK: Actions

    private func load(_ item: PhotosPickerItem) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                phase = .failed("Couldn't open that image. Try a different one.")
                return
            }
            await check(image)
        } catch {
            phase = .failed("Couldn't open that image. Try a different one.")
        }
    }

    private func check(_ image: UIImage) async {
        phase = .checking(image)
        guard let jpeg = ImagePrep.uploadData(for: image) else {
            phase = .failed("Couldn't prepare that image.")
            return
        }
        do {
            let result = try await APIClient.shared.check(jpegData: jpeg)
            if let usage = result.usage { auth.updateUsage(usage) }
            let stamped = StampRenderer.render(screenshot: image, result: result)
            phase = .done(stamped: stamped, result: result)
        } catch let error as APIError {
            if error.isUnauthorized {
                await auth.refresh()
            }
            phase = .failed(error.message)
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
