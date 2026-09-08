import api from "../../api/client";

export default function FamilySettlementForm({ submit, settlement, setSettlement, setMessage, selectSettlementRecipient, activeMembers, state, currencyOptions }) {
  return (
    <section className="family-card">
              <h2>Зафиксировать возмещение</h2>
              <p>Закрывает внутренний долг перед участником. Остатки и расходы не меняются: они уже учтены при переносе покупок.</p>
              <form onSubmit={event => {
                event.preventDefault();
                submit(async () => {
                  await api.post("/api/family/settlements", {
                    ...settlement,
                    to_user_id: Number(settlement.to_user_id),
                    amount: Number(settlement.amount),
                  });
                  setSettlement(current => ({ ...current, amount: "", description: "" }));
                  setMessage("Возмещение учтено");
                });
              }}>
                <select
                  value={settlement.to_user_id}
                  onChange={event => selectSettlementRecipient(event.target.value)}
                  required
                >
                  <option value="">Кому возместили</option>
                  {activeMembers
                    .filter(member => member.user_id !== state.family.current_user_id)
                    .map(member => (
                    <option key={member.id} value={member.user_id}>{member.name}</option>
                  ))}
                </select>
                <div className="family-amount">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={settlement.amount}
                    onChange={event => setSettlement({ ...settlement, amount: event.target.value })}
                    placeholder="Сумма"
                    required
                  />
                  <select
                    value={settlement.currency}
                    onChange={event => setSettlement({ ...settlement, currency: event.target.value })}
                  >
                    {currencyOptions.map(currency => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={settlement.description}
                  onChange={event => setSettlement({ ...settlement, description: event.target.value })}
                  placeholder="Комментарий"
                />
                <button type="submit">Учесть возмещение</button>
              </form>
            </section>
  );
}
