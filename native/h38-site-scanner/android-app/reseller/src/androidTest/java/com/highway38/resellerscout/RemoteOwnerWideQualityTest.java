package com.highway38.resellerscout;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.graphics.Rect;
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
public class RemoteOwnerWideQualityTest {
    private static final String TAG = "H38WideQuality";
    private static final String OWNER_PKG = "com.highway38.resellerscout.owner";
    private static final long SHORT = 7_000;
    private static final int NAV_DISCOVER = 0;
    private static final int NAV_HUNT = 1;

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
        assertTrue("Owner login or Discover shell did not render", waitForOwnerReady(12_000));
        signInAsOwnerIfNeeded();
    }

    @Test
    public void wide00DollarGeneralHasNoMarkupIdentityLeak() {
        tapBottomNav(NAV_HUNT);
        assertTrue("Wide DG quality status did not render", waitForLabelContains("DG WIDE QUALITY", 25_000));
        String[] forbidden = {"href=", "target=", "rel=", "style=", "noopener", "noreferrer", "<a", "data-", "aria-"};
        for (String token : forbidden) {
            assertFalse("Malformed source markup is visible in the owner UI: " + token, hasLabelContains(token));
        }
        assertFalse("Known cross-product DG mismatch resurfaced", hasLabelContains("Beech-Nut Veggies Stage 2 Baby Food") && hasLabelContains("840797136519"));
        Log.i(TAG, "WIDE DG IDENTITY PASS: malformed source attributes and known cross-product mismatch absent.");
    }

    @Test
    public void wide01DollarGeneralImageCoverageIsMeaningful() throws Exception {
        tapBottomNav(NAV_HUNT);
        assertTrue("Wide DG quality status did not render", waitForLabelContains("DG WIDE QUALITY", 25_000));
        long end = System.currentTimeMillis() + 150_000;
        WideDgQuality last = null;
        do {
            last = parseWideDgQuality(labelContaining("DG WIDE QUALITY"));
            if (last != null && last.sampled > 0 && last.settled && last.coverage >= 60) break;
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertNotNull("DG wide quality status could not be parsed", last);
        assertTrue("DG visible-card sample must contain products", last.sampled > 0);
        assertTrue("DG exact-image recovery did not reach the 60% visible-card gate; sampled=" + last.sampled + " images=" + last.images + " coverage=" + last.coverage + "%", last.coverage >= 60);
        assertTrue("DG image recovery never reached a terminal settled state", last.settled);
        Log.i(TAG, "WIDE DG IMAGE PASS: sampled=" + last.sampled + " images=" + last.images + " coverage=" + last.coverage + "%");
    }

    @Test
    public void wide02FacebookCandidatesCannotMasqueradeAsProfit() throws Exception {
        ensureDiscover();
        assertTrue("Facebook profit semantics status missing", waitForLabelContains("FACEBOOK PROFIT QUALITY", 20_000));
        UiObject2 hunt = findExactLabel("Hunt profitable Facebook deals");
        assertNotNull("Profit-first Facebook hunt action missing", hunt);
        tapNodeCenter(hunt);
        long end = System.currentTimeMillis() + 150_000;
        boolean completed = false;
        do {
            String source = labelContaining("PROFIT-FIRST FACEBOOK");
            if (source != null && !source.toLowerCase().contains("searching") &&
                    (source.matches(".*\\b[1-9][0-9]* candidates\\b.*") || source.contains("No public Marketplace cards were found") || source.contains("Local Facebook inventory remains unknown"))) {
                completed = true;
                break;
            }
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertTrue("Facebook sourcing never reached a terminal evidence state", completed);
        String quality = labelContaining("FACEBOOK PROFIT QUALITY");
        assertNotNull("Facebook profit semantics status disappeared", quality);
        Matcher m = Pattern.compile("FACEBOOK PROFIT QUALITY.*?(\\d+) verified (?:deal|profit)", Pattern.CASE_INSENSITIVE).matcher(quality);
        assertTrue("Facebook profit semantics status is not machine-readable: " + quality, m.find());
        int verified = Integer.parseInt(m.group(1));
        if (verified == 0) {
            assertTrue("Zero verified profit must explicitly label public candidates as leads only", quality.toLowerCase().contains("leads only"));
            assertTrue("Zero verified profit must explicitly say candidates are not buy-rated", quality.toLowerCase().contains("not buy-rated"));
        } else {
            assertTrue("Verified-deal state must explain the economic gate", quality.toLowerCase().contains("sold comps") && quality.toLowerCase().contains("roi"));
        }
        Log.i(TAG, "WIDE FACEBOOK PASS: " + quality);
    }

    @Test
    public void wide03GarageDiscoveryReturnsActualLocalSaleLead() throws Exception {
        ensureDiscover();
        assertTrue("Garage & estate sales module missing", revealLabel("Garage & estate sales", 5));
        UiObject2 find = revealExactLabel("Find garage sales", 5);
        assertNotNull("Find garage sales action missing", find);
        tapNodeCenter(find);
        long end = System.currentTimeMillis() + 150_000;
        boolean realLead = false;
        do {
            realLead = hasLabel("GARAGE SALE") || hasLabel("YARD SALE") || hasLabel("RUMMAGE SALE") || hasLabel("MOVING SALE") || hasLabel("ESTATE SALE");
            if (realLead) break;
            Thread.sleep(1_250);
        } while (System.currentTimeMillis() < end);
        assertTrue("Garage acquisition returned no actual sale lead; truthful-empty alone is no longer sufficient for the Grand Rapids owner acceptance route", realLead);
        assertFalse("Known non-sale Craigslist cattle listing leaked into garage discovery", hasLabelContains("Red angus bull"));
        Log.i(TAG, "WIDE GARAGE PASS: actual sale-level lead visible.");
    }

    @Test
    public void wide04ExternalSourceRoundTripRestoresScout() throws Exception {
        ensureDiscover();
        assertTrue("Garage & estate sales module missing", revealLabel("Garage & estate sales", 5));
        UiObject2 find = revealExactLabel("Find garage sales", 5);
        assertNotNull("Find garage sales action missing", find);
        tapNodeCenter(find);
        long end = System.currentTimeMillis() + 150_000;
        UiObject2 open = null;
        do {
            open = revealExactLabel("Open sale", 2);
            if (open != null) break;
            Thread.sleep(1_000);
        } while (System.currentTimeMillis() < end);
        assertNotNull("No verified garage-sale source was available for external round-trip acceptance", open);
        tapNodeCenter(open);
        boolean leftOwner = waitForOwnerTop(false, 10_000);
        assertTrue("Open sale did not leave Scout for an external source", leftOwner);
        device.pressBack();
        device.waitForIdle(1_000);
        assertTrue("Scout package did not return after closing external source", waitForOwnerTop(true, 12_000));
        assertTrue("Discover state was not restored after external source return", waitForLabel("Find anything worth reselling", 12_000));
        assertTrue("Garage module was lost after external source return", revealLabel("Garage & estate sales", 4));
        Log.i(TAG, "WIDE RETURN PASS: external source -> Back -> same Scout Discover context.");
    }

    private void signInAsOwnerIfNeeded() {
        if (!hasLabel("Sign in")) { ensureDiscover(); return; }
        String email = requiredArg("SCOUT_EMAIL"), password = requiredArg("SCOUT_PASSWORD");
        List<UiObject2> fields = device.findObjects(By.clazz("android.widget.EditText"));
        assertTrue("Login must expose email and password fields", fields.size() >= 2);
        fields.get(0).setText(email); fields.get(1).setText(password); device.waitForIdle(500);
        UiObject2 signIn = findExactLabel("Sign in"); assertNotNull("Sign in action missing", signIn); tapNodeCenter(signIn);
        assertTrue("Owner login must reach Discover", waitForLabel("Find anything worth reselling", 20_000));
    }

    private void ensureDiscover() {
        if (hasLabel("Find anything worth reselling")) return;
        tapBottomNav(NAV_DISCOVER);
        assertTrue("Discover did not render", waitForLabel("Find anything worth reselling", 12_000));
    }

    private void tapBottomNav(int index) {
        int width=device.getDisplayWidth(),height=device.getDisplayHeight();
        int x=(int)(width*((index*2.0+1.0)/10.0)),y=(int)(height*0.928);
        device.click(x,y); device.waitForIdle(1_500);
    }

    private void swipeUp() {
        device.swipe(device.getDisplayWidth()/2,(int)(device.getDisplayHeight()*0.80),device.getDisplayWidth()/2,(int)(device.getDisplayHeight()*0.34),18);
        device.waitForIdle(500);
    }

    private boolean revealLabel(String text, int swipes) {
        if (hasLabelContains(text)) return true;
        for (int i=0;i<swipes;i++){swipeUp();if(hasLabelContains(text))return true;}
        return false;
    }

    private UiObject2 revealExactLabel(String text, int swipes) {
        UiObject2 x=findExactLabel(text); if(x!=null)return x;
        for(int i=0;i<swipes;i++){swipeUp();x=findExactLabel(text);if(x!=null)return x;}
        return null;
    }

    private void tapNodeCenter(UiObject2 object) {
        Rect bounds=object.getVisibleBounds();
        assertTrue("Visible action has no tappable bounds",bounds.width()>0&&bounds.height()>0);
        device.click(bounds.centerX(),bounds.centerY()); device.waitForIdle(1_000);
    }

    private boolean waitForOwnerTop(boolean expected, long timeout) {
        long end=System.currentTimeMillis()+timeout;
        do {
            boolean top=device.hasObject(By.pkg(OWNER_PKG).depth(0));
            if(top==expected)return true;
            device.waitForIdle(300);
        } while(System.currentTimeMillis()<end);
        return false;
    }

    private WideDgQuality parseWideDgQuality(String value) {
        if(value==null)return null;
        Matcher m=Pattern.compile("DG WIDE QUALITY.*?(\\d+) sampled.*?(\\d+) images.*?(\\d+)% coverage.*?(RECOVERING|SETTLED)",Pattern.CASE_INSENSITIVE).matcher(value);
        if(!m.find())return null;
        return new WideDgQuality(Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),Integer.parseInt(m.group(3)),"SETTLED".equalsIgnoreCase(m.group(4)));
    }

    private String labelContaining(String needle) {
        UiObject2 x=device.findObject(By.descContains(needle));
        if(x!=null&&x.getContentDescription()!=null)return x.getContentDescription();
        x=device.findObject(By.textContains(needle));
        return x==null?null:x.getText();
    }

    private String requiredArg(String key) {
        String value=args.getString(key,"").trim();
        assertFalse(key+" instrumentation argument is required",value.isEmpty());
        return value;
    }

    private boolean waitForOwnerReady(long timeout) {
        long end=System.currentTimeMillis()+timeout;
        do {
            if(hasLabel("Find anything worth reselling"))return true;
            if(hasLabel("Sign in")&&device.findObjects(By.clazz("android.widget.EditText")).size()>=2)return true;
            device.waitForIdle(300);
        } while(System.currentTimeMillis()<end);
        return false;
    }

    private boolean waitForLabel(String text,long timeout){long end=System.currentTimeMillis()+timeout;do{if(hasLabel(text))return true;device.waitForIdle(300);}while(System.currentTimeMillis()<end);return false;}
    private boolean waitForLabelContains(String text,long timeout){long end=System.currentTimeMillis()+timeout;do{if(hasLabelContains(text))return true;device.waitForIdle(300);}while(System.currentTimeMillis()<end);return false;}
    private UiObject2 findExactLabel(String text){UiObject2 x=device.findObject(By.text(text));return x!=null?x:device.findObject(By.desc(text));}
    private boolean hasLabel(String text){return device.hasObject(By.text(text))||device.hasObject(By.desc(text));}
    private boolean hasLabelContains(String text){return device.hasObject(By.textContains(text))||device.hasObject(By.descContains(text));}

    private static final class WideDgQuality {
        final int sampled,images,coverage; final boolean settled;
        WideDgQuality(int sampled,int images,int coverage,boolean settled){this.sampled=sampled;this.images=images;this.coverage=coverage;this.settled=settled;}
    }
}
