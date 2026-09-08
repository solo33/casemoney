import { Card, TabHead } from "./DashboardControls";

import { Link } from "react-router-dom";
import { TxRow } from "./DashboardTransactionRow";

export default function RecordsWidget({ widgetSettings, recordsTab, setRecordsTab, dayLabel, isWidgetCollapsed, todayTx, recentlyChanged, setEditingTx, handleDeleteTx }) {
  return (
    <Card noPadding className="home-records-card" style={{ order: widgetSettings.records.order }}>
          <div style={{
            display: "flex", alignItems: "stretch", flexWrap: "wrap",
            borderBottom: "1px solid #ece6d8",
          }}>
            <TabHead
              active={recordsTab === "today"}
              onClick={() => setRecordsTab("today")}
            >
              {dayLabel}
            </TabHead>
            <TabHead
              active={recordsTab === "changed"}
              onClick={() => setRecordsTab("changed")}
            >
              Последние изменённые
            </TabHead>
            <Link to="/transactions" style={{
              fontSize: 12, color: "#9c7b3c", textDecoration: "none",
              marginLeft: "auto", alignSelf: "center", padding: "0 16px",
            }}>
              Все записи →
            </Link>
          </div>

          {!isWidgetCollapsed("records") && (() => {
            const list = recordsTab === "today" ? todayTx : recentlyChanged;
            if (list.length === 0) {
              return (
                <p style={{ padding: 24, textAlign: "center", color: "#a6afb8", fontSize: 14 }}>
                  {recordsTab === "today"
                    ? <>Нет записей за этот день. Выберите дату или добавьте операцию.</>
                    : "Пока нет записей."}
                </p>
              );
            }
            return (
              <div>
                {list.map((tx, idx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    first={idx === 0}
                    showDate={recordsTab === "changed"}
                    onEdit={() => setEditingTx(tx)}
                    onDelete={() => handleDeleteTx(tx)}
                  />
                ))}
              </div>
            );
          })()}
        </Card>
  );
}
