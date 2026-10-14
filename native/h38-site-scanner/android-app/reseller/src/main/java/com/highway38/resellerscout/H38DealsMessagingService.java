package com.highway38.resellerscout;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Displays Scout deal alerts delivered over FCM (v3.2.0). The backend sends
 * a notification payload (title "Scout alerts", body "67 new penny deals" —
 * Rick's plain-count copy) plus data {url, scope}. Tapping the notification
 * opens the Deals app; the shell lands on the hub, whose Penny/Resale cards
 * deep-link to the deal lists.
 */
public final class H38DealsMessagingService extends FirebaseMessagingService {
    public static final String NATIVE_PUSH_SERVICE_V320 = "NATIVE_PUSH_SERVICE_V320";
    public static final String CHANNEL_ID = "deal_alerts";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        try { PushRegistrar.onNewToken(getApplicationContext(), token); }
        catch (Throwable ignored) {}
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        try {
            String title = "Scout alerts";
            String body = "";
            String tag = "scout-alerts";
            if (message.getNotification() != null) {
                if (message.getNotification().getTitle() != null) title = message.getNotification().getTitle();
                if (message.getNotification().getBody() != null) body = message.getNotification().getBody();
                if (message.getNotification().getTag() != null) tag = message.getNotification().getTag();
            }
            Map<String, String> data = message.getData();
            if (data != null) {
                String scope = data.get("scope");
                if ("penny".equals(scope)) tag = "scout-new-penny";
                else if ("resale".equals(scope)) tag = "scout-new-resale";
                if (body.isEmpty() && data.get("body") != null) body = data.get("body");
                if ((title == null || title.isEmpty()) && data.get("title") != null) title = data.get("title");
            }
            if (body.isEmpty()) body = "New deals are in.";

            ensureChannel(this);
            Intent open = new Intent(this, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int requestCode = tag.hashCode() & 0x7fffffff;
            PendingIntent pending = PendingIntent.getActivity(
                    this, requestCode, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.reseller_scout_icon)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pending);
            NotificationManager manager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.notify(tag, requestCode, builder.build());
        } catch (Throwable ignored) {
            // A display failure must never crash the app process.
        }
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Deal alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("New penny and resale deals from Scout");
        manager.createNotificationChannel(channel);
    }
}
