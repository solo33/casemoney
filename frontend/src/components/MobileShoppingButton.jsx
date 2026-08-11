import { Link } from "react-router-dom";
import { useUser } from "../contexts/UserContext";

export default function MobileShoppingButton() {
  const { user } = useUser();
  if (user?.show_shopping_button_mobile === false) return null;
  return <Link to="/shopping" className="mobile-shopping-button" aria-label="Открыть список покупок">🛒<span>Покупки</span></Link>;
}
