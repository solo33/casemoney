import api from "../../api/client";

export default function FamilySharedAccounts({ ownAccounts, shareDraft, submit, setMessage, selectAccountForSharing, activeMembers, state, setShareDraft, selectedSharedAccount }) {
  return (
    <section className="family-card family-shared-accounts">
              <h2>Доступ к моим счетам</h2>
              <p>Личные счета остаются видны только владельцу. Откройте доступ лишь к тем счетам, которыми действительно пользуется семья.</p>
              {ownAccounts.length ? (
                <form onSubmit={event => {
                  event.preventDefault();
                  if (!shareDraft.account_id) return;
                  submit(async () => {
                    await api.put(`/api/family/accounts/${shareDraft.account_id}/access`, {
                      is_shared: true,
                      members: Object.entries(shareDraft.members).map(([user_id, permission]) => ({ user_id: Number(user_id), permission })),
                    });
                    setMessage("Доступ к общему счёту обновлён");
                  });
                }}>
                  <select value={shareDraft.account_id} onChange={event => selectAccountForSharing(event.target.value)}>
                    <option value="">Выберите свой счёт</option>
                    {ownAccounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.is_shared ? " — общий" : ""}</option>)}
                  </select>
                  {shareDraft.account_id && activeMembers.filter(member => member.user_id !== state.family.current_user_id).map(member => (
                    <label className="family-account-access" key={member.user_id}>
                      <input
                        type="checkbox"
                        checked={Boolean(shareDraft.members[member.user_id])}
                        onChange={event => setShareDraft(current => {
                          const members = { ...current.members };
                          if (event.target.checked) members[member.user_id] = members[member.user_id] || "editor";
                          else delete members[member.user_id];
                          return { ...current, members };
                        })}
                      />
                      <span>{member.name}</span>
                      {shareDraft.members[member.user_id] && (
                        <select value={shareDraft.members[member.user_id]} onChange={event => setShareDraft(current => ({
                          ...current, members: { ...current.members, [member.user_id]: event.target.value },
                        }))}>
                          <option value="editor">Может редактировать</option>
                          <option value="viewer">Только просмотр</option>
                        </select>
                      )}
                    </label>
                  ))}
                  <button type="submit">Сохранить доступ</button>
                  {selectedSharedAccount && (
                    <button type="button" className="family-member-remove" onClick={() => {
                      if (!window.confirm("Закрыть семейный доступ к этому счёту?")) return;
                      submit(async () => {
                        await api.put(`/api/family/accounts/${selectedSharedAccount.id}/access`, { is_shared: false, members: [] });
                        setShareDraft({ account_id: "", members: {} });
                        setMessage("Счёт снова личный");
                      });
                    }}>Сделать личным</button>
                  )}
                </form>
              ) : <p className="family-analytics-empty">Сначала создайте личный счёт в разделе «Счета».</p>}
            </section>
  );
}
