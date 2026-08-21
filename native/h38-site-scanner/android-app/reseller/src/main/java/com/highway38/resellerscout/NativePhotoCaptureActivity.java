package com.highway38.resellerscout;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;

/**
 * Private in-app still camera for Reseller Scout research photos.
 * Avoids OEM ACTION_IMAGE_CAPTURE/exported-activity/FileProvider compatibility failures.
 */
public final class NativePhotoCaptureActivity extends ComponentActivity {
    public static final String EXTRA_ROLE = "role";
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_ERROR = "error";
    public static final String CAMERA_X_MARKER = "H38_SCOUT_CAMERAX_PHOTO_V039";
    private static final int REQUEST_CAMERA = 4011;

    private FrameLayout root;
    private PreviewView previewView;
    private Button captureButton;
    private TextView status;
    private ImageCapture imageCapture;
    private ProcessCameraProvider cameraProvider;
    private String role = "item";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        role = value(getIntent().getStringExtra(EXTRA_ROLE), "item");
        buildUi();
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera();
        else requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA);
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setPadding(dp(16), dp(12), dp(16), dp(12));
        top.setBackgroundColor(0x99000000);
        TextView title = new TextView(this);
        title.setTextColor(Color.WHITE);
        title.setTextSize(18f);
        title.setText("Scout photo · " + roleLabel(role));
        top.addView(title);
        status = new TextView(this);
        status.setTextColor(0xffdddddd);
        status.setTextSize(13f);
        status.setText("Starting camera…");
        top.addView(status);
        FrameLayout.LayoutParams topLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        root.addView(top, topLp);

        LinearLayout controls = new LinearLayout(this);
        controls.setGravity(Gravity.CENTER);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setPadding(dp(14), dp(12), dp(14), dp(12));
        controls.setBackgroundColor(0xbb000000);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setOnClickListener(v -> { setResult(Activity.RESULT_CANCELED); finish(); });
        controls.addView(cancel, new LinearLayout.LayoutParams(0, dp(58), 1f));

        captureButton = new Button(this);
        captureButton.setText("Take Photo");
        captureButton.setEnabled(false);
        captureButton.setOnClickListener(v -> capture());
        LinearLayout.LayoutParams captureLp = new LinearLayout.LayoutParams(0, dp(58), 1.35f);
        captureLp.setMargins(dp(10), 0, 0, 0);
        controls.addView(captureButton, captureLp);

        FrameLayout.LayoutParams controlsLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(controls, controlsLp);
        setContentView(root);

        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void startCamera() {
        status.setText("Starting camera…");
        ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(() -> {
            try {
                cameraProvider = future.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .build();
                cameraProvider.unbindAll();
                cameraProvider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
                captureButton.setEnabled(true);
                status.setText("Center the item, then tap Take Photo.");
            } catch (Exception e) {
                fail("Camera could not start: " + safe(e));
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void capture() {
        if (imageCapture == null) {
            status.setText("Camera is still starting.");
            return;
        }
        captureButton.setEnabled(false);
        status.setText("Saving photo…");
        File file = new File(getCacheDir(), "scout-native-photo-" + System.currentTimeMillis() + ".jpg");
        ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder(file).build();
        imageCapture.takePicture(options, ContextCompat.getMainExecutor(this), new ImageCapture.OnImageSavedCallback() {
            @Override public void onImageSaved(ImageCapture.OutputFileResults output) {
                if (!file.isFile() || file.length() <= 0) {
                    fail("Camera returned an empty image.");
                    return;
                }
                Intent result = new Intent();
                result.putExtra(EXTRA_PATH, file.getAbsolutePath());
                result.putExtra(EXTRA_ROLE, role);
                setResult(Activity.RESULT_OK, result);
                finish();
            }

            @Override public void onError(ImageCaptureException exception) {
                try { if (file.exists()) file.delete(); } catch (Exception ignored) {}
                fail("Photo capture failed: " + safe(exception));
            }
        });
    }

    private void fail(String message) {
        Intent result = new Intent();
        result.putExtra(EXTRA_ERROR, message);
        setResult(Activity.RESULT_CANCELED, result);
        status.setText(message);
        captureButton.setEnabled(false);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_CAMERA) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startCamera();
        else fail("Camera permission is required to take Research photos.");
    }

    @Override protected void onDestroy() {
        if (cameraProvider != null) {
            try { cameraProvider.unbindAll(); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static String value(String v, String fallback) { return v == null || v.trim().isEmpty() ? fallback : v.trim(); }
    private static String safe(Throwable e) { String m = e == null ? "unknown camera error" : e.getMessage(); return m == null || m.isBlank() ? "unknown camera error" : m; }
    private static String roleLabel(String r) {
        if ("label".equals(r)) return "label / model";
        if ("angle".equals(r)) return "another angle";
        if ("damage".equals(r)) return "damage";
        return "item";
    }
}
