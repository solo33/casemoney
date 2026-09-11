import { Link } from "react-router-dom";
import ExpenseImport from "./ExpenseImport";
import FamilyExpenseList from "./FamilyExpenseList";

export default function FamilyPurchases({ controller }) {
  return <>
    {controller.state.family.current_user_role === "owner" && <ExpenseImport {...controller} />}
    <FamilyExpenseList expenses={controller.report?.expenses} />
    <Link className="family-inline-link" to="/transactions">Перейти к записям и добавить семейный расход →</Link>
  </>;
}
