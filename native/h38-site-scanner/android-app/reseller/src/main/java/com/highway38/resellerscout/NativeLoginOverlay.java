package com.highway38.resellerscout;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Native owner-login surface for the Android Scout shell.
 *
 * Credentials are collected by native Android EditTexts and handed directly to the
 * packaged Scout auth bridge. Supabase authentication and the owner allow-list remain
 * the authority. The password is never persisted by the Android shell.
 */
final class NativeLoginOverlay {
    private static final String TAG = "h38-scout-native-login-v323";

    private NativeLoginOverlay() {}

    static void attach(Activity activity) {
        if (!(activity instanceof MainActivity) || activity.isFinishing() || activity.isDestroyed()) return;
        activity.runOnUiThread(() -> attachOnUi(activity));
    }

    private static void attachOnUi(Activity activity) {
        View content = activity.findViewById(android.R.id.content);
        if (!(content instanceof ViewGroup)) return;
        ViewGroup host = (ViewGroup) content;
        if (host.findViewWithTag(TAG) != null) return;
        WebView webView = findWebView(host);
        if (webView == null) {
            host.postDelayed(() -> attachOnUi(activity), 200);
            return;
        }
        new Controller(activity, host, webView).install();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (!(view instanceof ViewGroup)) return null;
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            WebView found = findWebView(group.getChildAt(i));
            if (found != null) return found;
        }
        return null;
    }

    private static final class Controller {
        private final Activity activity;
        private final ViewGroup host;
        private final WebView webView;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private LinearLayout overlay;
        private EditText email;
        private EditText password;
        private Button signIn;
        private TextView status;
        private boolean pendingSignIn;
        private boolean bridgeReady;
        private long installedAt;

        Controller(Activity activity, ViewGroup host, WebView webView) {
            this.activity = activity;
            this.host = host;
            this.webView = webView;
        }

        void install() {
            installedAt = System.currentTimeMillis();
            overlay = new LinearLayout(activity);
            overlay.setTag(TAG);
            overlay.setOrientation(LinearLayout.VERTICAL);
            overlay.setGravity(Gravity.CENTER);
            overlay.setPadding(dp(22), dp(28), dp(22), dp(28));
            overlay.setBackgroundColor(Color.rgb(243, 246, 248));
            overlay.setClickable(true);
            overlay.setFocusable(true);
            overlay.setVisibility(View.GONE);

            LinearLayout card = new LinearLayout(activity);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(24), dp(24), dp(24), dp(24));
            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(Color.WHITE);
            cardBg.setCornerRadius(dp(18));
            cardBg.setStroke(dp(1), Color.rgb(218, 226, 232));
            card.setBackground(cardBg);

            TextView eyebrow = text("PRIVATE OWNER APP", 12, Color.rgb(72, 99, 117), Typeface.BOLD);
            card.addView(eyebrow, matchWrap());

            TextView title = text("Sign in to Reseller Scout", 24, Color.rgb(13, 42, 62), Typeface.BOLD);
            LinearLayout.LayoutParams titleParams = matchWrap();
            titleParams.topMargin = dp(8);
            card.addView(title, titleParams);

            TextView note = text("Owner authentication stays on the existing H38 Scout account. Native Android handles typing; Scout's packaged auth bridge handles Supabase sign-in.", 14, Color.rgb(82, 97, 109), Typeface.NORMAL);
            LinearLayout.LayoutParams noteParams = matchWrap();
            noteParams.topMargin = dp(8);
            noteParams.bottomMargin = dp(18);
            card.addView(note, noteParams);

            email = new EditText(activity);
            email.setId(View.generateViewId());
            email.setHint("Email");
            email.setSingleLine(true);
            email.setTextSize(16);
            email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
            email.setImeOptions(EditorInfo.IME_ACTION_NEXT);
            email.setAutofillHints(View.AUTOFILL_HINT_EMAIL_ADDRESS, View.AUTOFILL_HINT_USERNAME);
            email.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
            card.addView(email, fieldParams());

            password = new EditText(activity);
            password.setId(View.generateViewId());
            password.setHint("Password");
            password.setSingleLine(true);
            password.setTextSize(16);
            password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            password.setImeOptions(EditorInfo.IME_ACTION_DONE);
            password.setAutofillHints(View.AUTOFILL_HINT_PASSWORD);
            password.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
            email.setNextFocusForwardId(password.getId());
            card.addView(password, fieldParams());

            signIn = new Button(activity);
            signIn.setText("Sign in");
            signIn.setTextSize(16);
            signIn.setAllCaps(false);
            signIn.setEnabled(false);
            signIn.setOnClickListener(v -> submit());
            LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
            buttonParams.topMargin = dp(8);
            card.addView(signIn, buttonParams);

            password.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == EditorInfo.IME_ACTION_DONE && bridgeReady && !pendingSignIn) {
                    submit();
                    return true;
                }
                return false;
            });

            status = text("Preparing secure sign-in…", 13, Color.rgb(82, 97, 109), Typeface.NORMAL);
            LinearLayout.LayoutParams statusParams = matchWrap();
            statusParams.topMargin = dp(10);
            card.addView(status, statusParams);

            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            cardParams.width = Math.min(dp(440), Math.max(dp(280), activity.getResources().getDisplayMetrics().widthPixels - dp(44)));
            overlay.addView(card, cardParams);

            if (host instanceof FrameLayout) {
                host.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            } else {
                host.addView(overlay, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            pollAuthState(120);
        }

        private void submit() {
            if (!bridgeReady || pendingSignIn) return;
            String e = email.getText() == null ? "" : email.getText().toString().trim();
            String p = password.getText() == null ? "" : password.getText().toString();
            if (e.isEmpty() || p.isEmpty()) {
                status.setTextColor(Color.rgb(150, 55, 45));
                status.setText("Enter your owner email and password.");
                return;
            }
            pendingSignIn = true;
            signIn.setEnabled(false);
            status.setTextColor(Color.rgb(82, 97, 109));
            status.setText("Signing in…");
            String js = "(function(){"
                    + "if(typeof window.H38NativeOwnerSignIn!=='function')return 'AUTH_BRIDGE_MISSING';"
                    + "try{window.H38NativeOwnerSignIn(" + JSONObject.quote(e) + "," + JSONObject.quote(p) + ");return 'SUBMITTED';}"
                    + "catch(err){return 'AUTH_BRIDGE_ERROR:'+String(err&&err.message||err);}"
                    + "})()";
            webView.evaluateJavascript(js, value -> {
                if (!"\"SUBMITTED\"".equals(value)) {
                    pendingSignIn = false;
                    password.setText("");
                    signIn.setEnabled(bridgeReady);
                    status.setTextColor(Color.rgb(150, 55, 45));
                    status.setText("Secure sign-in could not start. Reopen Scout and try again.");
                }
                pollAuthState(180);
            });
        }

        private void pollAuthState(long delayMs) {
            handler.postDelayed(() -> {
                if (activity.isFinishing() || activity.isDestroyed() || overlay.getParent() == null) return;
                String js = "(function(){"
                        + "var l=document.getElementById('loginView'),a=document.getElementById('appView'),m=document.getElementById('loginMessage'),s=window.H38NativeOwnerAuthState||{};"
                        + "if(!l||!a)return JSON.stringify({state:'loading',ready:false,busy:false,error:'',result:'STARTING',message:''});"
                        + "return JSON.stringify({state:(!a.classList.contains('hidden')?'app':(!l.classList.contains('hidden')?'login':'loading')),ready:(typeof window.H38NativeOwnerSignIn==='function'&&s.ready===true),busy:s.busy===true,error:String(s.error||''),result:String(s.result||''),message:(m?String(m.textContent||'').trim():'')});"
                        + "})()";
                webView.evaluateJavascript(js, this::handleAuthState);
            }, delayMs);
        }

        private void handleAuthState(String raw) {
            if (activity.isFinishing() || activity.isDestroyed() || overlay.getParent() == null) return;
            String state = "loading";
            String message = "";
            String bridgeError = "";
            String result = "STARTING";
            boolean ready = false;
            boolean busy = false;
            try {
                Object decoded = new JSONTokener(raw == null ? "null" : raw).nextValue();
                String json = decoded instanceof String ? (String) decoded : String.valueOf(decoded);
                JSONObject obj = new JSONObject(json);
                state = obj.optString("state", "loading");
                ready = obj.optBoolean("ready", false);
                busy = obj.optBoolean("busy", false);
                bridgeError = obj.optString("error", "");
                result = obj.optString("result", "STARTING");
                message = obj.optString("message", "");
            } catch (Exception ignored) {}
            bridgeReady = ready;

            if ("app".equals(state) || "PASS".equals(result)) {
                pendingSignIn = false;
                password.setText("");
                signIn.setEnabled(false);
                status.setText("");
                overlay.setVisibility(View.GONE);
                pollAuthState(900);
                return;
            }

            if ("login".equals(state)) {
                overlay.setVisibility(View.VISIBLE);
                if (busy) {
                    pendingSignIn = true;
                    signIn.setEnabled(false);
                    status.setTextColor(Color.rgb(82, 97, 109));
                    status.setText("Signing in…");
                    pollAuthState(220);
                    return;
                }
                if (pendingSignIn) {
                    pendingSignIn = false;
                    password.setText("");
                }
                if (!bridgeError.isEmpty()) {
                    status.setTextColor(Color.rgb(150, 55, 45));
                    status.setText(bridgeError);
                } else if (!message.isEmpty() && !message.toLowerCase().contains("signing in")) {
                    status.setTextColor(Color.rgb(150, 55, 45));
                    status.setText(message);
                } else if (!bridgeReady) {
                    status.setTextColor(Color.rgb(82, 97, 109));
                    if (System.currentTimeMillis() - installedAt > 8000) {
                        status.setTextColor(Color.rgb(150, 55, 45));
                        status.setText("Secure sign-in runtime did not finish loading. Check the connection and reopen Scout.");
                    } else {
                        status.setText("Preparing secure sign-in…");
                    }
                } else if (status.getText().toString().contains("Preparing secure") || status.getText().toString().contains("did not finish")) {
                    status.setText("");
                }
                signIn.setEnabled(bridgeReady && !pendingSignIn);
                pollAuthState(bridgeReady ? 650 : 250);
                return;
            }

            signIn.setEnabled(false);
            if (System.currentTimeMillis() - installedAt > 8000) {
                status.setTextColor(Color.rgb(150, 55, 45));
                status.setText("Scout sign-in page did not finish loading. Check the connection and reopen Scout.");
            }
            pollAuthState(250);
        }

        private TextView text(String value, int sp, int color, int style) {
            TextView view = new TextView(activity);
            view.setText(value);
            view.setTextSize(sp);
            view.setTextColor(color);
            view.setTypeface(Typeface.create(Typeface.DEFAULT, style));
            return view;
        }

        private LinearLayout.LayoutParams fieldParams() {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56));
            params.bottomMargin = dp(12);
            return params;
        }

        private LinearLayout.LayoutParams matchWrap() {
            return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        private int dp(int value) {
            return Math.round(value * activity.getResources().getDisplayMetrics().density);
        }
    }
}
