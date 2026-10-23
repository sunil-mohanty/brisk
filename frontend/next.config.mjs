const API_URL = process.env.API_URL || "http://localhost:8000";

// Catch a Railway reference that resolved to nothing (e.g. "http://:8000") before it ships.
try {
  if (!new URL(API_URL).hostname) throw new Error();
} catch {
  throw new Error(
    `API_URL is not a valid address: "${API_URL}". On Railway set it on the web service to ` +
      "http://${{<your api service name>.RAILWAY_PRIVATE_DOMAIN}}:8000, e.g. http://brisk-api.railway.internal:8000",
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // The browser only ever talks to this app; /api/* is proxied to FastAPI.
  // Same origin means no CORS setup and the API URL never ships to the client.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
