import type { NextConfig } from "next";
import { baseURL } from "@/baseUrl";

const nextConfig: NextConfig = {
    assetPrefix: baseURL,

    async headers() {
        return [
            {
                source: "/_next/static/:path*",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Timing-Allow-Origin", value: "*" }
                ],
            },
        ];
    },
};


export default nextConfig;
