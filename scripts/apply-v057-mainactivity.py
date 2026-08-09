from pathlib import Path

path = Path('native/h38-site-scanner/android-app/app/src/main/java/com/highway38/sitescanner/MainActivity.java')
text = path.read_text()

text = text.replace('import android.content.ContentValues;\n', '')
text = text.replace('import android.provider.MediaStore;\n', '')
text = text.replace('H38SiteScannerAndroid/0.5.6', 'H38SiteScannerAndroid/0.5.7')

old_permission = '''                        if (checkSelfPermission(Manifest.permission.CAMERA)\n                                != PackageManager.PERMISSION_GRANTED) {\n                            pendingWalkthroughPermissionResume = true;\n                            requestPermissions(\n                                    new String[]{Manifest.permission.CAMERA},\n                                    REQUEST_WALKTHROUGH_CAMERA_PERMISSION\n                            );\n                            return true;\n                        }\n                        return launchWalkthroughVideoCapture();'''
new_permission = '''                        List<String> needed = new ArrayList<>();\n                        if (checkSelfPermission(Manifest.permission.CAMERA)\n                                != PackageManager.PERMISSION_GRANTED) {\n                            needed.add(Manifest.permission.CAMERA);\n                        }\n                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)\n                                != PackageManager.PERMISSION_GRANTED) {\n                            needed.add(Manifest.permission.RECORD_AUDIO);\n                        }\n                        if (!needed.isEmpty()) {\n                            pendingWalkthroughPermissionResume = true;\n                            requestPermissions(\n                                    needed.toArray(new String[0]),\n                                    REQUEST_WALKTHROUGH_CAMERA_PERMISSION\n                            );\n                            return true;\n                        }\n                        return launchWalkthroughVideoCapture();'''
if old_permission not in text:
    raise SystemExit('walkthrough permission block not found')
text = text.replace(old_permission, new_permission, 1)

start = text.index('    private boolean launchWalkthroughVideoCapture() {')
end = text.index('    private void failPendingFileCapture', start)
new_launch = '''    private boolean launchWalkthroughVideoCapture() {\n        try {\n            Intent captureIntent = new Intent(this, WalkthroughCaptureActivity.class);\n            pendingCaptureUri = null;\n            pendingFileCapture = true;\n            pendingWalkthroughPermissionResume = false;\n            startActivityForResult(captureIntent, REQUEST_FILE_CHOOSER);\n            return true;\n        } catch (Exception error) {\n            failPendingFileCapture("Video capture is unavailable.");\n            return false;\n        }\n    }\n\n'''
text = text[:start] + new_launch + text[end:]

create_start = text.find('    private Uri createWalkthroughVideoUri() {')
if create_start >= 0:
    create_end = text.index('    private void persistCaptureTracking', create_start)
    text = text[:create_start] + text[create_end:]

old_result = '''        if (requestCode == REQUEST_WALKTHROUGH_CAMERA_PERMISSION) {\n            boolean granted = grantResults.length > 0\n                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;\n            if (granted && pendingWalkthroughPermissionResume && pendingFileCallback != null) {\n                launchWalkthroughVideoCapture();\n            } else {\n                failPendingFileCapture("Camera permission is required to record the walkthrough.");\n            }\n            return;\n        }'''
new_result = '''        if (requestCode == REQUEST_WALKTHROUGH_CAMERA_PERMISSION) {\n            boolean granted = grantResults.length > 0;\n            for (int result : grantResults) {\n                granted &= result == PackageManager.PERMISSION_GRANTED;\n            }\n            if (granted && pendingWalkthroughPermissionResume && pendingFileCallback != null) {\n                launchWalkthroughVideoCapture();\n            } else {\n                failPendingFileCapture(\n                        "Camera and microphone permissions are required to record the walkthrough."\n                );\n            }\n            return;\n        }'''
if old_result not in text:
    raise SystemExit('walkthrough permission result block not found')
text = text.replace(old_result, new_result, 1)

for retired in ('MediaStore.ACTION_VIDEO_CAPTURE', 'MediaStore.EXTRA_OUTPUT', 'createWalkthroughVideoUri()'):
    if retired in text:
        raise SystemExit(f'retired external camera path remains: {retired}')
for required in ('WalkthroughCaptureActivity.class', 'Manifest.permission.RECORD_AUDIO', 'H38SiteScannerAndroid/0.5.7'):
    if required not in text:
        raise SystemExit(f'missing native recorder contract: {required}')

path.write_text(text)
print('PASS — MainActivity uses the in-app H38 camera + microphone recorder')
