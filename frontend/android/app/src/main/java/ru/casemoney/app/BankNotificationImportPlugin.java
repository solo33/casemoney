package ru.casemoney.app;

import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "BankNotificationImport")
public class BankNotificationImportPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("permissionGranted", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        result.put("enabled", BankNotificationStore.isEnabled(getContext()));
        try {
            result.put("banks", new JSObject(BankNotificationStore.banks(getContext()).toString()));
        } catch (JSONException ignored) {
            result.put("banks", new JSObject());
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            call.resolve();
        } catch (Exception error) {
            call.reject("Не удалось открыть системные настройки уведомлений", error);
        }
    }

    @PluginMethod
    public void saveSettings(PluginCall call) {
        BankNotificationStore.setEnabled(getContext(), call.getBoolean("enabled", false));
        BankNotificationStore.setBanks(getContext(), call.getObject("banks"));
        getStatus(call);
    }

    @PluginMethod
    public void getDrafts(PluginCall call) {
        JSONArray stored = BankNotificationStore.drafts(getContext());
        JSArray drafts = new JSArray();
        for (int index = 0; index < stored.length(); index++) drafts.put(stored.opt(index));
        JSObject result = new JSObject();
        result.put("drafts", drafts);
        call.resolve(result);
    }

    @PluginMethod
    public void removeDraft(PluginCall call) {
        BankNotificationStore.removeDraft(getContext(), call.getString("id", ""));
        call.resolve();
    }

    @PluginMethod
    public void clearDrafts(PluginCall call) {
        BankNotificationStore.clearDrafts(getContext());
        call.resolve();
    }
}
