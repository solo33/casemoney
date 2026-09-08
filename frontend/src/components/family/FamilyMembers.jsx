import api from "../../api/client";

export default function FamilyMembers({ state, roleLabel, submit, setMessage, inviteEmail, setInviteEmail }) {
  return (
    <section className="family-card">
              <h2>Участники</h2>
              <div className="family-members">
                {state.family.members.map(member => {
                  const isSelf = member.user_id === state.family.current_user_id;
                  const isOwner = state.family.current_user_role === "owner";
                  const canRemove = member.role !== "owner" && (isOwner || isSelf);
                  return (
                    <div key={member.id}>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                      <span className="family-member-actions">
                        {member.status === "active" ? roleLabel(member.role) : "Приглашён"}
                        {isOwner && member.role !== "owner" && member.status === "active" && (
                          <select
                            value={member.role === "member" ? "editor" : member.role}
                            aria-label={`Роль ${member.name}`}
                            onChange={event => submit(async () => {
                              await api.patch(`/api/family/members/${member.id}/role`, { role: event.target.value });
                              setMessage("Роль участника обновлена");
                            })}
                          >
                            <option value="editor">Редактор</option>
                            <option value="viewer">Наблюдатель</option>
                          </select>
                        )}
                        {canRemove && (
                          <button
                            type="button"
                            className="family-member-remove"
                            onClick={() => {
                              const confirmMsg = isSelf
                                ? "Выйти из семейного пространства?"
                                : member.status === "active"
                                  ? `Убрать «${member.name}» из семьи?`
                                  : `Отменить приглашение для ${member.email}?`;
                              if (!window.confirm(confirmMsg)) return;
                              submit(async () => {
                                await api.delete(`/api/family/members/${member.id}`);
                                setMessage(isSelf ? "Вы вышли из семьи" : "Участник удалён");
                              });
                            }}
                          >
                            {isSelf ? "Выйти" : "Удалить"}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {state.family.current_user_role === "owner" && (
                <form onSubmit={event => {
                  event.preventDefault();
                  submit(async () => {
                    await api.post("/api/family/invite", { email: inviteEmail, role: "editor" });
                    setInviteEmail("");
                    setMessage("Приглашение создано");
                  });
                }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={event => setInviteEmail(event.target.value)}
                    placeholder="Email участника"
                    required
                  />
                  <button type="submit">Пригласить</button>
                </form>
              )}
            </section>
  );
}
