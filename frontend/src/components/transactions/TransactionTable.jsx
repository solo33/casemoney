import { Th, EditRow, Row } from "./TransactionRows";

export default function TransactionTable({ data, selectedIds, toggleAllPage, editing, accounts, accountGroups, categories, tags, user, setCategories, setTags, setEditing, loadTransactions, loadAccounts, accountName, categoryNameFor, formatDate, formatDateTime, handleDelete, toggleSelection }) {
  return (
    <table>
            <thead>
              <tr>
                <Th><input type="checkbox" aria-label="Выбрать все записи на странице" checked={data.items.length > 0 && data.items.every(item => selectedIds.includes(item.id))} onChange={toggleAllPage} /></Th>
                <Th>Дата</Th>
                <Th>Изменено</Th>
                <Th>Тип</Th>
                <Th align="right">Сумма</Th>
                <Th>Счёт</Th>
                <Th>Категория</Th>
                <Th>Описание</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(tx => (
                editing === tx.id
                  ? <EditRow
                      key={tx.id} tx={tx}
                      accounts={accounts} accountGroups={accountGroups} categories={categories} tags={tags}
                      canUseFamily={Boolean(user?.family_access)}
                      onCategoryCreated={category => setCategories(current => [...current, category])}
                      onTagCreated={tag => setTags(current => [...current, tag].sort((a, b) => a.name.localeCompare(b.name, "ru")))}
                      onCancel={() => setEditing(null)}
                      onSaved={() => { setEditing(null); loadTransactions(); loadAccounts(); }}
                    />
                  : <Row
                      key={tx.id} tx={tx}
                      accountName={accountName} categoryName={categoryNameFor}
                      formatDate={formatDate} formatDateTime={formatDateTime}
                      canUseFamily={Boolean(user?.family_access)}
                      onEdit={() => setEditing(tx.id)}
                      onDelete={() => handleDelete(tx.id)}
                      checked={selectedIds.includes(tx.id)}
                      onToggle={() => toggleSelection(tx.id)}
                    />
              ))}
            </tbody>
          </table>
  );
}
