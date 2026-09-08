import { DEMO_SESSION_FLAG, REAL_LOGIN_FLAG } from "../utils/sessionFlags";


export function markRealLogin(token) {
  localStorage.setItem("token", token);
  localStorage.removeItem(DEMO_SESSION_FLAG);
  localStorage.setItem(REAL_LOGIN_FLAG, "1");
}

export const lbl = { display: "block", marginBottom: 14 };

export const lblText = {
  display: "block",
  fontSize: 12, color: "#7a8590",
  marginBottom: 4, fontWeight: 500,
};
