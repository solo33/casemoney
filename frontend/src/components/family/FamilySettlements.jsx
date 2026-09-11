import { formatMoney } from "../../utils/money";
import FamilySettlementForm from "./FamilySettlementForm";

export default function FamilySettlements({ controller }) {
  const { report, state } = controller;
  return <>
    <section className="family-card">
      <h2>К возмещению за всё время</h2>
      {(report?.outstanding || []).map(item => <div className="family-analytics-row" key={`${item.user_id}-${item.currency}`}>
        <span>{item.name}</span><strong>{formatMoney(item.amount)} {item.currency}</strong>
      </div>)}
      {!report?.outstanding?.length && <p>Невозмещённых расходов нет.</p>}
    </section>
    {state.family.current_user_role === "owner" && <FamilySettlementForm {...controller} />}
    <section className="family-card">
      <h2>История возмещений за месяц</h2>
      {(report?.settlements || []).map(item => <div className="family-analytics-row" key={item.id}>
        <span>{item.from_name} → {item.to_name}<small>{new Date(item.date).toLocaleDateString("ru-RU")} {item.description && `· ${item.description}`}</small></span>
        <strong>{formatMoney(item.amount)} {item.currency}</strong>
      </div>)}
      {!report?.settlements?.length && <p>За выбранный месяц возмещений нет.</p>}
    </section>
  </>;
}
