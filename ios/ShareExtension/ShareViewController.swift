import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Entry point for "Share → StoryStamper" from Photos and other apps.
final class ShareViewController: UIViewController {
    private var model: ShareModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        let model = ShareModel { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
        self.model = model

        let host = UIHostingController(rootView: ShareCheckView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)

        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
        Task { await model.start(providers: providers) }
    }
}

@MainActor
final class ShareModel: ObservableObject {
    enum Phase {
        case loading
        case signedOut
        case checking(UIImage)
        case done(stamped: UIImage, result: CheckResult)
        case failed(String)
    }

    @Published var phase: Phase = .loading
    @Published var actionMessage: String?
    let close: () -> Void

    init(close: @escaping () -> Void) {
        self.close = close
    }

    func start(providers: [NSItemProvider]) async {
        guard Keychain.loadToken() != nil else {
            phase = .signedOut
            return
        }
        guard let image = await Self.loadImage(from: providers) else {
            phase = .failed("Couldn't read that image. Try sharing a screenshot from Photos.")
            return
        }
        phase = .checking(image)
        guard let jpeg = ImagePrep.uploadData(for: image) else {
            phase = .failed("Couldn't prepare that image.")
            return
        }
        do {
            let result = try await APIClient.shared.check(jpegData: jpeg)
            phase = .done(stamped: StampRenderer.render(screenshot: image, result: result), result: result)
        } catch let error as APIError where error.isUnauthorized {
            Keychain.deleteToken()
            phase = .signedOut
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private static func loadImage(from providers: [NSItemProvider]) async -> UIImage? {
        if let provider = providers.first(where: { $0.canLoadObject(ofClass: UIImage.self) }) {
            let image: UIImage? = await withCheckedContinuation { continuation in
                _ = provider.loadObject(ofClass: UIImage.self) { object, _ in
                    continuation.resume(returning: object as? UIImage)
                }
            }
            if let image { return image }
        }
        let imageType = UTType.image.identifier
        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(imageType) }) {
            return await withCheckedContinuation { continuation in
                _ = provider.loadDataRepresentation(forTypeIdentifier: imageType) { data, _ in
                    continuation.resume(returning: data.flatMap { UIImage(data: $0) })
                }
            }
        }
        return nil
    }
}
