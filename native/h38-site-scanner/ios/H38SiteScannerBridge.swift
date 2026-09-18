import Foundation
import ARKit
import RoomPlan

/// Apple capture adapter for the shared H38 Site Scanner.
///
/// The Business Office remains the authority for authentication, tenant/customer/quote
/// context, review, approvals, and permanent Supabase records. This adapter only reports
/// device capabilities and converts RoomPlan/LiDAR geometry into the shared scanner JSON.
@available(iOS 16.0, *)
final class H38SiteScannerBridge {
    struct CaptureContext {
        let businessId: String
        let customerId: String
        let quoteId: String
        let captureSessionId: String
        let projectType: String
    }

    func getCapabilities() -> [String: Any] {
        let roomPlan = RoomCaptureSession.isSupported
        let lidarMesh = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        let arkit = ARWorldTrackingConfiguration.isSupported
        return [
            "platform": "ios",
            "roomPlan": roomPlan,
            "lidar": roomPlan || lidarMesh,
            "sceneReconstruction": lidarMesh,
            "arkit": arkit,
            "arcore": false,
            "depth": roomPlan || lidarMesh,
            "capturePreference": roomPlan ? "LIDAR_ROOM" : "CAMERA_GUIDED",
            "fallback": "CAMERA_GUIDED"
        ]
    }

    func validate(options: [String: Any]) throws -> CaptureContext {
        let businessId = text(options["businessId"])
        let customerId = text(options["customerId"])
        let quoteId = text(options["quoteId"])
        let captureSessionId = text(options["captureSessionId"])
        let projectType = text(options["projectType"])

        guard !businessId.isEmpty, !quoteId.isEmpty, !captureSessionId.isEmpty else {
            throw ScannerError.invalidContext
        }
        return CaptureContext(
            businessId: businessId,
            customerId: customerId,
            quoteId: quoteId,
            captureSessionId: captureSessionId,
            projectType: projectType.isEmpty ? "Custom work area" : projectType
        )
    }

    func encode(room: CapturedRoom, options: [String: Any]) throws -> [String: Any] {
        let context = try validate(options: options)
        var entities: [[String: Any]] = []
        var measurements: [[String: Any]] = []

        appendSurfaces(
            room.walls,
            entityPrefix: "WALL",
            measurementPrefix: "LIDAR-WALL",
            type: "wall",
            label: "Wall",
            notes: "RoomPlan/LiDAR-derived wall dimension. Verify critical dimensions in the field.",
            entities: &entities,
            measurements: &measurements
        )
        appendSurfaces(
            room.doors,
            entityPrefix: "DOOR",
            measurementPrefix: "LIDAR-DOOR",
            type: "opening",
            label: "Door",
            notes: "RoomPlan/LiDAR-derived door dimension. Verify critical opening dimensions in the field.",
            entities: &entities,
            measurements: &measurements
        )
        appendSurfaces(
            room.windows,
            entityPrefix: "WINDOW",
            measurementPrefix: "LIDAR-WINDOW",
            type: "opening",
            label: "Window",
            notes: "RoomPlan/LiDAR-derived window dimension. Verify critical opening dimensions in the field.",
            entities: &entities,
            measurements: &measurements
        )
        appendSurfaces(
            room.openings,
            entityPrefix: "OPENING",
            measurementPrefix: "LIDAR-OPENING",
            type: "opening",
            label: "Opening",
            notes: "RoomPlan/LiDAR-derived opening dimension. Verify critical opening dimensions in the field.",
            entities: &entities,
            measurements: &measurements
        )

        return [
            "version": "h38-site-scanner-v1",
            "captureSessionId": context.captureSessionId,
            "captureMode": "LIDAR_PRECISION",
            "device": getCapabilities(),
            "entities": entities,
            "measurements": measurements,
            "status": "CAPTURED"
        ]
    }

    private func appendSurfaces(
        _ surfaces: [CapturedRoom.Surface],
        entityPrefix: String,
        measurementPrefix: String,
        type: String,
        label: String,
        notes: String,
        entities: inout [[String: Any]],
        measurements: inout [[String: Any]]
    ) {
        for (index, surface) in surfaces.enumerated() {
            let dimensions = surface.dimensions
            let confidenceValue = confidence(surface.confidence)
            let endpoints = horizontalEndpoints(transform: surface.transform, widthMeters: dimensions.x)
            entities.append([
                "id": "\(entityPrefix)-\(index)",
                "type": type,
                "label": "\(label) \(index + 1)",
                "source": "LIDAR_ROOM",
                "confidence": confidenceValue,
                "geometry": [
                    "widthMeters": dimensions.x,
                    "heightMeters": dimensions.y,
                    "transform": matrix(surface.transform),
                    "startPoint": endpoints.start,
                    "endPoint": endpoints.end
                ]
            ])
            measurements.append(measurement(
                id: "\(measurementPrefix)-\(index)-WIDTH",
                label: "\(label) \(index + 1) width",
                valueMeters: dimensions.x,
                confidence: confidenceValue,
                startPoint: endpoints.start,
                endPoint: endpoints.end,
                notes: notes
            ))
            measurements.append(measurement(
                id: "\(measurementPrefix)-\(index)-HEIGHT",
                label: "\(label) \(index + 1) height",
                valueMeters: dimensions.y,
                confidence: confidenceValue,
                startPoint: [:],
                endPoint: [:],
                notes: notes
            ))
        }
    }

    private func horizontalEndpoints(
        transform: simd_float4x4,
        widthMeters: Float
    ) -> (start: [String: Any], end: [String: Any]) {
        let centerX = transform.columns.3.x
        let centerZ = transform.columns.3.z
        var axisX = transform.columns.0.x
        var axisZ = transform.columns.0.z
        let magnitude = sqrt(axisX * axisX + axisZ * axisZ)
        if magnitude > 0.0001 {
            axisX /= magnitude
            axisZ /= magnitude
        } else {
            axisX = 1
            axisZ = 0
        }
        let half = widthMeters / 2
        let start: [String: Any] = [
            "x": centerX - axisX * half,
            "y": centerZ - axisZ * half,
            "z": 0,
            "coordinateSystem": "ROOMPLAN_XZ"
        ]
        let end: [String: Any] = [
            "x": centerX + axisX * half,
            "y": centerZ + axisZ * half,
            "z": 0,
            "coordinateSystem": "ROOMPLAN_XZ"
        ]
        return (start, end)
    }

    private func measurement(
        id: String,
        label: String,
        valueMeters: Float,
        confidence: Double,
        startPoint: [String: Any],
        endPoint: [String: Any],
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
            "startPoint": startPoint,
            "endPoint": endPoint,
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

    private func text(_ value: Any?) -> String {
        String(describing: value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    enum ScannerError: LocalizedError {
        case invalidContext
        case unsupportedDevice
        case cancelled

        var errorDescription: String? {
            switch self {
            case .invalidContext:
                return "The Site Visit is missing business, quote, or capture-session context."
            case .unsupportedDevice:
                return "LiDAR room scanning is not available on this iPhone or iPad. Use camera-guided capture instead."
            case .cancelled:
                return "LiDAR scan cancelled."
            }
        }
    }
}
