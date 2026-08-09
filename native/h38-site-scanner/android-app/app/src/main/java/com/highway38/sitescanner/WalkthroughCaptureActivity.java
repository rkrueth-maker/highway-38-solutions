package com.highway38.sitescanner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.util.concurrent.TimeUnit;

public final class WalkthroughCaptureActivity extends ComponentActivity {
    private static final int REQUEST_PERMISSIONS = 5701;
    private static final long MAX_DURATION_MS = 90_000L;
    private static final String CAPTURE_PREFS = "h38-walkthrough-capture";
    private static final String CAPTURE_URI_KEY = "pending_uri";
    private static final String CAPTURE_READY_KEY = "ready";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PreviewView previewView;
    private TextView statusView;
    private Button lightButton;
    private Button finishButton;
    private Camera camera;
    private VideoCapture<Recorder> videoCapture;
    private Recording activeRecording;
    private File outputFile;
    private boolean torchOn;
    private boolean cancelled;
    private boolean finalized;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        buildUi();
        ensurePermissionsAndStart();
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        statusView = new TextView(this);
        statusView.setText("Starting camera + microphone…");
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(16);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(dp(18), dp(14), dp(18), dp(14));
        statusView.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        );
        statusParams.topMargin = dp(12);
        statusParams.leftMargin = dp(12);
        statusParams.rightMargin = dp(12);
        root.addView(statusView, statusParams);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(12), dp(14), dp(12), dp(22));
        controls.setMinimumHeight(dp(96));
        controls.setBackgroundColor(0xB8000000);

        Button cancelButton = new Button(this);
        cancelButton.setText("Cancel");
        cancelButton.setMinHeight(dp(68));
        cancelButton.setPadding(dp(10), dp(10), dp(10), dp(10));
        cancelButton.setOnClickListener(v -> cancelCapture());
        controls.addView(cancelButton, new LinearLayout.LayoutParams(0, dp(68), 1f));

        lightButton = new Button(this);
        lightButton.setText("Light On");
        lightButton.setEnabled(false);
        lightButton.setMinHeight(dp(68));
        lightButton.setPadding(dp(10), dp(10), dp(10), dp(10));
        lightButton.setOnClickListener(v -> toggleTorch());
        LinearLayout.LayoutParams lightParams = new LinearLayout.LayoutParams(0, dp(68), 1f);
        lightParams.leftMargin = dp(8);
        controls.addView(lightButton, lightParams);

        finishButton = new Button(this);
        finishButton.setText("Start Recording");
        finishButton.setEnabled(false);
        finishButton.setMinHeight(dp(68));
        finishButton.setTextSize(16);
        finishButton.setPadding(dp(12), dp(10), dp(12), dp(10));
        finishButton.setOnClickListener(v -> primaryAction());
        LinearLayout.LayoutParams finishParams = new LinearLayout.LayoutParams(0, dp(68), 2f);
        finishParams.leftMargin = dp(8);
        controls.addView(finishButton, finishParams);

        FrameLayout.LayoutParams controlsParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        root.addView(controls, controlsParams);

        final int baseTopMargin = dp(12);
        final int baseBottomPadding = dp(22);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            int topInset = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
            ).top;
            int bottomInset = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout()
            ).bottom;

            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) statusView.getLayoutParams();
            params.topMargin = baseTopMargin + topInset;
            statusView.setLayoutParams(params);
            controls.setPadding(dp(12), dp(14), dp(12), baseBottomPadding + bottomInset);
            return insets;
        });

        setContentView(root);
        ViewCompat.requestApplyInsets(root);
    }

    private void ensurePermissionsAndStart() {
        boolean cameraPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        boolean audioPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (cameraPermission && audioPermission) {
            bindCamera();
            return;
        }
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO},
                REQUEST_PERMISSIONS
        );
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_PERMISSIONS) return;
        boolean cameraPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        boolean audioPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (!cameraPermission || !audioPermission) {
            statusView.setText("Camera and microphone permission are both required.");
            lightButton.setEnabled(false);
            finishButton.setEnabled(false);
            return;
        }
        bindCamera();
    }

    private void bindCamera() {
        statusView.setText("Opening rear camera…");
        ListenableFuture<ProcessCameraProvider> providerFuture =
                ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            try {
                ProcessCameraProvider provider = providerFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                Recorder recorder = new Recorder.Builder()
                        .setQualitySelector(QualitySelector.from(Quality.HD))
                        .build();
                videoCapture = VideoCapture.withOutput(recorder);

                provider.unbindAll();
                camera = provider.bindToLifecycle(
                        this,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        videoCapture
                );
                boolean hasFlash = camera.getCameraInfo().hasFlashUnit();
                lightButton.setEnabled(hasFlash);
                lightButton.setText(hasFlash ? "Light On" : "No Light");
                statusView.setText("Camera + microphone ready. Turn the light on if needed, then start recording.");
                finishButton.setText("Start Recording");
                finishButton.setEnabled(true);
            } catch (Throwable error) {
                fail("Could not start the H38 camera: " + safeMessage(error));
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void primaryAction() {
        if (activeRecording == null && outputFile == null) {
            startRecording();
        } else {
            stopAndUseVideo();
        }
    }

    private void toggleTorch() {
        Camera activeCamera = camera;
        if (activeCamera == null || !activeCamera.getCameraInfo().hasFlashUnit()) return;
        boolean requested = !torchOn;
        lightButton.setEnabled(false);
        ListenableFuture<Void> torchFuture = activeCamera.getCameraControl().enableTorch(requested);
        torchFuture.addListener(() -> {
            try {
                torchFuture.get();
                torchOn = requested;
            } catch (Exception ignored) {
                torchOn = !requested;
            }
            runOnUiThread(() -> {
                lightButton.setText(torchOn ? "Light Off" : "Light On");
                lightButton.setEnabled(true);
            });
        }, ContextCompat.getMainExecutor(this));
    }

    private void turnTorchOff() {
        Camera activeCamera = camera;
        torchOn = false;
        if (lightButton != null) lightButton.setText("Light On");
        if (activeCamera != null && activeCamera.getCameraInfo().hasFlashUnit()) {
            try { activeCamera.getCameraControl().enableTorch(false); } catch (Exception ignored) {}
        }
    }

    private void startRecording() {
        if (videoCapture == null || activeRecording != null || outputFile != null) return;
        finishButton.setEnabled(false);
        finishButton.setText("Starting…");
        statusView.setText("Starting camera + microphone recording…");
        File dir = new File(getFilesDir(), "walkthroughs");
        if (!dir.exists() && !dir.mkdirs()) {
            fail("Could not create the H38 walkthrough folder.");
            return;
        }
        outputFile = new File(
                dir,
                "h38-site-walkthrough-" + System.currentTimeMillis() + ".mp4"
        );
        FileOutputOptions outputOptions = new FileOutputOptions.Builder(outputFile).build();
        PendingRecording pending = videoCapture.getOutput()
                .prepareRecording(this, outputOptions)
                .withAudioEnabled();
        activeRecording = pending.start(
                ContextCompat.getMainExecutor(this),
                this::handleVideoEvent
        );
        handler.postDelayed(() -> {
            if (!finalized && activeRecording != null) stopAndUseVideo();
        }, MAX_DURATION_MS);
    }

    private void handleVideoEvent(VideoRecordEvent event) {
        if (event instanceof VideoRecordEvent.Start) {
            statusView.setText("Recording camera + microphone");
            finishButton.setText("Stop & Use Video");
            finishButton.setEnabled(true);
            return;
        }
        if (event instanceof VideoRecordEvent.Status) {
            long nanos = event.getRecordingStats().getRecordedDurationNanos();
            long seconds = TimeUnit.NANOSECONDS.toSeconds(nanos);
            statusView.setText(String.format(
                    "Recording camera + microphone  %d:%02d",
                    seconds / 60,
                    seconds % 60
            ));
            return;
        }
        if (event instanceof VideoRecordEvent.Finalize) {
            activeRecording = null;
            finalizeCapture((VideoRecordEvent.Finalize) event);
        }
    }

    private void stopAndUseVideo() {
        if (finalized || outputFile == null) return;
        finishButton.setEnabled(false);
        statusView.setText("Saving walkthrough into H38…");
        turnTorchOff();
        if (activeRecording != null) {
            activeRecording.stop();
        } else if (outputFile.exists()) {
            completeWithFile();
        }
    }

    private void cancelCapture() {
        if (finalized) return;
        cancelled = true;
        finishButton.setEnabled(false);
        statusView.setText("Cancelling…");
        turnTorchOff();
        if (activeRecording != null) {
            activeRecording.stop();
        } else {
            finishCancelled();
        }
    }

    private void finalizeCapture(VideoRecordEvent.Finalize event) {
        if (finalized) return;
        if (cancelled) {
            finishCancelled();
            return;
        }
        if (event.hasError()) {
            fail("Walkthrough recording failed: " + event.getError());
            return;
        }
        completeWithFile();
    }

    private void completeWithFile() {
        if (finalized) return;
        if (outputFile == null || !outputFile.exists() || outputFile.length() < 1) {
            fail("The walkthrough video was empty. Record it again.");
            return;
        }
        finalized = true;
        turnTorchOff();
        handler.removeCallbacksAndMessages(null);
        Uri uri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".files",
                outputFile
        );
        getSharedPreferences(CAPTURE_PREFS, MODE_PRIVATE)
                .edit()
                .putString(CAPTURE_URI_KEY, uri.toString())
                .putBoolean(CAPTURE_READY_KEY, true)
                .apply();
        Intent result = new Intent();
        result.setData(uri);
        result.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        setResult(RESULT_OK, result);
        finish();
    }

    private void finishCancelled() {
        finalized = true;
        turnTorchOff();
        handler.removeCallbacksAndMessages(null);
        deleteOutput();
        clearCaptureTracking();
        setResult(RESULT_CANCELED);
        finish();
    }

    private void fail(String message) {
        finalized = true;
        turnTorchOff();
        handler.removeCallbacksAndMessages(null);
        if (activeRecording != null) {
            try { activeRecording.close(); } catch (Exception ignored) {}
            activeRecording = null;
        }
        deleteOutput();
        clearCaptureTracking();
        statusView.setText(message);
        lightButton.setEnabled(false);
        finishButton.setEnabled(false);
        setResult(RESULT_CANCELED);
        handler.postDelayed(this::finish, 1400);
    }

    private void deleteOutput() {
        if (outputFile != null && outputFile.exists()) {
            try { outputFile.delete(); } catch (Exception ignored) {}
        }
    }

    private void clearCaptureTracking() {
        getSharedPreferences(CAPTURE_PREFS, MODE_PRIVATE)
                .edit()
                .remove(CAPTURE_URI_KEY)
                .remove(CAPTURE_READY_KEY)
                .apply();
    }

    private String safeMessage(Throwable error) {
        String value = error == null ? "" : error.getMessage();
        return value == null || value.trim().isEmpty()
                ? error == null ? "Unknown error" : error.getClass().getSimpleName()
                : value;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        cancelCapture();
    }

    @Override
    protected void onDestroy() {
        turnTorchOff();
        handler.removeCallbacksAndMessages(null);
        if (!finalized && activeRecording != null) {
            try { activeRecording.close(); } catch (Exception ignored) {}
            activeRecording = null;
        }
        super.onDestroy();
    }
}