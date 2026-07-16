export function entryAccountGroups(groups = []) {
  return groups
    .map(bucket => ({
      ...bucket,
      accounts: (bucket.accounts || []).filter(account => account.show_for_entries !== false),
    }))
    .filter(bucket => bucket.accounts.length > 0);
}

export default function AccountOptions({
  groups = [],
  excludeId,
  includeIds = [],
  entryOnly = true,
}) {
  const included = new Set(includeIds.filter(Boolean).map(String));

  return groups.map(bucket => {
    const accounts = (bucket.accounts || []).filter(account => {
      if (String(account.id) === String(excludeId)) return false;
      return !entryOnly || account.show_for_entries !== false || included.has(String(account.id));
    });
    if (accounts.length === 0) return null;

    return (
      <optgroup key={bucket.group.id ?? "ungrouped"} label={bucket.group.name}>
        {accounts.map(account => (
          <option key={account.id} value={account.id}>
            {account.icon ? `${account.icon} ` : ""}{account.name}
          </option>
        ))}
      </optgroup>
    );
  });
}
