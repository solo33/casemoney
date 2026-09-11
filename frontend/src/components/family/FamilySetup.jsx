import api from "../../api/client";

export default function FamilySetup({ state, submit, setMessage, familyName, setFamilyName }) {
  return (
        <>
          {(state.pending_invitations || []).map(invitation => (
            <section className="family-card" key={invitation.id}>
              <h2>Вас приглашают в «{invitation.family_name}»</h2>
              <button onClick={() => submit(async () => {
                await api.post(`/api/family/invitations/${invitation.id}/accept`);
                setMessage("Приглашение принято");
              })}>
                Принять приглашение
              </button>
            </section>
          ))}
          <section className="family-card">
            <h2>Создать семейное пространство</h2>
            <p>После создания вы сможете пригласить второго участника по email.</p>
            <form onSubmit={event => {
              event.preventDefault();
              submit(async () => {
                await api.post("/api/family/", { name: familyName });
                setMessage("Семейное пространство создано");
              });
            }}>
              <input
                value={familyName}
                onChange={event => setFamilyName(event.target.value)}
                placeholder="Название семьи"
                required
              />
              <button type="submit">Создать</button>
            </form>
          </section>
        </>
  );
}
