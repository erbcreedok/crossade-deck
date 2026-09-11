export function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL;
  if (typeof env === "string" && env.length > 0) return env;
  const hostname = globalThis.location?.hostname || "localhost";
  return `http://${hostname}:2567`;
}
