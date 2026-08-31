package com.highway38.resellerscout;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;

@RunWith(AndroidJUnit4.class)
public class RemoteOwnerUxTest {
    private static final String TAG = "H38RemoteUx";
    private static final long SHORT = 5_000;
    private static final long NETWORK = 25_000;
    private UiDevice device;
    private Bundle args;

    @Before
    public void launchOwnerApp() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        args = InstrumentationRegistry.getArguments();
        device.pressHome();
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = target.getPackageManager().getLaunchIntentForPackage(target.getPackageName());
        assertNotNull("Owner app launch intent must exist", intent);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        target.startActivity(intent);
        assertTrue("Owner package did not become visible", device.wait(Until.hasObject(By.pkg(target.getPackageName()).depth(0)), 12_000));
        assertTrue("Reseller Scout shell did not render", waitForLabel("Reseller Scout", 12_000));
    }

    @Test
    public void knownDefect01FacebookFridgeSearch() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 01 START: Facebook fridge search");
        verifyFridgeSearchBoundary();
        Log.i(TAG, "KNOWN DEFECT 01 PASS: Facebook fridge search");
    }

    @Test
    public void knownDefect02LocalSalesInAuctions() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 02 START: Local sales in Auctions");
        verifyLocalSalesInAuctions();
        Log.i(TAG, "KNOWN DEFECT 02 PASS: Local sales in Auctions");
    }

    @Test
    public void knownDefect03DollarGeneralIdentityAndPhotos() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 03 START: Dollar General identity/photos");
        verifyDollarGeneralHuntBoundary();
        Log.i(TAG, "KNOWN DEFECT 03 PASS: Dollar General identity/photos");
    }

    @Test
    public void knownDefect04NavigationRoundTrip() {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 04 START: Navigation round trip");
        verifyNavigationSurvivesRoundTrip();
        Log.i(TAG, "KNOWN DEFECT 04 PASS: Navigation round trip");
    }

    private void signInAsOwnerIfNeeded() {
        if (!hasLabel("Sign in")) {
            assertTrue("Authenticated owner shell did not reach Discover", waitForLabel("Discover", 15_000));
            return;
        }
        String email = requiredArg("SCOUT_EMAIL");
        String password = requiredArg("SCOUT_PASSWORD");
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        assertTrue("Login must expose email and password fields", fields.size() >= 2);
        fields.get(0).setText(email);
        fields.get(1).setText(password);
        clickLabel("Sign in");
        assertTrue("Owner login must reach Discover", waitForLabel("Discover", 20_000));
    }

    private void assertBottomNavigation() {
        assertTrue("Discover nav missing", hasLabel("Discover"));
        assertTrue("Hunt nav missing", hasLabel("Hunt"));
        assertTrue("Scan nav missing", hasLabel("Scan"));
        assertTrue("Auctions nav missing", hasLabel("Auctions"));
        assertTrue("Track nav missing", hasLabel("Track"));
    }

    private void verifyFridgeSearchBoundary() throws Exception {
        clickLabel("Discover");
        assertTrue("Discover page did not render", waitForLabel("Find anything worth reselling", 10_000));
        UiObject2 search = findFirstEditText();
        assertNotNull("Discover search input not reachable", search);
        search.setText("fridge");
        UiObject2 searchButton = findLabel("Search");
        assertNotNull("Discover Search button missing", searchButton);
        searchButton.click();
        device.waitForIdle(2_000);
        Thread.sleep(NETWORK);
        assertFalse("Known stale lawn-care Facebook card resurfaced after fridge search", hasLabelContains("Lawn care equipment"));
        UiObject2 retained = findFirstEditText();
        assertNotNull("Discover search input disappeared", retained);
        assertTrue("Typed fridge query was not retained", "fridge".equalsIgnoreCase(String.valueOf(retained.getText())));

        boolean relevantCard = hasNonInputLabelContains("refrigerator") || hasNonInputLabelContains("fridge");
        boolean truthfulEmpty = hasLabelContains("No public Marketplace cards were found") || hasLabelContains("Local Facebook inventory remains unknown");
        assertTrue("Fridge search produced neither a fridge/refrigerator result nor the truthful public-index empty state", relevantCard || truthfulEmpty);
        Log.i(TAG, "FRIDGE BOUNDARY: explicit query honored; stale unrelated card absent; result or truthful empty state visible.");
    }

    private void verifyLocalSalesInAuctions() throws Exception {
        clickLabel("Auctions");
        assertTrue("Auctions page did not render", waitForLabel("Auctions", 10_000));
        boolean found = waitForLabelContains("Local sales", 8_000) || hasLabelContains("Craigslist");
        for (int i = 0; i < 3 && !found; i++) {
            device.swipe(device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.78), device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.32), 18);
            Thread.sleep(700);
            found = hasLabelContains("Local sales") || hasLabelContains("Craigslist");
        }
        assertTrue("Local sales & Craigslist section is not reachable from Auctions", found);
        assertFalse("Known non-sale Craigslist cattle listing resurfaced", hasLabelContains("Red angus bull"));
        assertFalse("Known non-sale Craigslist trolling-motor listing resurfaced", hasLabelContains("Mercury trolling motor"));
        Log.i(TAG, "AUCTIONS BOUNDARY: Local sales/Craigslist surface is reachable and known non-sale classifieds are absent.");
    }

    private void verifyDollarGeneralHuntBoundary() throws Exception {
        clickLabel("Hunt");
        assertTrue("Hunt page did not render", waitForLabel("Hunt", 12_000));
        Thread.sleep(12_000);
        boolean dgSeen = hasLabelContains("Dollar General");
        for (int i = 0; i < 6 && !dgSeen; i++) {
            device.swipe(device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.80), device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.30), 20);
            Thread.sleep(800);
            dgSeen = hasLabelContains("Dollar General");
        }
        assertTrue("Dollar General Hunt surface is not reachable", dgSeen);

        boolean knownUpcVisible = hasLabelContains("840797136519");
        boolean knownWrongTitleVisible = hasLabelContains("Beech-Nut Veggies Stage 2 Baby Food");
        assertFalse("Known DG mismatch returned: UPC 840797136519 paired with the prior wrong baby-food description", knownUpcVisible && knownWrongTitleVisible);

        int imageNodes = device.findObjects(By.clazz("android.widget.Image")).size();
        assertTrue("Dollar General Hunt rendered no accessible product images on the physical device", imageNodes > 0);
        Log.i(TAG, "DG BOUNDARY: Dollar General reachable; known identity mismatch absent; accessible image nodes=" + imageNodes + ".");
    }

    private void verifyNavigationSurvivesRoundTrip() {
        clickLabel("Scan");
        assertTrue("Scan nav failed", waitForLabel("Scan", SHORT));
        clickLabel("Track");
        assertTrue("Track nav failed", waitForLabel("Track", SHORT));
        clickLabel("Discover");
        assertTrue("Discover nav failed after round trip", waitForLabel("Find anything worth reselling", SHORT));
    }

    private UiObject2 findFirstEditText() {
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        return fields.isEmpty() ? null : fields.get(0);
    }

    private UiObject2 findLabel(String text) {
        UiObject2 exactText = device.findObject(By.text(text));
        if (exactText != null) return exactText;
        UiObject2 containsText = device.findObject(By.textContains(text));
        if (containsText != null) return containsText;
        UiObject2 exactDesc = device.findObject(By.desc(text));
        if (exactDesc != null) return exactDesc;
        return device.findObject(By.descContains(text));
    }

    private boolean hasNonInputLabelContains(String text) {
        for (UiObject2 object : device.findObjects(By.textContains(text))) {
            if (!"android.widget.EditText".equals(object.getClassName())) return true;
        }
        for (UiObject2 object : device.findObjects(By.descContains(text))) {
            if (!"android.widget.EditText".equals(object.getClassName())) return true;
        }
        return false;
    }

    private String requiredArg(String key) {
        String value = args.getString(key, "").trim();
        assertFalse(key + " instrumentation argument is required for an as-owner run", value.isEmpty());
        return value;
    }

    private void clickLabel(String text) {
        UiObject2 object = device.wait(Until.findObject(By.text(text)), 1_000);
        if (object == null) object = device.wait(Until.findObject(By.textContains(text)), 1_500);
        if (object == null) object = device.wait(Until.findObject(By.desc(text)), 1_000);
        if (object == null) object = device.wait(Until.findObject(By.descContains(text)), 1_500);
        assertNotNull("Could not find tappable label: " + text, object);
        UiObject2 tappable = object;
        while (tappable != null && !tappable.isClickable() && tappable.getParent() != null) tappable = tappable.getParent();
        (tappable != null ? tappable : object).click();
        device.waitForIdle(1_500);
    }

    private boolean waitForLabel(String text, long timeout) {
        long end = System.currentTimeMillis() + timeout;
        do {
            if (hasLabel(text)) return true;
            device.waitForIdle(300);
        } while (System.currentTimeMillis() < end);
        return false;
    }

    private boolean waitForLabelContains(String text, long timeout) {
        long end = System.currentTimeMillis() + timeout;
        do {
            if (hasLabelContains(text)) return true;
            device.waitForIdle(300);
        } while (System.currentTimeMillis() < end);
        return false;
    }

    private boolean hasLabel(String text) {
        return device.hasObject(By.text(text)) || device.hasObject(By.textContains(text)) || device.hasObject(By.desc(text)) || device.hasObject(By.descContains(text));
    }

    private boolean hasLabelContains(String text) {
        return device.hasObject(By.textContains(text)) || device.hasObject(By.descContains(text));
    }
}
