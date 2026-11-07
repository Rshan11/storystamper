import SwiftUI
import UIKit

enum Verdict {
    static func color(for verdict: String) -> UIColor {
        switch verdict {
        case "Verified True": return UIColor(red: 0.153, green: 0.404, blue: 0.286, alpha: 1)
        case "Likely True": return UIColor(red: 0.220, green: 0.631, blue: 0.412, alpha: 1)
        case "Unverified": return UIColor(red: 0.839, green: 0.620, blue: 0.180, alpha: 1)
        case "Likely False": return UIColor(red: 0.898, green: 0.243, blue: 0.243, alpha: 1)
        case "Verified False": return UIColor(red: 0.773, green: 0.188, blue: 0.188, alpha: 1)
        case "Satire": return UIColor(red: 0.502, green: 0.353, blue: 0.835, alpha: 1)
        default: return UIColor(red: 0.443, green: 0.502, blue: 0.588, alpha: 1)
        }
    }

    static func swiftUIColor(for verdict: String) -> Color {
        Color(uiColor: color(for: verdict))
    }

    static func symbol(for verdict: String) -> String {
        switch verdict {
        case "Verified True", "Likely True": return "checkmark.seal.fill"
        case "Likely False", "Verified False": return "xmark.seal.fill"
        case "Satire": return "theatermasks.fill"
        default: return "questionmark.circle.fill"
        }
    }
}

enum ImagePrep {
    /// Redraws the image upright (fixes EXIF rotation) and caps its width.
    static func normalized(_ image: UIImage, maxWidth: CGFloat) -> UIImage {
        let pixelWidth = image.size.width * image.scale
        let pixelHeight = image.size.height * image.scale
        let ratio = min(1, maxWidth / pixelWidth)
        let size = CGSize(width: floor(pixelWidth * ratio), height: floor(pixelHeight * ratio))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
    }

    /// JPEG for upload: 1080px wide is plenty for the AI to read a screenshot.
    static func uploadData(for image: UIImage) -> Data? {
        normalized(image, maxWidth: 1080).jpegData(compressionQuality: 0.85)
    }
}

enum StampRenderer {
    /// Draws the verdict banner below the screenshot.
    static func render(screenshot original: UIImage, result: CheckResult) -> UIImage {
        let screenshot = ImagePrep.normalized(original, maxWidth: 1600)
        let width = screenshot.size.width
        let scale = max(1, width / 420)
        let pad = 16 * scale
        let textWidth = width - pad * 2
        let accent = Verdict.color(for: result.verdict)

        let verdictFont = UIFont(name: "Georgia-Bold", size: 24 * scale) ?? .boldSystemFont(ofSize: 24 * scale)
        let reasonFont = UIFont.systemFont(ofSize: 14 * scale)
        let footerFont = UIFont.systemFont(ofSize: 12 * scale)

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byWordWrapping
        let reasonAttrs: [NSAttributedString.Key: Any] = [
            .font: reasonFont,
            .foregroundColor: UIColor(red: 0.80, green: 0.84, blue: 0.88, alpha: 1),
            .paragraphStyle: paragraph,
        ]
        let verdictAttrs: [NSAttributedString.Key: Any] = [.font: verdictFont, .foregroundColor: accent]
        let footerAttrs: [NSAttributedString.Key: Any] = [
            .font: footerFont,
            .foregroundColor: UIColor(red: 0.44, green: 0.50, blue: 0.59, alpha: 1),
        ]

        let reasons = result.reasons.prefix(3).map { NSString(string: "\u{2022} " + $0) }
        let reasonHeights = reasons.map { reason in
            ceil(reason.boundingRect(
                with: CGSize(width: textWidth, height: .greatestFiniteMagnitude),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: reasonAttrs,
                context: nil
            ).height)
        }
        let reasonGap = 8 * scale
        let stampHeight = 4 * scale + pad + ceil(verdictFont.lineHeight) + reasonGap
            + reasonHeights.reduce(0, +) + CGFloat(reasons.count) * reasonGap
            + 8 * scale + ceil(footerFont.lineHeight) + pad

        let size = CGSize(width: width, height: screenshot.size.height + stampHeight)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true

        let dateText = DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .none)

        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            screenshot.draw(at: .zero)

            let top = screenshot.size.height
            UIColor(red: 0.102, green: 0.125, blue: 0.173, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: top, width: width, height: stampHeight))
            accent.setFill()
            context.fill(CGRect(x: 0, y: top, width: width, height: 4 * scale))

            var y = top + 4 * scale + pad
            NSString(string: result.verdict.uppercased()).draw(at: CGPoint(x: pad, y: y), withAttributes: verdictAttrs)
            y += ceil(verdictFont.lineHeight) + reasonGap

            for (reason, height) in zip(reasons, reasonHeights) {
                reason.draw(with: CGRect(x: pad, y: y, width: textWidth, height: height),
                            options: [.usesLineFragmentOrigin, .usesFontLeading],
                            attributes: reasonAttrs, context: nil)
                y += height + reasonGap
            }

            y += 8 * scale
            NSString(string: "Checked by StoryStamper \u{00B7} \(dateText)")
                .draw(at: CGPoint(x: pad, y: y), withAttributes: footerAttrs)
        }
    }
}
