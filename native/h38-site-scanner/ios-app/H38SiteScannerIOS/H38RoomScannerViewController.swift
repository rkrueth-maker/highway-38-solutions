import UIKit
import RoomPlan

@available(iOS 16.0, *)
final class H38RoomScannerViewController: UIViewController, RoomCaptureViewDelegate {
    private let bridge: H38SiteScannerBridge
    private let options: [String: Any]
    private let completion: (Result<[String: Any], Error>) -> Void
    private let roomCaptureView = RoomCaptureView(frame: .zero)
    private let statusLabel = UILabel()
    private let doneButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private var started = false
    private var finished = false

    init(
        bridge: H38SiteScannerBridge,
        options: [String: Any],
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        self.bridge = bridge
        self.options = options
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }

    required init?(coder: NSCoder) {
        nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        roomCaptureView.translatesAutoresizingMaskIntoConstraints = false
        roomCaptureView.delegate = self
        view.addSubview(roomCaptureView)

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.text = "Move slowly and capture every wall, door, window, and opening."
        statusLabel.textColor = .white
        statusLabel.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        statusLabel.font = .systemFont(ofSize: 14, weight: .semibold)
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.layer.cornerRadius = 12
        statusLabel.clipsToBounds = true
        view.addSubview(statusLabel)

        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.setTitle("Finish Scan", for: .normal)
        doneButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        doneButton.backgroundColor = .systemGreen
        doneButton.tintColor = .white
        doneButton.layer.cornerRadius = 12
        doneButton.addTarget(self, action: #selector(finishScan), for: .touchUpInside)
        view.addSubview(doneButton)

        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cancelButton.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        cancelButton.tintColor = .white
        cancelButton.layer.cornerRadius = 12
        cancelButton.addTarget(self, action: #selector(cancelScan), for: .touchUpInside)
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            roomCaptureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            roomCaptureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            roomCaptureView.topAnchor.constraint(equalTo: view.topAnchor),
            roomCaptureView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            statusLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 12),
            statusLabel.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            statusLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),

            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 14),
            cancelButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -14),
            cancelButton.widthAnchor.constraint(equalToConstant: 110),
            cancelButton.heightAnchor.constraint(equalToConstant: 52),

            doneButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -14),
            doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -14),
            doneButton.widthAnchor.constraint(equalToConstant: 150),
            doneButton.heightAnchor.constraint(equalToConstant: 52)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        guard RoomCaptureSession.isSupported else {
            complete(.failure(H38SiteScannerBridge.ScannerError.unsupportedDevice))
            return
        }
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        roomCaptureView.captureSession.run(configuration: configuration)
    }

    @objc private func finishScan() {
        guard !finished else { return }
        doneButton.isEnabled = false
        cancelButton.isEnabled = false
        statusLabel.text = "Processing LiDAR room scan…"
        roomCaptureView.captureSession.stop()
    }

    @objc private func cancelScan() {
        guard !finished else { return }
        roomCaptureView.captureSession.stop()
        complete(.failure(H38SiteScannerBridge.ScannerError.cancelled))
    }

    func captureView(
        shouldPresent roomDataForProcessing: CapturedRoomData,
        error: Error?
    ) -> Bool {
        if let error {
            complete(.failure(error))
            return false
        }
        statusLabel.text = "Building measured room geometry…"
        return true
    }

    func captureView(
        didPresent processedResult: CapturedRoom,
        error: Error?
    ) {
        if let error {
            complete(.failure(error))
            return
        }
        do {
            let result = try bridge.encode(room: processedResult, options: options)
            complete(.success(result))
        } catch {
            complete(.failure(error))
        }
    }

    private func complete(_ result: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [completion] in
            completion(result)
        }
    }
}
