import { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";

export type Currency = "USD";

export type Product = {
  sku: string;
  title: string;
  description?: string;
  price: number; // integer USD in this demo
  currency: Currency; // always "USD" in MVP
  imageUrl?: string;
  category?: string;
  inStock: boolean;
  sellerUrl?: string;
};

export class ProductNotFoundError extends Error {
  readonly code = "PRODUCT_NOT_FOUND" as const;
  readonly sku: string;

  constructor(sku: string) {
    super(`Product not found: ${sku}`);
    this.name = "ProductNotFoundError";
    this.sku = sku;
  }
}

const CurrencySchema = z.literal("USD");

const ProductSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().nonnegative(),
  currency: CurrencySchema,
  imageUrl: z.string().url().optional(),
  category: z.string().optional(),
  inStock: z.boolean(),
  sellerUrl: z.string().url().optional()
});

const ProductsFileSchema = z.array(ProductSchema).min(1);

export class CatalogService {
  private readonly bySku: Map<string, Product>;

  constructor(private readonly products: Product[]) {
    this.bySku = new Map(products.map((p) => [p.sku, p]));
  }

  public list(opts: { query?: string; category?: string; limit: number }): Product[] {
    const q = opts.query?.trim().toLowerCase();
    const cat = opts.category?.trim().toLowerCase();

    return this.products
      .filter((p) => {
        if (q) {
          const hay = `${p.title} ${p.description ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (cat) {
          if ((p.category ?? "").toLowerCase() !== cat) return false;
        }
        return true;
      })
      .slice(0, opts.limit);
  }

  public getBySku(sku: string): Product | null {
    return this.bySku.get(sku) ?? null;
  }

  public requireBySku(sku: string): Product {
    const product = this.getBySku(sku);
    if (!product) throw new ProductNotFoundError(sku);
    return product;
  }
}

export function loadProductsFromDisk(): Product[] {
  const filePath = path.join(process.cwd(), "data", "products.json");
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return ProductsFileSchema.parse(parsed);
}

export const catalogService = new CatalogService(loadProductsFromDisk());