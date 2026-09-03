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
 * The WebView keeps the existing Supabase login/authorization implementation.
 * This class only collects credentials with native Android EditTexts, copies them
 * into the existing login form, and submits that form. It never stores a password
 * and never bypasses the Scout owner allow-list.
 */
final class NativeLoginOverlay {
    private static final String TAG = "h38-scout-native-login-v322";

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

        Controller(Activity activity, ViewGroup host, WebView webView) {
            this.activity = activity;
            this.host = host;
            this.webView = webView;
        }

        void install() {
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

            TextView note = text("Owner authentication stays on the existing H38 Scout account. These fields are native Android controls so the phone keyboard cannot be blocked by the WebView.", 14, Color.rgb(82, 97, 109), Typeface.NORMAL);
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
            signIn.setOnClickListener(v -> submit());
            LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
            buttonParams.topMargin = dp(8);
            card.addView(signIn, buttonParams);

            password.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submit();
                    return true;
                }
                return false;
            });

            status = text("", 13, Color.rgb(150, 55, 45), Typeface.NORMAL);
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
            pollAuthState(150);
        }

        private void submit() {
            String e = email.getText() == null ? "" : email.getText().toString().trim();
            String p = password.getText() == null ? "" : password.getText().toString();
            if (e.isEmpty() || p.isEmpty()) {
                status.setText("Enter your owner email and password.");
                return;
            }
            pendingSignIn = true;
            signIn.setEnabled(false);
            status.setTextColor(Color.rgb(82, 97, 109));
            status.setText("Signing in…");
            String js = "(function(){"
                    + "var f=document.getElementById('loginForm');if(!f)return 'FORM_MISSING';"
                    + "var e=f.querySelector('input[name=\"email\"]'),p=f.querySelector('input[name=\"password\"]');if(!e||!p)return 'FIELDS_MISSING';"
                    + "e.value=" + JSONObject.quote(e) + ";p.value=" + JSONObject.quote(p) + ";"
                    + "e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));"
                    + "p.dispatchEvent(new Event('input',{bubbles:true}));p.dispatchEvent(new Event('change',{bubbles:true}));"
                    + "if(f.requestSubmit)f.requestSubmit();else{var b=f.querySelector('button[type=\"submit\"]');if(b)b.click();}"
                    + "return 'SUBMITTED';})()";
            webView.evaluateJavascript(js, value -> {
                if (!"\"SUBMITTED\"".equals(value)) {
                    pendingSignIn = false;
                    signIn.setEnabled(true);
                    status.setTextColor(Color.rgb(150, 55, 45));
                    status.setText("Scout sign-in form is not ready. Close and reopen the app.");
                }
                pollAuthState(250);
            });
        }

        private void pollAuthState(long delayMs) {
            handler.postDelayed(() -> {
                if (activity.isFinishing() || activity.isDestroyed() || overlay.getParent() == null) return;
                String js = "(function(){"
                        + "var l=document.getElementById('loginView'),a=document.getElementById('appView'),m=document.getElementById('loginMessage');"
                        + "if(!l||!a)return JSON.stringify({state:'loading',message:''});"
                        + "return JSON.stringify({state:(!a.classList.contains('hidden')?'app':(!l.classList.contains('hidden')?'login':'loading')),message:(m?String(m.textContent||'').trim():'')});"
                        + "})()";
                webView.evaluateJavascript(js, this::handleAuthState);
            }, delayMs);
        }

        private void handleAuthState(String raw) {
            if (activity.isFinishing() || activity.isDestroyed() || overlay.getParent() == null) return;
            String state = "loading";
            String message = "";
            try {
                Object decoded = new JSONTokener(raw == null ? "null" : raw).nextValue();
                String json = decoded instanceof String ? (String) decoded : String.valueOf(decoded);
                JSONObject obj = new JSONObject(json);
                state = obj.optString("state", "loading");
                message = obj.optString("message", "");
            } catch (Exception ignored) {}

            if ("app".equals(state)) {
                pendingSignIn = false;
                password.setText("");
                signIn.setEnabled(true);
                status.setText("");
                overlay.setVisibility(View.GONE);
                pollAuthState(900);
                return;
            }

            if ("login".equals(state)) {
                overlay.setVisibility(View.VISIBLE);
                if (pendingSignIn && !message.isEmpty() && !message.toLowerCase().contains("signing in")) {
                    pendingSignIn = false;
                    signIn.setEnabled(true);
                    status.setTextColor(Color.rgb(150, 55, 45));
                    status.setText(message);
                } else if (!pendingSignIn && status.getText().length() == 0) {
                    status.setText("");
                }
                pollAuthState(pendingSignIn ? 300 : 700);
                return;
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
