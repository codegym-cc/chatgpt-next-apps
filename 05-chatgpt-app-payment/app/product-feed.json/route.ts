import { NextResponse } from "next/server";
import { catalogService } from "@/src/domain/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const products = catalogService.list({ limit: 50 });

  const items = products.map((p) => ({
    id: p.sku,
    title: p.title,
    price: p.price,
    currency: p.currency,
    imageUrl: p.imageUrl,
    availability: p.inStock ? "in_stock" : "out_of_stock",
    url: p.sellerUrl ?? `https://example.com/products/${encodeURIComponent(p.sku)}`
  }));

  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}