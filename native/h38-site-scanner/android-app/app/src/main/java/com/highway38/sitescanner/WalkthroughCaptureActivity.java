package com.highway38.sitescanner;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
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
import java.nio.ByteBuffer;
import java.util.concurrent.TimeUnit;

public final class WalkthroughCaptureActivity extends ComponentActivity {
    private static final int REQUEST_PERMISSIONS = 5701;
    private static final long MAX_DURATION_MS = 90_000L;
    private static final String CAPTURE_PREFS = "h38-walkthrough-capture";
    private static final String CAPTURE_URI_KEY = "pending_uri";
    private static final String CAPTURE_READY_KEY = "ready";
    private static final String AUDIO_URI_KEY = "pending_audio_uri";
    private static final String AUDIO_READY_KEY = "audio_ready";

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

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.BLACK); getWindow().setNavigationBarColor(Color.BLACK);
        buildUi(); ensurePermissionsAndStart();
    }

    private void buildUi() {
        FrameLayout root=new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        previewView=new PreviewView(this); previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER); root.addView(previewView,new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT));
        statusView=new TextView(this); statusView.setText("🔨 H38 is opening camera + microphone…"); statusView.setTextColor(Color.WHITE); statusView.setTextSize(17); statusView.setGravity(Gravity.CENTER); statusView.setPadding(dp(18),dp(15),dp(18),dp(15)); statusView.setBackgroundColor(0xB8000000);
        FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT,Gravity.TOP); sp.topMargin=dp(12);sp.leftMargin=dp(12);sp.rightMargin=dp(12);root.addView(statusView,sp);
        LinearLayout controls=new LinearLayout(this);controls.setOrientation(LinearLayout.VERTICAL);controls.setGravity(Gravity.CENTER);controls.setPadding(dp(14),dp(14),dp(14),dp(26));controls.setMinimumHeight(dp(178));controls.setBackgroundColor(0xD6000000);
        finishButton=new Button(this);finishButton.setText("Starting Recording…");finishButton.setEnabled(false);finishButton.setMinHeight(dp(80));finishButton.setTextSize(18);finishButton.setPadding(dp(16),dp(14),dp(16),dp(14));finishButton.setOnClickListener(v->{v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);stopAndUseVideo();});controls.addView(finishButton,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(80)));
        LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);row.setGravity(Gravity.CENTER);LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,dp(72));rp.topMargin=dp(10);controls.addView(row,rp);
        Button cancel=new Button(this);cancel.setText("Cancel");cancel.setMinHeight(dp(72));cancel.setTextSize(16);cancel.setOnClickListener(v->{v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);cancelCapture();});row.addView(cancel,new LinearLayout.LayoutParams(0,dp(72),1f));
        lightButton=new Button(this);lightButton.setText("Light On");lightButton.setEnabled(false);lightButton.setMinHeight(dp(72));lightButton.setTextSize(16);lightButton.setOnClickListener(v->{v.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);toggleTorch();});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,dp(72),1f);lp.leftMargin=dp(10);row.addView(lightButton,lp);
        FrameLayout.LayoutParams cp=new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT,Gravity.BOTTOM);cp.leftMargin=dp(8);cp.rightMargin=dp(8);cp.bottomMargin=dp(8);root.addView(controls,cp);
        final int bt=dp(12),bb=dp(26),bm=dp(8);ViewCompat.setOnApplyWindowInsetsListener(root,(view,insets)->{int ti=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()).top;int bi=insets.getInsets(WindowInsetsCompat.Type.systemBars()|WindowInsetsCompat.Type.displayCutout()|WindowInsetsCompat.Type.ime()).bottom;FrameLayout.LayoutParams p=(FrameLayout.LayoutParams)statusView.getLayoutParams();p.topMargin=bt+ti;statusView.setLayoutParams(p);controls.setPadding(dp(14),dp(14),dp(14),bb+bi);FrameLayout.LayoutParams c=(FrameLayout.LayoutParams)controls.getLayoutParams();c.bottomMargin=bm;controls.setLayoutParams(c);return insets;});setContentView(root);ViewCompat.requestApplyInsets(root);
    }

    private void ensurePermissionsAndStart(){boolean cam=ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;boolean mic=ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;if(cam&&mic){bindCamera();return;}ActivityCompat.requestPermissions(this,new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},REQUEST_PERMISSIONS);}
    @Override public void onRequestPermissionsResult(int requestCode,@NonNull String[] permissions,@NonNull int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode!=REQUEST_PERMISSIONS)return;boolean cam=ContextCompat.checkSelfPermission(this,Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;boolean mic=ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;if(!cam||!mic){statusView.setText("Camera and microphone permission are both required.");return;}bindCamera();}
    private void bindCamera(){statusView.setText("🔨 H38 is opening the rear camera…");ListenableFuture<ProcessCameraProvider> f=ProcessCameraProvider.getInstance(this);f.addListener(()->{try{ProcessCameraProvider p=f.get();Preview preview=new Preview.Builder().build();preview.setSurfaceProvider(previewView.getSurfaceProvider());Recorder recorder=new Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.SD)).build();videoCapture=VideoCapture.withOutput(recorder);p.unbindAll();camera=p.bindToLifecycle(this,CameraSelector.DEFAULT_BACK_CAMERA,preview,videoCapture);boolean flash=camera.getCameraInfo().hasFlashUnit();lightButton.setEnabled(flash);lightButton.setText(flash?"Light On":"No Light");statusView.setText("🔨 H38 is starting camera + microphone recording…");handler.postDelayed(this::startRecording,120);}catch(Throwable e){fail("Could not start the H38 camera: "+safeMessage(e));}},ContextCompat.getMainExecutor(this));}
    private void startRecording(){if(videoCapture==null||activeRecording!=null||outputFile!=null||finalized)return;File dir=new File(getFilesDir(),"walkthroughs");if(!dir.exists()&&!dir.mkdirs()){fail("Could not create the H38 walkthrough folder.");return;}outputFile=new File(dir,"h38-site-walkthrough-"+System.currentTimeMillis()+".mp4");PendingRecording pending=videoCapture.getOutput().prepareRecording(this,new FileOutputOptions.Builder(outputFile).build()).withAudioEnabled();activeRecording=pending.start(ContextCompat.getMainExecutor(this),this::handleVideoEvent);handler.postDelayed(()->{if(!finalized&&activeRecording!=null)stopAndUseVideo();},MAX_DURATION_MS);}
    private void handleVideoEvent(VideoRecordEvent event){if(event instanceof VideoRecordEvent.Start){statusView.setText("Recording camera + microphone  0:00");finishButton.setText("Stop & Use Video");finishButton.setEnabled(true);return;}if(event instanceof VideoRecordEvent.Status){long s=TimeUnit.NANOSECONDS.toSeconds(event.getRecordingStats().getRecordedDurationNanos());statusView.setText(String.format("Recording camera + microphone  %d:%02d",s/60,s%60));return;}if(event instanceof VideoRecordEvent.Finalize){activeRecording=null;finalizeCapture((VideoRecordEvent.Finalize)event);}}
    private void toggleTorch(){Camera c=camera;if(c==null||!c.getCameraInfo().hasFlashUnit())return;boolean r=!torchOn;lightButton.setEnabled(false);ListenableFuture<Void> f=c.getCameraControl().enableTorch(r);f.addListener(()->{try{f.get();torchOn=r;}catch(Exception ignored){}runOnUiThread(()->{lightButton.setText(torchOn?"Light Off":"Light On");lightButton.setEnabled(true);});},ContextCompat.getMainExecutor(this));}
    private void turnTorchOff(){torchOn=false;if(lightButton!=null)lightButton.setText("Light On");if(camera!=null&&camera.getCameraInfo().hasFlashUnit())try{camera.getCameraControl().enableTorch(false);}catch(Exception ignored){}}
    private void stopAndUseVideo(){if(finalized||outputFile==null)return;finishButton.setEnabled(false);finishButton.setText("Saving…");statusView.setText("🔨 H38 is saving walkthrough…");turnTorchOff();if(activeRecording!=null)activeRecording.stop();else if(outputFile.exists())completeWithFile();}
    private void cancelCapture(){if(finalized)return;cancelled=true;finishButton.setEnabled(false);statusView.setText("Cancelling…");turnTorchOff();if(activeRecording!=null)activeRecording.stop();else finishCancelled();}
    private void finalizeCapture(VideoRecordEvent.Finalize event){if(finalized)return;if(cancelled){finishCancelled();return;}if(event.hasError()){fail("Walkthrough recording failed: "+event.getError());return;}completeWithFile();}

    private File extractAudioTrack(File videoFile) throws Exception {
        MediaExtractor extractor=new MediaExtractor(); MediaMuxer muxer=null;
        try{
            extractor.setDataSource(videoFile.getAbsolutePath()); int audioTrack=-1; MediaFormat format=null;
            for(int i=0;i<extractor.getTrackCount();i++){MediaFormat f=extractor.getTrackFormat(i);String mime=f.getString(MediaFormat.KEY_MIME);if(mime!=null&&mime.startsWith("audio/")){audioTrack=i;format=f;break;}}
            if(audioTrack<0||format==null)throw new IllegalStateException("No microphone audio track was found.");
            File audioFile=new File(videoFile.getParentFile(),videoFile.getName().replace(".mp4","-audio.m4a"));
            if(audioFile.exists())audioFile.delete();
            muxer=new MediaMuxer(audioFile.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);int outTrack=muxer.addTrack(format);muxer.start();extractor.selectTrack(audioTrack);
            int maxInput=512*1024;try{if(format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE))maxInput=Math.max(maxInput,format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE));}catch(Throwable ignored){}
            ByteBuffer buffer=ByteBuffer.allocateDirect(maxInput);MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            while(true){buffer.clear();int size=extractor.readSampleData(buffer,0);if(size<0)break;info.offset=0;info.size=size;info.presentationTimeUs=extractor.getSampleTime();info.flags=extractor.getSampleFlags();muxer.writeSampleData(outTrack,buffer,info);extractor.advance();}
            muxer.stop();muxer.release();muxer=null;if(!audioFile.exists()||audioFile.length()<1)throw new IllegalStateException("Microphone audio extraction produced an empty file.");return audioFile;
        }finally{try{extractor.release();}catch(Throwable ignored){}if(muxer!=null)try{muxer.release();}catch(Throwable ignored){}}
    }

    private void completeWithFile(){if(finalized)return;if(outputFile==null||!outputFile.exists()||outputFile.length()<1){fail("The walkthrough video was empty. Record it again.");return;}statusView.setText("🔨 H38 is preparing spoken notes…");File audioFile;try{audioFile=extractAudioTrack(outputFile);}catch(Throwable error){fail("The walkthrough microphone audio could not be prepared: "+safeMessage(error));return;}finalized=true;turnTorchOff();handler.removeCallbacksAndMessages(null);Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",outputFile);Uri audioUri=FileProvider.getUriForFile(this,getPackageName()+".files",audioFile);getSharedPreferences(CAPTURE_PREFS,MODE_PRIVATE).edit().putString(CAPTURE_URI_KEY,uri.toString()).putBoolean(CAPTURE_READY_KEY,true).putString(AUDIO_URI_KEY,audioUri.toString()).putBoolean(AUDIO_READY_KEY,true).apply();Intent result=new Intent();result.setData(uri);result.putExtra("audioUri",audioUri.toString());result.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);setResult(RESULT_OK,result);finish();}
    private void finishCancelled(){finalized=true;turnTorchOff();handler.removeCallbacksAndMessages(null);deleteOutput();clearCaptureTracking();setResult(RESULT_CANCELED);finish();}
    private void fail(String m){finalized=true;turnTorchOff();handler.removeCallbacksAndMessages(null);if(activeRecording!=null){try{activeRecording.close();}catch(Exception ignored){}activeRecording=null;}deleteOutput();clearCaptureTracking();statusView.setText(m);lightButton.setEnabled(false);finishButton.setEnabled(false);setResult(RESULT_CANCELED);handler.postDelayed(this::finish,1400);}
    private void deleteOutput(){if(outputFile!=null&&outputFile.exists())try{outputFile.delete();}catch(Exception ignored){}}
    private void clearCaptureTracking(){getSharedPreferences(CAPTURE_PREFS,MODE_PRIVATE).edit().remove(CAPTURE_URI_KEY).remove(CAPTURE_READY_KEY).remove(AUDIO_URI_KEY).remove(AUDIO_READY_KEY).apply();}
    private String safeMessage(Throwable e){String v=e==null?"":e.getMessage();return v==null||v.trim().isEmpty()?e==null?"Unknown error":e.getClass().getSimpleName():v;}
    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    @Override public void onBackPressed(){cancelCapture();}
    @Override protected void onDestroy(){turnTorchOff();handler.removeCallbacksAndMessages(null);if(!finalized&&activeRecording!=null){try{activeRecording.close();}catch(Exception ignored){}activeRecording=null;}super.onDestroy();}
}
