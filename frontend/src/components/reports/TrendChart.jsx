import { Card } from "./ReportsParts";
import { TREND_PERIODS } from "../../utils/reportsView";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from "recharts";

import { formatMoney } from "../../utils/money";

export default function TrendChart({ trendMonths, setTrendMonths, barData, sym }) {
  return (
    <Card
              title={`Доходы и расходы · ${trendMonths} мес.`}
              kind="trend"
              style={{ flex: 2, minWidth: 320 }}
              right={(
                <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#7a8590", fontSize: 12 }}>
                  Период
                  <select
                    value={trendMonths}
                    onChange={event => setTrendMonths(Number(event.target.value))}
                    aria-label="Период графика доходов и расходов"
                    style={{ padding: "3px 5px", fontSize: 12 }}
                  >
                    {TREND_PERIODS.map(months => <option key={months} value={months}>{months} мес.</option>)}
                  </select>
                </label>
              )}
            >
              {barData.length === 0 ? (
                <p style={{ color: "#a6afb8" }}>Нет данных</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ece6d8" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => formatMoney(v) + " " + sym} />
                    <Legend />
                    <Bar dataKey="Доходы" fill="#0f6a40" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Расходы" fill="#a93421" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
  );
}
