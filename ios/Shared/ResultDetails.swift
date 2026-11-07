import SwiftUI

/// Verdict, claim summary, reasons and sources. Used by the app and the Share extension.
struct ResultDetails: View {
    let result: CheckResult

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(result.verdict, systemImage: Verdict.symbol(for: result.verdict))
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Verdict.swiftUIColor(for: result.verdict), in: Capsule())

            if let summary = result.claimSummary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline)
                    .italic()
                    .foregroundStyle(.secondary)
            }

            if !result.reasons.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("ANALYSIS").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(Array(result.reasons.enumerated()), id: \.offset) { _, reason in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Circle().fill(Color.accentColor).frame(width: 6, height: 6)
                            Text(reason).font(.callout)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
            }

            if !result.sources.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("SOURCES").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(result.sources) { source in
                        if let url = URL(string: source.url) {
                            Link(destination: url) {
                                Label(source.title, systemImage: "link")
                                    .font(.callout)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
            }

            Text("AI can make mistakes. Check the sources before sharing.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}
