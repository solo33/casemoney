import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeBankNotifications = registerPlugin("BankNotificationImport");

export const BANK_DRAFTS_CHANGED_EVENT = "casemoney:bank-drafts-changed";

export const BANK_APPS = [
  { id: "com.idamob.tinkoff.android", label: "Т-Банк" },
];

export function isBankNotificationImportAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function publishChange() {
  window.dispatchEvent(new CustomEvent(BANK_DRAFTS_CHANGED_EVENT));
}

export async function getBankNotificationStatus() {
  if (!isBankNotificationImportAvailable()) return null;
  return NativeBankNotifications.getStatus();
}

export async function requestBankNotificationPermission() {
  if (!isBankNotificationImportAvailable()) return false;
  await NativeBankNotifications.requestPermission();
  return true;
}

export async function saveBankNotificationSettings(settings) {
  if (!isBankNotificationImportAvailable()) return null;
  const response = await NativeBankNotifications.saveSettings(settings);
  publishChange();
  return response;
}

export async function listBankNotificationDrafts() {
  if (!isBankNotificationImportAvailable()) return [];
  const response = await NativeBankNotifications.getDrafts();
  return response.drafts || [];
}

export async function removeBankNotificationDraft(id) {
  if (!isBankNotificationImportAvailable()) return;
  await NativeBankNotifications.removeDraft({ id });
  publishChange();
}

export async function clearBankNotificationDrafts() {
  if (!isBankNotificationImportAvailable()) return;
  await NativeBankNotifications.clearDrafts();
  publishChange();
}
