import Foundation
import ARKit
import RoomPlan

/// Thin Apple capture client for the shared H38 Site Scanner.
///
/// The Business Office owns authentication, tenant/customer/quote context,
/// approvals, Proof Log, Error Log, and permanent Supabase records. This bridge
/// only captures RoomPlan/ARKit geometry and returns device-captured results.
@available(iOS 16.0, *)
final class H38SiteScannerBridge: NSObject, RoomCaptureSessionDelegate {
    private let roomSession = RoomCaptureSession()
    private var captureSessionId = ""
    private var resultContinuation: CheckedContinuation<[String: Any], Error>?

    override init() {
        super.init()
        roomSession.delegate = self
    }

    func getCapabilities() -> [String: Any] {
        let lidar = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        return [
            "platform": "ios",
            "roomPlan": true,
            "lidar": lidar,
            "arcore": false,
            "depth": lidar
        ]
    }

    func start(options: [String: Any]) async throws -> [String: Any] {
        guard let sessionId = options["captureSessionId"] as? String, !sessionId.isEmpty,
              let businessId = options["businessId"] as? String, !businessId.isEmpty,
              let quoteId = options["quoteId"] as? String, !quoteId.isEmpty else {
            throw ScannerError.invalidContext
        }
        captureSessionId = sessionId
        let configuration = RoomCaptureSession.Configuration()
        roomSession.run(configuration: configuration)
        return [
            "captureSessionId": captureSessionId,
            "captureMode": "LIDAR_PRECISION",
            "status": "CAPTURING",
            "device": getCapabilities()
        ]
    }

    func finish() async throws -> [String: Any] {
        roomSession.stop()
        return try await withCheckedThrowingContinuation { continuation in
            resultContinuation = continuation
        }
    }

    func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: Error?
    ) {
        if let error {
            resultContinuation?.resume(throwing: error)
            resultContinuation = nil
            return
        }
        let builder = CapturedRoom.Builder(options: [.beautifyObjects])
        Task {
            do {
                let room = try await builder.capturedRoom(from: data)
                resultContinuation?.resume(returning: encode(room: room))
            } catch {
                resultContinuation?.resume(throwing: error)
            }
            resultContinuation = nil
        }
    }

    private func encode(room: CapturedRoom) -> [String: Any] {
        var entities: [[String: Any]] = []
        var measurements: [[String: Any]] = []

        for (index, wall) in room.walls.enumerated() {
            let dimensions = wall.dimensions
            entities.append([
                "id": "WALL-\(index)",
                "type": "wall",
                "label": "Wall \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidence(wall.confidence),
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(wall.transform)
                ]
            ])
            measurements.append([
                "id": "LIDAR-WALL-\(index)",
                "label": "Wall \(index + 1) width",
                "type": "Length",
                "value": dimensions.x,
                "unit": "m",
                "source": "LIDAR_ROOM",
                "confidence": confidence(wall.confidence),
                "verificationStatus": "DEVICE_CAPTURED",
                "startPoint": [:],
                "endPoint": [:],
                "notes": "RoomPlan/LiDAR-derived. Verify critical dimensions in the field."
            ])
        }

        for (index, door) in room.doors.enumerated() {
            entities.append([
                "id": "DOOR-\(index)",
                "type": "opening",
                "label": "Door \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidence(door.confidence),
                "geometry": [
                    "widthMeters": door.dimensions.x,
                    "heightMeters": door.dimensions.y,
                    "transform": matrix(door.transform)
                ]
            ])
        }

        for (index, window) in room.windows.enumerated() {
            entities.append([
                "id": "WINDOW-\(index)",
                "type": "opening",
                "label": "Window \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidence(window.confidence),
                "geometry": [
                    "widthMeters": window.dimensions.x,
                    "heightMeters": window.dimensions.y,
                    "transform": matrix(window.transform)
                ]
            ])
        }

        return [
            "version": "h38-site-scanner-v1",
            "captureSessionId": captureSessionId,
            "captureMode": "LIDAR_PRECISION",
            "device": getCapabilities(),
            "entities": entities,
            "measurements": measurements,
            "status": "CAPTURED"
        ]
    }

    private func confidence(_ value: CapturedRoom.Confidence) -> Double {
        switch value {
        case .high: return 0.9
        case .medium: return 0.7
        case .low: return 0.4
        @unknown default: return 0.3
        }
    }

    private func matrix(_ value: simd_float4x4) -> [Float] {
        [
            value.columns.0.x, value.columns.0.y, value.columns.0.z, value.columns.0.w,
            value.columns.1.x, value.columns.1.y, value.columns.1.z, value.columns.1.w,
            value.columns.2.x, value.columns.2.y, value.columns.2.z, value.columns.2.w,
            value.columns.3.x, value.columns.3.y, value.columns.3.z, value.columns.3.w
        ]
    }

    enum ScannerError: Error {
        case invalidContext
    }
}
