package ru.casemoney.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Stores only parsed operation drafts. Original notification text is never saved. */
public final class BankNotificationStore {
    private static final String PREFS = "casemoney_bank_notification_import";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_BANKS = "banks";
    private static final String KEY_DRAFTS = "drafts";
    private static final int MAX_DRAFTS = 100;

    private BankNotificationStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    public static JSONObject banks(Context context) {
        try {
            return new JSONObject(prefs(context).getString(KEY_BANKS, "{}"));
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    public static void setBanks(Context context, JSONObject banks) {
        prefs(context).edit().putString(KEY_BANKS, banks == null ? "{}" : banks.toString()).apply();
    }

    public static boolean isBankEnabled(Context context, String packageName) {
        return banks(context).optBoolean(packageName, false);
    }

    public static JSONArray drafts(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_DRAFTS, "[]"));
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    public static synchronized boolean appendDraft(Context context, JSONObject draft) {
        JSONArray current = drafts(context);
        String id = draft.optString("id");
        for (int index = 0; index < current.length(); index++) {
            JSONObject item = current.optJSONObject(index);
            if (item != null && id.equals(item.optString("id"))) return false;
        }
        JSONArray next = new JSONArray();
        next.put(draft);
        for (int index = 0; index < current.length() && next.length() < MAX_DRAFTS; index++) {
            next.put(current.opt(index));
        }
        prefs(context).edit().putString(KEY_DRAFTS, next.toString()).apply();
        return true;
    }

    public static synchronized void removeDraft(Context context, String id) {
        JSONArray current = drafts(context);
        JSONArray next = new JSONArray();
        for (int index = 0; index < current.length(); index++) {
            JSONObject item = current.optJSONObject(index);
            if (item == null || !id.equals(item.optString("id"))) next.put(current.opt(index));
        }
        prefs(context).edit().putString(KEY_DRAFTS, next.toString()).apply();
    }

    public static void clearDrafts(Context context) {
        prefs(context).edit().putString(KEY_DRAFTS, "[]").apply();
    }
}
