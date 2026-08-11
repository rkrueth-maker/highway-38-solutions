package com.highway38.sitescanner;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
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

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.ar.core.Anchor;
import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.DepthPoint;
import com.google.ar.core.Frame;
import com.google.ar.core.HitResult;
import com.google.ar.core.Plane;
import com.google.ar.core.Point;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public final class ArMeasureActivity extends Activity implements GLSurfaceView.Renderer {
    private static final int REQUEST_CAMERA = 3810;
    private static final int NAVY = 0xFF102B3F;
    private static final int BLUE = 0xFF145777;
    private static final int GREEN = 0xFF176B3A;

    private final CameraBackgroundRenderer background = new CameraBackgroundRenderer();
    private final AtomicBoolean pointRequested = new AtomicBoolean(false);

    private GLSurfaceView surface;
    private TextView status;
    private TextView result;
    private Button capture;
    private Button use;
    private Session session;
    private boolean surfaceResumed;
    private boolean installRequested;
    private boolean availabilityCheckInFlight;
    private boolean depthSupported;
    private boolean firstDepth;
    private int width;
    private int height;
    private int cameraTexture = -1;
    private Anchor first;
    private Anchor second;
    private String resultJson = "";
    private String optionsJson = "{}";
    private String lastTrackingMessage = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureSystemBars();
        String supplied = getIntent().getStringExtra("options");
        if (supplied != null && !supplied.trim().isEmpty()) optionsJson = supplied;

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
        crosshair.setTextSize(48);
        crosshair.setTextColor(Color.WHITE);
        crosshair.setGravity(Gravity.CENTER);
        crosshair.setShadowLayer(6f, 0, 0, Color.BLACK);
        FrameLayout.LayoutParams cross = new FrameLayout.LayoutParams(dp(90), dp(90));
        cross.gravity = Gravity.CENTER;
        root.addView(crosshair, cross);

        LinearLayout top = panel();
        TextView step = text("ANDROID AR MEASUREMENT", 12, 0xFFFFD9B8);
        step.setTypeface(null, android.graphics.Typeface.BOLD);
        top.addView(step);
        TextView title = text(measurementLabel(), 23, Color.WHITE);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        top.addView(title);
        status = text("Checking ARCore support…", 15, Color.WHITE);
        status.setPadding(0, dp(4), 0, 0);
        top.addView(status);
        result = text("Move slowly and show the floor, wall, or edge you want to measure.", 17, 0xFFFFE2C5);
        result.setPadding(0, dp(8), 0, 0);
        result.setLineSpacing(0, 1.12f);
        top.addView(result);
        FrameLayout.LayoutParams topParams = wrap();
        topParams.gravity = Gravity.TOP;
        root.addView(top, topParams);

        LinearLayout controls = panel();
        TextView direction = text("Aim the + at the first end of the distance.", 15, Color.WHITE);
        direction.setGravity(Gravity.CENTER);
        direction.setPadding(0, 0, 0, dp(7));
        controls.addView(direction, full());

        capture = primaryButton("Set First Point", BLUE);
        capture.setEnabled(false);
        capture.setOnClickListener(v -> requestPoint());
        controls.addView(capture, fullWithMargin());

        use = primaryButton("Save This Measurement", GREEN);
        use.setEnabled(false);
        use.setOnClickListener(v -> finishWithResult());
        controls.addView(use, fullWithMargin());

        Button reset = button("Start Over");
        reset.setOnClickListener(v -> resetMeasurement());
        controls.addView(reset, fullWithMargin());

        TextView caution = text("AR measurements remain device-captured evidence. Check critical dimensions with a tape or laser before ordering, fabrication, permits, or construction.", 12, Color.WHITE);
        caution.setGravity(Gravity.CENTER);
        caution.setPadding(0, dp(5), 0, 0);
        controls.addView(caution, full());
        FrameLayout.LayoutParams bottom = wrap();
        bottom.gravity = Gravity.BOTTOM;
        root.addView(controls, bottom);

        setContentView(root);
    }

    private void configureSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(NAVY);
        getWindow().setNavigationBarColor(NAVY);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(),
                getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA);
            return;
        }
        ensureArCoreAndResume();
    }

    private void ensureArCoreAndResume() {
        if (session != null) {
            resumeSession();
            return;
        }
        if (availabilityCheckInFlight) return;

        availabilityCheckInFlight = true;
        setStatus("Checking ARCore support…");
        try {
            ArCoreApk.getInstance().checkAvailabilityAsync(this, availability -> {
                availabilityCheckInFlight = false;
                if (isFinishing() || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && isDestroyed())) return;
                if (!availability.isSupported()) {
                    fail("ARCore is not supported on this phone.");
                    return;
                }
                installAndCreateSession();
            });
        } catch (Throwable error) {
            availabilityCheckInFlight = false;
            fail("ARCore support check failed: " + safeMessage(error));
        }
    }

    private void installAndCreateSession() {
        try {
            ArCoreApk.InstallStatus installStatus = ArCoreApk.getInstance().requestInstall(this, !installRequested);
            if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                installRequested = true;
                setStatus("Install or update Google Play Services for AR, then return here.");
                return;
            }

            Session created = new Session(this);
            Config config = created.getConfig();
            config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL);
            depthSupported = created.isDepthModeSupported(Config.DepthMode.AUTOMATIC);
            config.setDepthMode(depthSupported ? Config.DepthMode.AUTOMATIC : Config.DepthMode.DISABLED);
            created.configure(config);
            session = created;
            resumeSession();
        } catch (Throwable error) {
            fail("ARCore could not start: " + safeMessage(error));
        }
    }

    private void resumeSession() {
        if (session == null) return;
        try {
            session.resume();
            if (!surfaceResumed) {
                surface.onResume();
                surfaceResumed = true;
            }
            capture.setEnabled(true);
            setStatus(depthSupported
                    ? "Move slowly until Tracking ready · Depth enabled"
                    : "Move slowly until Tracking ready · Point-to-point mode");
        } catch (CameraNotAvailableException error) {
            fail("The camera is unavailable. Close other camera apps and try again.");
        } catch (Throwable error) {
            fail("ARCore session could not resume: " + safeMessage(error));
        }
    }

    @Override
    protected void onPause() {
        pointRequested.set(false);
        if (surfaceResumed) {
            surface.onPause();
            surfaceResumed = false;
        }
        if (session != null) {
            try {
                session.pause();
            } catch (Throwable ignored) {
            }
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        detach(first);
        detach(second);
        if (session != null) {
            try {
                session.close();
            } catch (Throwable ignored) {
            }
            session = null;
        }
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
        if (active == null || cameraTexture < 0 || width <= 0 || height <= 0) return;
        try {
            active.setCameraTextureName(cameraTexture);
            active.setDisplayGeometry(
                    getWindowManager().getDefaultDisplay().getRotation(),
                    width,
                    height
            );
            Frame frame = active.update();
            background.draw(frame);
            Camera camera = frame.getCamera();
            updateTracking(camera);
            if (pointRequested.compareAndSet(true, false)) captureCenter(frame, camera);
        } catch (CameraNotAvailableException error) {
            runOnUiThread(() -> fail("The AR camera became unavailable."));
        } catch (Throwable error) {
            pointRequested.set(false);
            runOnUiThread(() -> setStatus("AR frame needs another try: " + safeMessage(error)));
        }
    }

    private void updateTracking(Camera camera) {
        String message;
        if (camera.getTrackingState() == TrackingState.TRACKING) {
            message = depthSupported
                    ? "Tracking ready · Depth enabled"
                    : "Tracking ready · Point-to-point mode";
        } else if (camera.getTrackingState() == TrackingState.PAUSED) {
            message = "Move slowly and show more surface detail";
        } else {
            message = "Tracking stopped · Point back at the work area";
        }
        if (message.equals(lastTrackingMessage)) return;
        lastTrackingMessage = message;
        setStatus(message);
    }

    private void requestPoint() {
        if (session == null || !surfaceResumed) {
            Toast.makeText(this, "The AR camera is not ready yet.", Toast.LENGTH_SHORT).show();
            return;
        }
        pointRequested.set(true);
    }

    private void captureCenter(Frame frame, Camera camera) {
        if (camera.getTrackingState() != TrackingState.TRACKING) {
            toast("Wait for Tracking ready, then try again.");
            return;
        }

        HitResult chosen = chooseHit(frame.hitTest(width / 2f, height / 2f));
        if (chosen == null) {
            toast("No usable surface was found at the +. Move sideways slowly and aim again.");
            return;
        }

        boolean depthHit = chosen.getTrackable() instanceof DepthPoint;
        Anchor anchor;
        try {
            anchor = chosen.createAnchor();
        } catch (Throwable error) {
            toast("That point could not be anchored. Aim again.");
            return;
        }

        if (first == null) {
            first = anchor;
            firstDepth = depthHit;
            runOnUiThread(() -> {
                capture.setText("Set Second Point");
                result.setText("First point saved. Aim the + at the other end of the distance.");
            });
            return;
        }

        detach(second);
        second = anchor;
        Pose start = first.getPose();
        Pose end = second.getPose();
        float meters = distance(start, end);
        if (!Float.isFinite(meters) || meters <= 0.001f) {
            detach(second);
            second = null;
            toast("The two points are too close together. Aim at the other end of the distance.");
            return;
        }

        boolean depthMeasurement = firstDepth && depthHit;
        String source = depthMeasurement ? "ARCORE_DEPTH" : "ARCORE_POINT_TO_POINT";
        double confidence = depthMeasurement ? 0.85 : 0.70;
        double totalInches = roundToEighth(meters * 39.3700787402);

        try {
            resultJson = buildResult(start, end, meters, totalInches, source, confidence).toString();
        } catch (Exception error) {
            runOnUiThread(() -> fail("Could not create the AR measurement result."));
            return;
        }

        String display = formatFeetInches(totalInches);
        runOnUiThread(() -> {
            result.setText(display + (depthMeasurement ? "\nDepth hit at both endpoints" : "\nARCore point-to-point"));
            result.setTextSize(26);
            result.setTextColor(Color.WHITE);
            result.setTypeface(null, android.graphics.Typeface.BOLD);
            capture.setText("Replace Second Point");
            use.setEnabled(true);
        });
    }

    private HitResult chooseHit(List<HitResult> hits) {
        HitResult planeChoice = null;
        HitResult pointChoice = null;
        for (HitResult hit : hits) {
            if (hit.getTrackable() instanceof DepthPoint) return hit;
            if (planeChoice == null && hit.getTrackable() instanceof Plane) {
                Plane plane = (Plane) hit.getTrackable();
                if (plane.isPoseInPolygon(hit.getHitPose())) planeChoice = hit;
            }
            if (pointChoice == null && hit.getTrackable() instanceof Point) {
                Point point = (Point) hit.getTrackable();
                if (point.getOrientationMode() == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL) {
                    pointChoice = hit;
                }
            }
        }
        return planeChoice != null ? planeChoice : pointChoice;
    }

    private JSONObject buildResult(
            Pose start,
            Pose end,
            float meters,
            double totalInches,
            String source,
            double confidence
    ) throws Exception {
        JSONObject options = new JSONObject(optionsJson);
        String sessionId = options.optString("captureSessionId", "TEST-" + System.currentTimeMillis());
        String label = requestedMeasurementLabel(options);
        String request = options.optString("measurementRequest", "").trim();

        JSONObject measurement = new JSONObject()
                .put("id", "AR-" + System.nanoTime())
                .put("label", label)
                .put("type", "Length")
                .put("value", totalInches)
                .put("unit", "in")
                .put("displayValue", formatFeetInches(totalInches))
                .put("rawMeters", meters)
                .put("source", source)
                .put("confidence", confidence)
                .put("verificationStatus", "DEVICE_CAPTURED")
                .put("startPoint", point(start))
                .put("endPoint", point(end))
                .put("notes", request.isEmpty()
                        ? "ARCore device capture. Verify critical dimensions with tape or laser."
                        : "ARCore device capture for: " + request + ". Verify critical dimensions with tape or laser.");

        JSONObject device = new JSONObject()
                .put("platform", "android")
                .put("manufacturer", Build.MANUFACTURER)
                .put("model", Build.MODEL)
                .put("androidApi", Build.VERSION.SDK_INT)
                .put("arcore", true)
                .put("depthSupported", depthSupported)
                .put("depthUsed", "ARCORE_DEPTH".equals(source))
                .put("displayUnits", "feet-and-inches");

        return new JSONObject()
                .put("version", "h38-site-scanner-v1")
                .put("captureSessionId", sessionId)
                .put("captureMode", "ARCORE_DEPTH".equals(source) ? "ANDROID_DEPTH" : "ANDROID_ARCORE")
                .put("device", device)
                .put("entities", new JSONArray())
                .put("measurements", new JSONArray().put(measurement))
                .put("status", "CAPTURED");
    }

    private String measurementLabel() {
        try {
            return requestedMeasurementLabel(new JSONObject(optionsJson));
        } catch (Exception ignored) {
            return "Measure a Distance";
        }
    }

    private static String requestedMeasurementLabel(JSONObject options) {
        String label = options.optString("measurementLabel", "").trim();
        if (!label.isEmpty()) return label;
        String request = options.optString("measurementRequest", "").trim();
        if (!request.isEmpty()) {
            String cleaned = request
                    .replaceFirst("(?i)^verify\\s+", "")
                    .replaceFirst("(?i)^measure\\s+", "")
                    .split("[.;]", 2)[0]
                    .trim();
            if (!cleaned.isEmpty()) return cleaned.length() > 110 ? cleaned.substring(0, 110) : cleaned;
        }
        return "ARCore measurement";
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

    private static double roundToEighth(double inches) {
        return Math.round(inches * 8.0) / 8.0;
    }

    private static String formatFeetInches(double totalInches) {
        int eighths = (int) Math.round(Math.max(0, totalInches) * 8.0);
        int wholeInches = eighths / 8;
        int remainder = eighths % 8;
        int feet = wholeInches / 12;
        int inches = wholeInches % 12;
        StringBuilder display = new StringBuilder();
        display.append(feet).append(" ft ").append(inches);
        if (remainder > 0) {
            int divisor = gcd(remainder, 8);
            display.append(' ')
                    .append(remainder / divisor)
                    .append('/')
                    .append(8 / divisor);
        }
        display.append(" in");
        return display.toString();
    }

    private static int gcd(int a, int b) {
        int left = Math.abs(a);
        int right = Math.abs(b);
        while (right != 0) {
            int next = left % right;
            left = right;
            right = next;
        }
        return left == 0 ? 1 : left;
    }

    private void resetMeasurement() {
        detach(first);
        detach(second);
        first = null;
        second = null;
        firstDepth = false;
        resultJson = "";
        use.setEnabled(false);
        capture.setText("Set First Point");
        result.setText("Aim the + at the first end of the distance.");
        result.setTextSize(17);
        result.setTextColor(0xFFFFE2C5);
        result.setTypeface(null, android.graphics.Typeface.NORMAL);
    }

    private void finishWithResult() {
        if (resultJson.isEmpty()) return;
        Intent data = new Intent().putExtra("result", resultJson);
        setResult(RESULT_OK, data);
        finish();
    }

    private void fail(String message) {
        if (isFinishing()) return;
        setResult(RESULT_CANCELED, new Intent().putExtra("error", message));
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finish();
    }

    private void setStatus(String message) {
        runOnUiThread(() -> {
            if (status != null) status.setText(message);
        });
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_CAMERA) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            ensureArCoreAndResume();
        } else {
            fail("Camera permission is required for AR measurement.");
        }
    }

    private static String safeMessage(Throwable error) {
        String message = error == null ? "" : error.getMessage();
        if (message == null || message.trim().isEmpty()) return error == null ? "unknown error" : error.getClass().getSimpleName();
        return message;
    }

    private void detach(Anchor anchor) {
        if (anchor == null) return;
        try {
            anchor.detach();
        } catch (Throwable ignored) {
        }
    }

    private LinearLayout panel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18), dp(18), dp(18), dp(18));
        panel.setBackgroundColor(0xDD102B3F);
        return panel;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private Button primaryButton(String label, int color) {
        Button button = button(label);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(ColorStateList.valueOf(color));
        return button;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setMinHeight(dp(54));
        return button;
    }

    private FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
    }

    private FrameLayout.LayoutParams wrap() {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(dp(12), dp(12), dp(12), dp(12));
        return params;
    }

    private LinearLayout.LayoutParams full() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams fullWithMargin() {
        LinearLayout.LayoutParams params = full();
        params.topMargin = dp(6);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
