import client from "./client";

export const register = (data) => client.post("/api/auth/register", data);
export const login = (data) => client.post("/api/auth/login", data);
export const resendActivation = (email) =>
  client.post("/api/auth/resend-activation", { email });
export const forgotPassword = (email) =>
  client.post("/api/auth/forgot-password", { email });
export const resetPassword = (token, new_password) =>
  client.post("/api/auth/reset-password", { token, new_password });
export const getPublicConfig = () => client.get("/api/auth/config");
