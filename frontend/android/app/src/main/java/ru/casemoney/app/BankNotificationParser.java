package ru.casemoney.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONException;
import org.json.JSONObject;

/** Conservative local parser. It deliberately rejects security and OTP notifications. */
public final class BankNotificationParser {
    private static final Pattern AMOUNT = Pattern.compile("(?<![\\d])([0-9][0-9 \\u00a0]{0,12}(?:[,.][0-9]{1,2})?)\\s*(₽|руб(?:\\.|лей|ля)?|rub|\\$|usd|€|eur)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SECURITY = Pattern.compile("(?:\\b(?:код|code|пароль|password|otp|одноразов(?:ый|ого)|подтверждени[ея]|verification)\\b)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private BankNotificationParser() {}

    public static JSONObject parse(String packageName, String appName, String title, String text, long postedAt) {
        String source = compact(title + " " + text);
        if (source.isEmpty() || SECURITY.matcher(source).find()) return null;
        Matcher amountMatcher = AMOUNT.matcher(source);
        if (!amountMatcher.find()) return null;

        String amount = amountMatcher.group(1).replace("\u00a0", "").replace(" ", "").replace(',', '.');
        if (amount.isEmpty() || "0".equals(amount) || "0.0".equals(amount) || "0.00".equals(amount)) return null;
        String currency = currencyFor(amountMatcher.group(2));
        String direction = directionFor(source);
        String merchant = merchantFor(title, text, amountMatcher.group(0));
        String minute = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).format(new Date(postedAt));
        String id = digest(packageName + "|" + source + "|" + minute);

        try {
            JSONObject result = new JSONObject();
            result.put("id", id);
            result.put("source", appName);
            result.put("sourcePackage", packageName);
            result.put("amount", amount);
            result.put("currency", currency);
            result.put("type", direction);
            result.put("description", merchant);
            result.put("createdAt", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).format(new Date(postedAt)));
            return result;
        } catch (JSONException ignored) {
            return null;
        }
    }

    private static String directionFor(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        if (normalized.matches(".*(?:зачислен|поступлен|пополнили|пополнение|перевод от|возврат|cashback|кэшбэк).*")) return "income";
        return "expense";
    }

    private static String merchantFor(String title, String text, String amountPart) {
        String candidate = compact(title);
        if (candidate.length() < 3 || candidate.matches("(?i).*(тинькофф|т-банк|операция|уведомление).*")) candidate = compact(text);
        candidate = candidate.replace(amountPart, "").replaceAll("(?i)(списание|покупка|оплата|операция|по карте|карта|сумма|перевод|зачисление)", " ");
        candidate = compact(candidate).replaceAll("^[—:;,.\\- ]+|[—:;,.\\- ]+$", "");
        if (candidate.length() > 80) candidate = candidate.substring(0, 80).trim();
        return candidate.isEmpty() ? "Банковская операция" : candidate;
    }

    private static String currencyFor(String symbol) {
        String normalized = symbol.toLowerCase(Locale.ROOT);
        if (normalized.contains("$") || normalized.contains("usd")) return "USD";
        if (normalized.contains("€") || normalized.contains("eur")) return "EUR";
        return "RUB";
    }

    private static String compact(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    private static String digest(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte item : hash) out.append(String.format(Locale.US, "%02x", item));
            return out.toString();
        } catch (NoSuchAlgorithmException error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
