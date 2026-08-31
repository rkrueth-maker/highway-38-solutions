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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
        boolean packageVisible = device.wait(Until.hasObject(By.pkg(target.getPackageName()).depth(0)), 12_000);
        if (!packageVisible) {
            Log.w(TAG, "Owner package cold-start was not visible after first launch; retrying once.");
            device.pressHome();
            device.waitForIdle(700);
            target.startActivity(intent);
            packageVisible = device.wait(Until.hasObject(By.pkg(target.getPackageName()).depth(0)), 12_000);
        }
        assertTrue("Owner package did not become visible after one cold-start retry", packageVisible);
        assertTrue("Reseller Scout shell did not render", waitForLabel("Reseller Scout", 12_000));
    }

    @Test
    public void knownDefect00ProfitFirstFacebookSourcing() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 00 START: profit-first Facebook sourcing");
        verifyProfitFirstFacebookBoundary();
        Log.i(TAG, "KNOWN DEFECT 00 PASS: profit-first Facebook sourcing");
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

    @Test
    public void knownDefect05GarageSaleDiscovery() throws Exception {
        signInAsOwnerIfNeeded();
        assertBottomNavigation();
        Log.i(TAG, "KNOWN DEFECT 05 START: garage and estate sale discovery");
        verifyGarageSaleBoundary();
        Log.i(TAG, "KNOWN DEFECT 05 PASS: garage and estate sale discovery");
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
        device.waitForIdle(750);
        UiObject2 signIn = findClickableLabel("Sign in");
        if (signIn == null) {
            UiObject2 label = findLabel("Sign in");
            assertNotNull("Sign in control disappeared after credentials were entered", label);
            UiObject2 tappable = clickableAncestor(label);
            signIn = tappable != null ? tappable : label;
        }
        signIn.click();
        device.waitForIdle(1_000);
        assertTrue("Owner login must reach Discover", waitForLabel("Discover", 20_000));
    }

    private void assertBottomNavigation() {
        assertTrue("Discover nav missing", hasLabel("Discover"));
        assertTrue("Hunt nav missing", hasLabel("Hunt"));
        assertTrue("Scan nav missing", hasLabel("Scan"));
        assertTrue("Auctions nav missing", hasLabel("Auctions"));
        assertTrue("Track nav missing", hasLabel("Track"));
    }

    private void verifyProfitFirstFacebookBoundary() throws Exception {
        if (!hasLabel("Find anything worth reselling")) clickLabel("Discover");
        assertTrue("Discover page did not render", waitForLabel("Find anything worth reselling", 10_000));
        UiObject2 search = findFirstEditText();
        assertNotNull("Discover search input not reachable", search);
        search.setText("");
        device.pressBack();
        device.waitForIdle(700);
        assertTrue("Profit-first Facebook status did not render", waitForLabelContains("PROFIT-FIRST FACEBOOK", 12_000));
        assertTrue("Profit-first Facebook did not advertise resale-lane sourcing", hasLabelContains("resale lanes"));
        UiObject2 hunt = findClickableLabel("Hunt profitable Facebook deals");
        assertNotNull("Profit-first Facebook hunt button missing", hunt);
        hunt.click();
        device.waitForIdle(1_000);
        long end = System.currentTimeMillis() + 70_000;
        boolean completedEvidence = false;
        do {
            String status = textContaining("PROFIT-FIRST FACEBOOK");
            if (status != null && (status.matches(".*\\b[1-9][0-9]* candidates\\b.*") || hasLabelContains("No public Marketplace cards were found") || hasLabelContains("Local Facebook inventory remains unknown") || hasLabelContains("No ranked local-listing matches yet"))) {
                completedEvidence = true;
                break;
            }
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertTrue("Profit-first Facebook hunt produced neither captured candidates nor a truthful empty state", completedEvidence);
        assertFalse("Profit-first Facebook hunt regressed to the known stale lawn-care card", hasLabelContains("Lawn care equipment"));
        Log.i(TAG, "FACEBOOK PROFIT BOUNDARY: profit-first resale lanes active; public candidates are comp-ranked or truthfully empty.");
    }

    private void verifyFridgeSearchBoundary() throws Exception {
        if (!hasLabel("Find anything worth reselling")) clickLabel("Discover");
        assertTrue("Discover page did not render", waitForLabel("Find anything worth reselling", 10_000));
        UiObject2 search = findFirstEditText();
        assertNotNull("Discover search input not reachable", search);
        search.setText("fridge");
        device.waitForIdle(500);
        device.pressBack();
        device.waitForIdle(1_000);
        assertTrue("Discover page was lost while dismissing the keyboard", hasLabel("Find anything worth reselling"));
        UiObject2 searchButton = findClickableLabel("Search");
        assertNotNull("Discover Search button missing after keyboard dismissal", searchButton);
        searchButton.click();
        device.waitForIdle(2_000);
        assertTrue("Discover search unexpectedly navigated away from Discover", waitForLabel("Find anything worth reselling", SHORT));
        Thread.sleep(NETWORK);
        assertTrue("Discover page was not retained after asynchronous search renders", hasLabel("Find anything worth reselling"));
        assertFalse("Known stale lawn-care Facebook card resurfaced after fridge search", hasLabelContains("Lawn care equipment"));
        UiObject2 retained = findEditTextWithText("fridge");
        assertNotNull("Typed fridge query was not retained in the Discover search field", retained);
        boolean relevantCard = hasNonInputLabelContains("refrigerator") || hasNonInputLabelContains("fridge");
        boolean truthfulEmpty = hasLabelContains("No public Marketplace cards were found") || hasLabelContains("Local Facebook inventory remains unknown") || hasLabelContains("No ranked local-listing matches yet");
        assertTrue("Fridge search produced neither a fridge/refrigerator result nor a truthful empty state", relevantCard || truthfulEmpty);
        Log.i(TAG, "FRIDGE BOUNDARY: explicit query retained on Discover; stale unrelated card absent; result or truthful empty state visible.");
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
        assertTrue("v3.0.14 DG quality gate did not render", waitForLabelContains("DG QUALITY:", 15_000));
        long end = System.currentTimeMillis() + 65_000;
        int named = 0;
        int images = 0;
        do {
            String quality = textContaining("DG QUALITY:");
            int[] counts = parseDgQuality(quality);
            named = counts[0];
            images = counts[1];
            if (named > 0 && images >= Math.min(3, named)) break;
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertTrue("Dollar General Hunt has no specifically named products after generic-title cleanup", named > 0);
        assertTrue("Dollar General image recovery did not reach the minimum exact-UPC coverage; named=" + named + " images=" + images, images >= Math.min(3, named));
        assertFalse("Generic Dollar General Inventory Checker title is still visible", hasLabelContains("Dollar General Inventory Checker"));
        assertFalse("Generic Inventory Checker title is still visible", hasLabel("Inventory Checker"));
        boolean knownUpcVisible = hasLabelContains("840797136519");
        boolean knownWrongTitleVisible = hasLabelContains("Beech-Nut Veggies Stage 2 Baby Food");
        assertFalse("Known DG mismatch returned: UPC 840797136519 paired with the prior wrong baby-food description", knownUpcVisible && knownWrongTitleVisible);
        assertFalse("Malformed HTML/anchor text leaked into a Dollar General product title", hasLabelContains("href=\"https://www.dollargeneral.com/p/"));
        Log.i(TAG, "DG BOUNDARY: named=" + named + " exact-UPC images=" + images + "; generic inventory-checker titles absent.");
    }

    private void verifyGarageSaleBoundary() throws Exception {
        if (!hasLabel("Find anything worth reselling")) clickLabel("Discover");
        assertTrue("Discover page did not render for garage-sale acceptance", waitForLabel("Find anything worth reselling", 10_000));
        boolean section = waitForLabelContains("Garage & estate sales", 12_000);
        for (int i = 0; i < 4 && !section; i++) {
            device.swipe(device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.82), device.getDisplayWidth() / 2, (int)(device.getDisplayHeight() * 0.28), 20);
            Thread.sleep(600);
            section = hasLabelContains("Garage & estate sales");
        }
        assertTrue("Garage & estate sales module is not present in the physical APK runtime", section);
        UiObject2 find = findClickableLabel("Find garage sales");
        assertNotNull("Find garage sales action is missing", find);
        find.click();
        device.waitForIdle(1_000);
        long end = System.currentTimeMillis() + 70_000;
        boolean saleLeadOrTruth = false;
        do {
            saleLeadOrTruth = hasLabel("GARAGE SALE") || hasLabel("YARD SALE") || hasLabel("RUMMAGE SALE") || hasLabel("MOVING SALE") || hasLabel("ESTATE SALE") || hasLabelContains("No sale leads loaded yet");
            if (saleLeadOrTruth) break;
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertTrue("Garage-sale acquisition returned neither a verified sale lead nor a truthful empty state", saleLeadOrTruth);
        assertFalse("Known non-sale Craigslist cattle listing leaked into garage-sale discovery", hasLabelContains("Red angus bull"));
        Log.i(TAG, "GARAGE BOUNDARY: sale-level module is packaged and acquisition produces verified sale intent or truthful empty state.");
    }

    private void verifyNavigationSurvivesRoundTrip() {
        clickLabel("Scan");
        assertTrue("Scan nav failed", waitForLabel("Scan", SHORT));
        clickLabel("Track");
        assertTrue("Track nav failed", waitForLabel("Track", SHORT));
        clickLabel("Discover");
        assertTrue("Discover nav failed after round trip", waitForLabel("Find anything worth reselling", SHORT));
    }

    private int[] parseDgQuality(String text) {
        if (text == null) return new int[]{0, 0};
        Matcher m = Pattern.compile("DG QUALITY:\\s*(\\d+) named\\s*[·|]\\s*(\\d+) images", Pattern.CASE_INSENSITIVE).matcher(text);
        if (!m.find()) return new int[]{0, 0};
        return new int[]{Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))};
    }

    private String textContaining(String needle) {
        UiObject2 x = device.findObject(By.textContains(needle));
        if (x != null && x.getText() != null) return x.getText();
        x = device.findObject(By.descContains(needle));
        return x == null ? null : x.getContentDescription();
    }

    private UiObject2 findFirstEditText() {
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        return fields.isEmpty() ? null : fields.get(0);
    }

    private UiObject2 findEditTextWithText(String expected) {
        for (UiObject2 field : device.findObjects(By.clazz("android.widget.EditText"))) {
            if (expected.equalsIgnoreCase(String.valueOf(field.getText()))) return field;
        }
        return null;
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

    private UiObject2 findClickableLabel(String text) {
        for (UiObject2 object : device.findObjects(By.text(text))) {
            UiObject2 tappable = clickableAncestor(object);
            if (tappable != null) return tappable;
        }
        for (UiObject2 object : device.findObjects(By.textContains(text))) {
            UiObject2 tappable = clickableAncestor(object);
            if (tappable != null) return tappable;
        }
        for (UiObject2 object : device.findObjects(By.desc(text))) {
            UiObject2 tappable = clickableAncestor(object);
            if (tappable != null) return tappable;
        }
        for (UiObject2 object : device.findObjects(By.descContains(text))) {
            UiObject2 tappable = clickableAncestor(object);
            if (tappable != null) return tappable;
        }
        return null;
    }

    private UiObject2 clickableAncestor(UiObject2 object) {
        UiObject2 x = object;
        while (x != null) {
            if (x.isClickable()) return x;
            x = x.getParent();
        }
        return null;
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
        UiObject2 tappable = clickableAncestor(object);
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
