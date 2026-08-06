package com.highway38.sitescanner

import android.content.Context
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Session
import org.json.JSONArray
import org.json.JSONObject

/**
 * Thin Android ARCore capture client for the shared H38 Site Scanner.
 *
 * This class does not own customers, quotes, approvals, permanent records, or a
 * parallel database. The authenticated Business Office creates the captureSessionId.
 * Results are returned to the web shell and synchronized into the current Supabase
 * tenant before they are treated as saved.
 */
class H38SiteScannerBridge(private val context: Context) {
    private var session: Session? = null
    private var captureSessionId: String = ""
    private val measurements = JSONArray()
    private val entities = JSONArray()

    fun getCapabilities(): JSONObject {
        val result = JSONObject()
        return try {
            val arSession = Session(context)
            val depthSupported = arSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
            arSession.close()
            result.put("platform", "android")
                .put("arcore", true)
                .put("depth", depthSupported)
                .put("lidar", false)
                .put("roomPlan", false)
        } catch (_: Throwable) {
            result.put("platform", "android")
                .put("arcore", false)
                .put("depth", false)
                .put("lidar", false)
                .put("roomPlan", false)
        }
    }

    fun start(options: JSONObject): JSONObject {
        captureSessionId = options.getString("captureSessionId")
        require(options.getString("businessId").isNotBlank())
        require(options.getString("quoteId").isNotBlank())
        session = Session(context).also { arSession ->
            val config = Config(arSession)
            config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
            config.depthMode = if (arSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                Config.DepthMode.AUTOMATIC
            } else {
                Config.DepthMode.DISABLED
            }
            arSession.configure(config)
        }
        measurements.put(JSONObject()
            .put("event", "capture_started")
            .put("source", "ARCORE_POINT_TO_POINT")
            .put("verificationStatus", "DEVICE_CAPTURED"))
        return getCapabilities()
            .put("captureSessionId", captureSessionId)
            .put("captureMode", "ANDROID_DEPTH")
            .put("status", "CAPTURING")
    }

    fun addPointToPointMeasurement(
        label: String,
        meters: Double,
        start: FloatArray,
        end: FloatArray,
        confidence: Double,
        depthDerived: Boolean
    ) {
        require(meters > 0)
        val source = if (depthDerived) "ARCORE_DEPTH" else "ARCORE_POINT_TO_POINT"
        measurements.put(JSONObject()
            .put("id", "AR-${System.nanoTime()}")
            .put("label", label)
            .put("type", "Length")
            .put("value", meters)
            .put("unit", "m")
            .put("source", source)
            .put("confidence", confidence.coerceIn(0.0, 1.0))
            .put("verificationStatus", "DEVICE_CAPTURED")
            .put("startPoint", vector(start))
            .put("endPoint", vector(end))
            .put("notes", "ARCore-derived. Field verification remains required for critical work."))
    }

    fun addDetectedPlane(label: String, type: String, confidence: Double) {
        entities.put(JSONObject()
            .put("id", "ENTITY-${System.nanoTime()}")
            .put("label", label)
            .put("type", type)
            .put("source", "ARCORE_DEPTH")
            .put("confidence", confidence.coerceIn(0.0, 1.0))
            .put("geometry", JSONObject()))
    }

    fun trackingGuidance(frame: Frame): String {
        val camera = frame.camera
        return when (camera.trackingState.name) {
            "TRACKING" -> "Tracking ready"
            "PAUSED" -> "Move slowly and show more floor/wall texture"
            else -> "Tracking lost — rescan this section"
        }
    }

    fun finish(): JSONObject {
        session?.close()
        session = null
        return JSONObject()
            .put("version", "h38-site-scanner-v1")
            .put("captureSessionId", captureSessionId)
            .put("captureMode", "ANDROID_DEPTH")
            .put("device", getCapabilities())
            .put("entities", entities)
            .put("measurements", measurements)
            .put("status", "CAPTURED")
    }

    fun cancel() {
        session?.close()
        session = null
        measurements.put(JSONObject().put("event", "capture_cancelled"))
    }

    private fun vector(values: FloatArray): JSONObject {
        return JSONObject()
            .put("x", values.getOrElse(0) { 0f })
            .put("y", values.getOrElse(1) { 0f })
            .put("z", values.getOrElse(2) { 0f })
            .put("coordinateSystem", "ARCORE_WORLD_METERS")
    }
}
