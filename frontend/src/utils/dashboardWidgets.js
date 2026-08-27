// Единственный источник правды для виджетов главной страницы — используется и на
// Home.jsx (что рендерить), и на Settings.jsx (что показывать в настройках
// отображения). Раньше эти списки жили в двух местах и разошлись: Settings
// всегда считал collapsed=false по умолчанию, а Home на мобильном сворачивал
// «Расходы и доходы» и «Бюджет» — переключатель в настройках был неактуален.
export const DASHBOARD_WIDGETS = [
  { id: "balance", label: "Баланс", collapsedOnMobile: false },
  { id: "forecast", label: "Ближайшие операции", collapsedOnMobile: true },
  { id: "accounts", label: "Счета", collapsedOnMobile: false },
  { id: "records", label: "Последние записи", collapsedOnMobile: false },
  { id: "breakdown", label: "Расходы и доходы", collapsedOnMobile: true },
  { id: "budget", label: "Бюджет", collapsedOnMobile: true },
  { id: "goals", label: "Цели", collapsedOnMobile: true },
];

export function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
}

export function normalizeDashboardWidgets(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const mobile = isMobileViewport();
  return DASHBOARD_WIDGETS.reduce((result, { id, collapsedOnMobile }, index) => {
    const current = saved[id] || {};
    result[id] = {
      visible: current.visible !== false,
      collapsed: current.collapsed !== undefined ? Boolean(current.collapsed) : (collapsedOnMobile && mobile),
      order: Number.isFinite(current.order) ? current.order : index,
    };
    return result;
  }, {});
}
