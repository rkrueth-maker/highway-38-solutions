import SwiftUI

@main
struct H38SiteScannerIOSApp: App {
    var body: some Scene {
        WindowGroup {
            H38OfficeContainer()
                .ignoresSafeArea()
        }
    }
}

struct H38OfficeContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> H38WebViewController {
        H38WebViewController()
    }

    func updateUIViewController(_ uiViewController: H38WebViewController, context: Context) {
    }
}
