package com.highway38.sitescanner;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.nio.ByteBuffer;

final class WalkthroughAudioExtractor {
    private static final String CAPTURE_PREFS = "h38-walkthrough-capture";
    private static final String AUDIO_URI_KEY = "pending_audio_uri";
    private static final String AUDIO_READY_KEY = "audio_ready";
    private static final int MAX_CHUNK_BYTES = 256 * 1024;

    private WalkthroughAudioExtractor() {}

    static Uri prepare(Context context, File videoFile) {
        if (context == null || videoFile == null || !videoFile.exists() || videoFile.length() < 1L) return null;
        clear(context, true);
        MediaExtractor extractor = new MediaExtractor();
        MediaMuxer muxer = null;
        File audioFile = null;
        boolean started = false;
        try {
            extractor.setDataSource(videoFile.getAbsolutePath());
            int audioTrack = -1;
            MediaFormat audioFormat = null;
            for (int index = 0; index < extractor.getTrackCount(); index++) {
                MediaFormat format = extractor.getTrackFormat(index);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    audioTrack = index;
                    audioFormat = format;
                    break;
                }
            }
            if (audioTrack < 0 || audioFormat == null) return null;
            File dir = new File(context.getFilesDir(), "walkthroughs");
            if (!dir.exists() && !dir.mkdirs()) return null;
            audioFile = new File(dir, "h38-site-walkthrough-audio-" + System.currentTimeMillis() + ".m4a");
            muxer = new MediaMuxer(audioFile.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int muxerTrack = muxer.addTrack(audioFormat);
            muxer.start();
            started = true;
            extractor.selectTrack(audioTrack);
            extractor.seekTo(0L, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            int maxInput = audioFormat.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)
                    ? Math.max(64 * 1024, audioFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
                    : 256 * 1024;
            ByteBuffer buffer = ByteBuffer.allocateDirect(Math.min(Math.max(maxInput, 64 * 1024), 1024 * 1024));
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            while (true) {
                buffer.clear();
                int size = extractor.readSampleData(buffer, 0);
                if (size < 0) break;
                info.offset = 0;
                info.size = size;
                info.presentationTimeUs = Math.max(0L, extractor.getSampleTime());
                info.flags = extractor.getSampleFlags();
                muxer.writeSampleData(muxerTrack, buffer, info);
                if (!extractor.advance()) break;
            }
            muxer.stop();
            started = false;
            muxer.release();
            muxer = null;
            if (!audioFile.exists() || audioFile.length() < 1L) {
                if (audioFile.exists()) audioFile.delete();
                return null;
            }
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".files", audioFile);
            context.getSharedPreferences(CAPTURE_PREFS, Activity.MODE_PRIVATE).edit()
                    .putString(AUDIO_URI_KEY, uri.toString())
                    .putBoolean(AUDIO_READY_KEY, true)
                    .apply();
            return uri;
        } catch (Throwable error) {
            if (audioFile != null && audioFile.exists()) {
                try { audioFile.delete(); } catch (Throwable ignored) {}
            }
            clear(context, false);
            return null;
        } finally {
            try { extractor.release(); } catch (Throwable ignored) {}
            if (muxer != null) {
                if (started) try { muxer.stop(); } catch (Throwable ignored) {}
                try { muxer.release(); } catch (Throwable ignored) {}
            }
        }
    }

    static String info(Context context) {
        JSONObject result = new JSONObject();
        try {
            Uri uri = readyUri(context);
            if (uri == null) {
                result.put("ready", false);
                return result.toString();
            }
            long size = 0L;
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                if (stream != null) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = stream.read(buffer)) > 0) size += read;
                }
            }
            result.put("ready", size > 0L);
            result.put("size", Math.max(0L, size));
            result.put("mime", "audio/mp4");
            result.put("fileName", "walkthrough-audio.m4a");
        } catch (Throwable error) {
            try {
                result.put("ready", false);
                result.put("error", error.getMessage());
            } catch (Throwable ignored) {}
        }
        return result.toString();
    }

    static String readChunk(Context context, long offset, int requestedBytes) {
        if (offset < 0L) return "";
        int wanted = Math.max(1, Math.min(requestedBytes, MAX_CHUNK_BYTES));
        try {
            Uri uri = readyUri(context);
            if (uri == null) return "";
            try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
                if (stream == null) return "";
                long remaining = offset;
                while (remaining > 0L) {
                    long skipped = stream.skip(remaining);
                    if (skipped > 0L) { remaining -= skipped; continue; }
                    if (stream.read() < 0) return "";
                    remaining--;
                }
                byte[] bytes = new byte[wanted];
                int total = 0;
                while (total < wanted) {
                    int read = stream.read(bytes, total, wanted - total);
                    if (read < 0) break;
                    total += read;
                }
                return total > 0 ? Base64.encodeToString(bytes, 0, total, Base64.NO_WRAP) : "";
            }
        } catch (Throwable ignored) {
            return "";
        }
    }

    static void clear(Context context, boolean deleteFile) {
        SharedPreferences prefs = context.getSharedPreferences(CAPTURE_PREFS, Activity.MODE_PRIVATE);
        String value = prefs.getString(AUDIO_URI_KEY, "");
        if (deleteFile && value != null && !value.trim().isEmpty()) {
            try { context.getContentResolver().delete(Uri.parse(value), null, null); } catch (Throwable ignored) {}
        }
        prefs.edit().remove(AUDIO_URI_KEY).remove(AUDIO_READY_KEY).apply();
    }

    private static Uri readyUri(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(CAPTURE_PREFS, Activity.MODE_PRIVATE);
        if (!prefs.getBoolean(AUDIO_READY_KEY, false)) return null;
        String value = prefs.getString(AUDIO_URI_KEY, "");
        if (value == null || value.trim().isEmpty()) return null;
        return Uri.parse(value);
    }
}
