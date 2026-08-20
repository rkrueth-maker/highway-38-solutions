package com.highway38.resellerscout;

import android.app.Application;

/**
 * v0.1.27 keeps all reseller opportunity behavior in ResellerScoutPatchProvider.
 * The legacy application-level source scanner was intentionally removed because
 * it raced the current engine and recreated manual fallback/source-search cards.
 */
public final class ResellerScoutApplication extends Application {
    public static final String LEGACY_OPPORTUNITY_SCANNER_REMOVED_V1 =
            "LEGACY_OPPORTUNITY_SCANNER_REMOVED_V1";

    @Override public void onCreate() {
        super.onCreate();
    }
}
