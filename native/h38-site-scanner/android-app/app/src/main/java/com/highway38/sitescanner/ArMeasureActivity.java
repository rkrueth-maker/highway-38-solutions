package com.highway38.sitescanner;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraNotAvailableException;
import com.google.ar.core.Config;
import com.google.ar.core.DepthPoint;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.UnavailableException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public final class ArMeasureActivity extends Activity implements GLSurfaceView.Renderer {
    private static final int REQUEST_CAMERA = 3810;
    private final CameraBackgroundRenderer background = new CameraBackgroundRenderer();
    private final AtomicBoolean pointRequested = new AtomicBoolean(false);

    private GLSurfaceView surface;
    private TextView status;
    private TextView result;
    private Button capture;
    private Button use;
    private Session session;
    private boolean installRequested;
    private boolean depthSupported;
    private int width;
    private int height;
    private int cameraTexture = -1;
    private Anchor first;
    private Anchor second;
    private String resultJson = "";
    private String optionsJson = "{}";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String supplied = getIntent().getStringExtra("options");
        if (supplied != null) optionsJson = supplied;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        surface = new GLSurfaceView(this);
        surface.setEGLContextClientVersion(2);
        surface.setEGLConfigChooser(8, 8, 8, 8, 16, 0);
        surface.setPreserveEGLContextOnPause(true);
        surface.setRenderer(this);
        surface.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(surface, match());

        TextView crosshair = new TextView(this);
        crosshair.setText("+");
        crosshair.setTextSize(42);
        crosshair.setTextColor(Color.WHITE);
        crosshair.setGravity(Gravity.CENTER);
        crosshair.setShadowLayer(5f, 0, 0, Color.BLACK);
        FrameLayout.LayoutParams cross = new FrameLayout.LayoutParams(dp(80), dp(80));
        cross.gravity = Gravity.CENTER;
        root.addView(crosshair, cross);

        LinearLayout top = panel();
        TextView title = text("H38 ARCore Measure", 20, Color.WHITE);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        top.addView(title);
        status = text("Starting ARCore…", 14, Color.WHITE);
        top.addView(status);
        result = text("Move slowly. Aim the crosshair at the first endpoint.", 14, 0xFFFFD9B8);
        top.addView(result);
        FrameLayout.LayoutParams topParams = wrap();
        topParams.gravity = Gravity.TOP;
        root.addView(top, topParams);

        LinearLayout controls = panel();
        capture = button("Set Point 1");
        capture.setOnClickListener(v -> requestPoint());
        controls.addView(capture, full());
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        Button reset = button("Reset");
        reset.setOnClickListener(v -> reset());
        row.addView(reset, weight());
        use = button("Use Measurement");
        use.setEnabled(false);
        use.setOnClickListener(v -> finishWithResult());
        row.addView(use, weight());
        controls.addView(row, full());
        TextView caution = text("DEVICE_CAPTURED only. Verify critical dimensions with a tape or laser.", 12, Color.WHITE);
        caution.setGravity(Gravity.CENTER);
        controls.addView(caution, full());
        FrameLayout.LayoutParams bottom = wrap();
        bottom.gravity = Gravity.BOTTOM;
        root.addView(controls, bottom);
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA);
            return;
        }
        startSession();
    }

    private void startSession() {
        if (session == null) {
            try {
                ArCoreApk.InstallStatus install = ArCoreApk.getInstance().requestInstall(this, !installRequested);
                if (install == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                    installRequested = true;
                    return;
                }
                session = new Session(this);
                Config config = session.getConfig();
                config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
                depthSupported = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC);
                config.setDepthMode(depthSupported ? Config.DepthMode.AUTOMATIC : Config.DepthMode.DISABLED);
                session.configure(config);
            } catch (UnavailableException e) {
                fail("ARCore is unavailable on this phone: " + e.getMessage());
                return;
            } catch (Throwable e) {
                fail("ARCore could not start: " + e.getMessage());
                return;
            }
        }
        try {
            session.resume();
            surface.onResume();
            status.setText(depthSupported ? "ARCore tracking · Depth API available" : "ARCore tracking · point-to-point fallback");
        } catch (CameraNotAvailableException e) {
            fail("The camera is being used by another app.");
        }
    }

    @Override
    protected void onPause() {
        if (session != null) {
            surface.onPause();
            session.pause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        detach(first);
        detach(second);
        if (session != null) session.close();
        super.onDestroy();
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0, 0, 0, 1);
        cameraTexture = background.createOnGlThread();
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int newWidth, int newHeight) {
        width = newWidth;
        height = newHeight;
        GLES20.glViewport(0, 0, width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        Session active = session;
        if (active == null || cameraTexture < 0 || width == 0 || height == 0) return;
        try {
            active.setCameraTextureName(cameraTexture);
            active.setDisplayGeometry(getWindowManager().getDefaultDisplay().getRotation(), width, height);
            Frame frame = active.update();
            background.draw(frame);
            Camera camera = frame.getCamera();
            updateTracking(camera);
            if (pointRequested.compareAndSet(true, false)) captureCenter(frame, camera);
        } catch (CameraNotAvailableException e) {
            runOnUiThread(() -> fail("Camera became unavailable."));
        } catch (Throwable e) {
            runOnUiThread(() -> Toast.makeText(this, "AR frame error: " + e.getMessage(), Toast.LENGTH_LONG).show());
        }
    }

    private void updateTracking(Camera camera) {
        String message;
        if (camera.getTrackingState() == TrackingState.TRACKING) {
            message = depthSupported ? "Tracking ready · Depth available" : "Tracking ready · Depth unavailable";
        } else if (camera.getTrackingState() == TrackingState.PAUSED) {
            message = "Move slowly and show more floor or wall texture";
        } else {
            message = "Tracking stopped — rescan this section";
        }
        runOnUiThread(() -> status.setText(message));
    }

    private void requestPoint() {
        if (session == null) {
            Toast.makeText(this, "ARCore is not ready yet.", Toast.LENGTH_SHORT).show();
            return;
        }
        pointRequested.set(true);
    }

    private void captureCenter(Frame frame, Camera camera) {
        if (camera.getTrackingState() != TrackingState.TRACKING) {
            toast("Tracking is not ready. Move slowly and try again.");
            return;
        }
        HitResult chosen = null;
        List<HitResult> hits = frame.hitTest(width / 2f, height / 2f);
        for (HitResult hit : hits) {
            if (hit.getTrackable() instanceof DepthPoint) {
                chosen = hit;
                break;
            }
            if (chosen == null && hit.getTrackable() instanceof Plane) {
                Plane plane = (Plane) hit.getTrackable();
                if (plane.isPoseInPolygon(hit.getHitPose())) chosen = hit;
            }
            if (chosen == null && hit.getTrackable() instanceof Point) {
                Point point = (Point) hit.getTrackable();
                if (point.getOrientationMode() == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL) chosen = hit;
            }
        }
        if (chosen == null) {
            toast("No surface found at the crosshair. Move sideways slowly and try again.");
            return;
        }
        boolean depthHit = chosen.getTrackable() instanceof DepthPoint;
        Anchor anchor = chosen.createAnchor();
        if (first == null) {
            first = anchor;
            runOnUiThread(() -> {
                capture.setText("Set Point 2");
                result.setText("Point 1 set. Aim the crosshair at the second endpoint.");
            });
            return;
        }
        detach(second);
        second = anchor;
        Pose start = first.getPose();
        Pose end = second.getPose();
        float meters = distance(start, end);
        String source = depthHit ? "ARCORE_DEPTH" : "ARCORE_POINT_TO_POINT";
        double confidence = depthHit ? 0.82 : 0.65;
        try {
            resultJson = buildResult(start, end, meters, source, confidence).toString();
        } catch (Exception e) {
            runOnUiThread(() -> fail("Could not create the measurement result."));
            return;
        }
        float feet = meters * 3.28084f;
        runOnUiThread(() -> {
            result.setText(String.format(Locale.US, "%.3f m · %.2f ft · %s", meters, feet, source));
            capture.setText("Replace Point 2");
            use.setEnabled(true);
        });
    }

    private JSONObject buildResult(Pose start, Pose end, float meters, String source, double confidence) throws Exception {
        JSONObject options = new JSONObject(optionsJson);
        String sessionId = options.optString("captureSessionId", "TEST-" + System.currentTimeMillis());
        JSONObject measurement = new JSONObject()
                .put("id", "AR-" + System.nanoTime())
                .put("label", "ARCore point-to-point")
                .put("type", "Length")
                .put("value", meters)
                .put("unit", "m")
                .put("source", source)
                .put("confidence", confidence)
                .put("verificationStatus", "DEVICE_CAPTURED")
                .put("startPoint", point(start))
                .put("endPoint", point(end))
                .put("notes", "ARCore-derived. Field verification remains required for critical work.");
        JSONObject device = new JSONObject()
                .put("platform", "android")
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("androidApi", Build.VERSION.SDK_INT)
                .put("arcore", true)
                .put("depth", depthSupported);
        return new JSONObject()
                .put("version", "h38-site-scanner-v1")
                .put("captureSessionId", sessionId)
                .put("captureMode", "ANDROID_DEPTH")
                .put("device", device)
                .put("entities", new JSONArray())
                .put("measurements", new JSONArray().put(measurement))
                .put("status", "CAPTURED");
    }

    private static JSONObject point(Pose pose) throws Exception {
        return new JSONObject()
                .put("x", pose.tx())
                .put("y", pose.ty())
                .put("z", pose.tz())
                .put("coordinateSystem", "ARCORE_WORLD_METERS");
    }

    private static float distance(Pose a, Pose b) {
        float x = b.tx() - a.tx();
        float y = b.ty() - a.ty();
        float z = b.tz() - a.tz();
        return (float) Math.sqrt(x * x + y * y + z * z);
    }

    private void reset() {
        detach(first);
        detach(second);
        first = null;
        second = null;
        resultJson = "";
        capture.setText("Set Point 1");
        use.setEnabled(false);
        result.setText("Move slowly. Aim the crosshair at the first endpoint.");
    }

    private void finishWithResult() {
        if (resultJson.isEmpty()) return;
        Intent data = new Intent().putExtra("result", resultJson);
        setResult(RESULT_OK, data);
        finish();
    }

    private void fail(String message) {
        setResult(RESULT_CANCELED, new Intent().putExtra("error", message));
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finish();
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_CAMERA) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startSession();
            else fail("Camera permission is required for ARCore measurement.");
        }
    }

    private LinearLayout panel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(14), dp(12), dp(14), dp(12));
        panel.setBackgroundColor(0xDD102B3F);
        return panel;
    }

    private TextView text(String value, int size, int color) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        return text;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setMinHeight(dp(52));
        return button;
    }

    private FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private FrameLayout.LayoutParams wrap() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams full() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams weight() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p.setMargins(dp(3), dp(3), dp(3), dp(3));
        return p;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static void detach(Anchor anchor) {
        if (anchor != null) anchor.detach();
    }
}
