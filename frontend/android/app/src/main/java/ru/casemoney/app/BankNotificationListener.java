package ru.casemoney.app;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.Bundle;

/** Android calls this service only after the user grants notification access in system settings. */
public class BankNotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        if (!BankNotificationStore.isEnabled(this)) return;
        String packageName = notification.getPackageName();
        if (!BankNotificationStore.isBankEnabled(this, packageName)) return;

        Notification data = notification.getNotification();
        Bundle extras = data.extras;
        String title = stringValue(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = stringValue(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        if (text.isEmpty()) text = stringValue(extras.getCharSequence(Notification.EXTRA_TEXT));
        String appName = packageName.equals("com.idamob.tinkoff.android") ? "Т-Банк" : "Банк";
        org.json.JSONObject draft = BankNotificationParser.parse(packageName, appName, title, text, notification.getPostTime());
        if (draft != null) BankNotificationStore.appendDraft(this, draft);
    }

    private static String stringValue(CharSequence value) {
        return value == null ? "" : value.toString();
    }
}
