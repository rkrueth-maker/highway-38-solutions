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
        let roomPlan = RoomCaptureSession.isSupported
        let lidar = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        return [
            "platform": "ios",
            "roomPlan": roomPlan,
            "lidar": lidar,
            "arcore": false,
            "depth": roomPlan || lidar
        ]
    }

    func start(options: [String: Any]) async throws -> [String: Any] {
        guard RoomCaptureSession.isSupported else {
            throw ScannerError.unsupportedDevice
        }
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
            let confidenceValue = confidence(wall.confidence)
            entities.append([
                "id": "WALL-\(index)",
                "type": "wall",
                "label": "Wall \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidenceValue,
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(wall.transform)
                ]
            ])
            measurements.append(measurement(
                id: "LIDAR-WALL-\(index)-WIDTH",
                label: "Wall \(index + 1) width",
                valueMeters: dimensions.x,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived wall width. Verify critical dimensions in the field."
            ))
            measurements.append(measurement(
                id: "LIDAR-WALL-\(index)-HEIGHT",
                label: "Wall \(index + 1) height",
                valueMeters: dimensions.y,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived wall height. Verify critical dimensions in the field."
            ))
        }

        for (index, door) in room.doors.enumerated() {
            let dimensions = door.dimensions
            let confidenceValue = confidence(door.confidence)
            entities.append([
                "id": "DOOR-\(index)",
                "type": "opening",
                "label": "Door \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidenceValue,
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(door.transform)
                ]
            ])
            measurements.append(measurement(
                id: "LIDAR-DOOR-\(index)-WIDTH",
                label: "Door \(index + 1) width",
                valueMeters: dimensions.x,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived door width. Verify critical opening dimensions in the field."
            ))
            measurements.append(measurement(
                id: "LIDAR-DOOR-\(index)-HEIGHT",
                label: "Door \(index + 1) height",
                valueMeters: dimensions.y,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived door height. Verify critical opening dimensions in the field."
            ))
        }

        for (index, window) in room.windows.enumerated() {
            let dimensions = window.dimensions
            let confidenceValue = confidence(window.confidence)
            entities.append([
                "id": "WINDOW-\(index)",
                "type": "opening",
                "label": "Window \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidenceValue,
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(window.transform)
                ]
            ])
            measurements.append(measurement(
                id: "LIDAR-WINDOW-\(index)-WIDTH",
                label: "Window \(index + 1) width",
                valueMeters: dimensions.x,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived window width. Verify critical opening dimensions in the field."
            ))
            measurements.append(measurement(
                id: "LIDAR-WINDOW-\(index)-HEIGHT",
                label: "Window \(index + 1) height",
                valueMeters: dimensions.y,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived window height. Verify critical opening dimensions in the field."
            ))
        }

        for (index, opening) in room.openings.enumerated() {
            let dimensions = opening.dimensions
            let confidenceValue = confidence(opening.confidence)
            entities.append([
                "id": "OPENING-\(index)",
                "type": "opening",
                "label": "Opening \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidenceValue,
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(opening.transform)
                ]
            ])
            measurements.append(measurement(
                id: "LIDAR-OPENING-\(index)-WIDTH",
                label: "Opening \(index + 1) width",
                valueMeters: dimensions.x,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived opening width. Verify critical opening dimensions in the field."
            ))
            measurements.append(measurement(
                id: "LIDAR-OPENING-\(index)-HEIGHT",
                label: "Opening \(index + 1) height",
                valueMeters: dimensions.y,
                confidence: confidenceValue,
                notes: "RoomPlan/LiDAR-derived opening height. Verify critical opening dimensions in the field."
            ))
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

    private func measurement(
        id: String,
        label: String,
        valueMeters: Float,
        confidence: Double,
        notes: String
    ) -> [String: Any] {
        [
            "id": id,
            "label": label,
            "type": "Length",
            "value": valueMeters,
            "unit": "m",
            "source": "LIDAR_ROOM",
            "confidence": confidence,
            "verificationStatus": "DEVICE_CAPTURED",
            "startPoint": [:],
            "endPoint": [:],
            "notes": notes
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
        case unsupportedDevice
    }
}
