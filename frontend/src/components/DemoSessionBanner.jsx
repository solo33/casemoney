import { DEMO_SESSION_FLAG } from "../pages/Login";

export default function DemoSessionBanner() {
  if (localStorage.getItem(DEMO_SESSION_FLAG) !== "1") return null;

  return (
    <div style={{
      background: "#e8f0f7", borderBottom: "1px solid #9fbfd9",
      padding: "8px 24px",
      textAlign: "center",
      fontSize: 13, color: "#173a54",
    }}>
      🧪 Это демо-песочница с тестовыми данными. Она видна только вам и
      удалится автоматически через несколько часов — для постоянного
      хранения данных зарегистрируйте свой аккаунт.
    </div>
  );
}
