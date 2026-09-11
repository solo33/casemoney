import FamilyMembers from "./FamilyMembers";
import FamilySharedAccounts from "./FamilySharedAccounts";

export default function FamilySettings({ controller }) {
  const { state, roleLabel, submit, setMessage, inviteEmail, setInviteEmail, ownAccounts, shareDraft, selectAccountForSharing, activeMembers, setShareDraft, selectedSharedAccount } = controller;
  return <section aria-label="Настройки семьи">
    <h2>Настройки семьи</h2>
    <p>Участники, приглашения и доступ к счетам. Личные финансы видны только их владельцам.</p>
    <div className="family-columns">
      {state.family.current_user_role === "owner" && <FamilyMembers state={state} roleLabel={roleLabel} submit={submit} setMessage={setMessage} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail} />}
      <FamilySharedAccounts ownAccounts={ownAccounts} shareDraft={shareDraft} submit={submit} setMessage={setMessage} selectAccountForSharing={selectAccountForSharing} activeMembers={activeMembers} state={state} setShareDraft={setShareDraft} selectedSharedAccount={selectedSharedAccount} />
    </div>
  </section>;
}
