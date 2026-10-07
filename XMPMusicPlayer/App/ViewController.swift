import UIKit
import WebKit
import AVFoundation

final class ViewController: UIViewController,
                            WKScriptMessageHandler,
                            WKNavigationDelegate {

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let configuration = WKWebViewConfiguration()

        let contentController = WKUserContentController()
        contentController.add(self, name: "native")

        configuration.userContentController = contentController

        webView = WKWebView(
            frame: view.bounds,
            configuration: configuration
        )

        webView.autoresizingMask = [
            .flexibleWidth,
            .flexibleHeight
        ]

        webView.navigationDelegate = self

        view.addSubview(webView)

        loadPlayer()
    }

    private func loadPlayer() {

        guard let url = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "Web"
        ) else {
            print("index.html not found")
            return
        }

        webView.loadFileURL(
            url,
            allowingReadAccessTo: url.deletingLastPathComponent()
        )
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {

        guard message.name == "native" else {
            return
        }

        guard let body = message.body as? [String: Any] else {
            return
        }

        guard let action = body["action"] as? String else {
            return
        }

        switch action {

        case "vibrate":

            let generator = UIImpactFeedbackGenerator(
                style: .light
            )

            generator.prepare()
            generator.impactOccurred()

        default:
            break
        }
    }

    deinit {
        webView?.configuration.userContentController
            .removeScriptMessageHandler(forName: "native")
    }
                            }
