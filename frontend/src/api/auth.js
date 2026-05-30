import client from "./client";

export const register = (data) => client.post("/api/auth/register", data);
export const login = (data) => client.post("/api/auth/login", data);
export const resendActivation = (email) =>
  client.post("/api/auth/resend-activation", { email });
