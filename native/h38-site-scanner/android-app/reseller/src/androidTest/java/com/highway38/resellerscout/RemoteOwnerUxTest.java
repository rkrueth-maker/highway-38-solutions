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
import androidx.test.uiautomator.Direction;
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
        device.wait(Until.hasObject(By.pkg(target.getPackageName()).depth(0)), 12_000);
        waitForText("Reseller Scout", 12_000);
    }

    @Test
    public void ownerUxAcceptancePass() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        verifyFridgeSearchBoundary();
        verifyLocalSalesInAuctions();
        verifyDollarGeneralHuntBoundary();
        verifyNavigationSurvivesRoundTrip();
        Log.i(TAG, "REAL DEVICE FARM PASS: scripted owner UX boundaries completed. Dynamic inventory/photo diagnostics still require result review.");
    }

    private void signInAsOwnerIfNeeded() {
        if (!hasText("Sign in")) {
            waitForText("Discover", 15_000);
            return;
        }
        String email = requiredArg("SCOUT_EMAIL");
        String password = requiredArg("SCOUT_PASSWORD");
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        assertTrue("Login must expose email and password fields", fields.size() >= 2);
        fields.get(0).setText(email);
        fields.get(1).setText(password);
        clickText("Sign in");
        assertTrue("Owner login must reach Discover", waitForText("Discover", 20_000));
    }

    private void assertBottomNavigation() {
        assertTrue("Discover nav missing", hasText("Discover"));
        assertTrue("Hunt nav missing", hasText("Hunt"));
        assertTrue("Scan nav missing", hasText("Scan"));
        assertTrue("Auctions nav missing", hasText("Auctions"));
        assertTrue("Track nav missing", hasText("Track"));
    }

    private void verifyFridgeSearchBoundary() throws Exception {
        clickText("Discover");
        assertTrue("Discover page did not render", waitForText("Find anything worth reselling", 10_000));
        UiObject2 search = findFirstEditText();
        assertNotNull("Discover search input not reachable", search);
        search.setText("fridge");
        UiObject2 searchButton = device.findObject(By.text("Search"));
        assertNotNull("Discover Search button missing", searchButton);
        searchButton.click();
        device.waitForIdle(2_000);
        Thread.sleep(NETWORK);
        assertFalse("Known stale lawn-care Facebook card resurfaced after fridge search", hasTextContains("Lawn care equipment"));
        UiObject2 retained = findFirstEditText();
        assertNotNull("Discover search input disappeared", retained);
        assertTrue("Typed fridge query was not retained", "fridge".equalsIgnoreCase(String.valueOf(retained.getText())));
        Log.i(TAG, "FRIDGE BOUNDARY: query retained; stale known lawn-care card absent. Live inventory relevance remains network-dependent.");
    }

    private void verifyLocalSalesInAuctions() throws Exception {
        clickText("Auctions");
        assertTrue("Auctions page did not render", waitForText("Auctions", 10_000));
        boolean found = waitForTextContains("Local sales", 8_000) || hasTextContains("Craigslist");
        for (int i = 0; i < 3 && !found; i++) {
            device.swipe(device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.78), device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.32), 18);
            Thread.sleep(700);
            found = hasTextContains("Local sales") || hasTextContains("Craigslist");
        }
        assertTrue("Local sales & Craigslist section is not reachable from Auctions", found);
        Log.i(TAG, "AUCTIONS BOUNDARY: Local sales/Craigslist surface is reachable on device.");
    }

    private void verifyDollarGeneralHuntBoundary() throws Exception {
        clickText("Hunt");
        assertTrue("Hunt page did not render", waitForText("Hunt", 12_000));
        Thread.sleep(12_000);
        boolean dgSeen = hasTextContains("Dollar General");
        for (int i = 0; i < 6 && !dgSeen; i++) {
            device.swipe(device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.80), device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.30), 20);
            Thread.sleep(800);
            dgSeen = hasTextContains("Dollar General");
        }
        assertTrue("Dollar General Hunt surface is not reachable", dgSeen);

        boolean knownUpcVisible = hasTextContains("840797136519");
        boolean knownWrongTitleVisible = hasTextContains("Beech-Nut Veggies Stage 2 Baby Food");
        assertFalse("Known DG mismatch returned: UPC 840797136519 paired with the prior wrong baby-food description", knownUpcVisible && knownWrongTitleVisible);

        int imageNodes = device.findObjects(By.clazz("android.widget.Image")).size();
        Log.i(TAG, "DG BOUNDARY: Dollar General reachable; visible accessibility image nodes=" + imageNodes + ". Photo completeness is reviewed from Test Lab video/screenshots and is not fabricated as a hard assertion when live inventory varies.");
    }

    private void verifyNavigationSurvivesRoundTrip() {
        clickText("Scan");
        assertTrue("Scan nav failed", waitForText("Scan", SHORT));
        clickText("Track");
        assertTrue("Track nav failed", waitForText("Track", SHORT));
        clickText("Discover");
        assertTrue("Discover nav failed after round trip", waitForText("Find anything worth reselling", SHORT));
    }

    private UiObject2 findFirstEditText() {
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        return fields.isEmpty() ? null : fields.get(0);
    }

    private String requiredArg(String key) {
        String value = args.getString(key, "").trim();
        assertFalse(key + " instrumentation argument is required for an as-owner run", value.isEmpty());
        return value;
    }

    private void clickText(String text) {
        UiObject2 object = device.wait(Until.findObject(By.text(text)), SHORT);
        assertNotNull("Could not find tappable text: " + text, object);
        object.click();
        device.waitForIdle(1_500);
    }

    private boolean waitForText(String text, long timeout) {
        return device.wait(Until.hasObject(By.text(text)), timeout);
    }

    private boolean waitForTextContains(String text, long timeout) {
        return device.wait(Until.hasObject(By.textContains(text)), timeout);
    }

    private boolean hasText(String text) {
        return device.hasObject(By.text(text));
    }

    private boolean hasTextContains(String text) {
        return device.hasObject(By.textContains(text));
    }
}
