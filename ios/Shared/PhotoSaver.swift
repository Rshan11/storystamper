import Photos
import UIKit

enum PhotoSaver {
    static func save(_ image: UIImage) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else {
            throw APIError(message: "To save images, allow StoryStamper to add photos in Settings.",
                           code: "photos_denied", status: 0)
        }
        try await PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }
    }
}
