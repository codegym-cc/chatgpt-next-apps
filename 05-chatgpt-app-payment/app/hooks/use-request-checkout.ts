import { useCallback } from "react";
import {CallToolResponse, CheckoutSession, DisplayMode} from "./types";

/**
 * Hook to request Checkout Dialog from the ChatGPT host.
 *
 * @example
 * ```tsx
 * const requestCheckout = useRequestCheckout();
 * 
 * const handleExpand = async () => {
 *   await requestCheckout({
 *      id: "checkout_session_123",
 *
 *      payment_provider: {
 *        merchant_id: "stripe",
 *        supported_payment_methods: ["card"]
 *      },
 *
 *      status: "ready_for_payment",
 *      currency: "usd",
 *
 *      line_items: [
 *        {
 *          id: "line_item_123",
 *          item: {
 *            id: "item_123",
 *            quantity: 1
 *          },
 *          base_amount: 1000, // before discount
 *          discount: 0,
 *          subtotal: 1000,    // base_amount - discount
 *          tax: 0,
 *          total: 1000        // subtotal + tax
 *        }
 *      ],
 *
 *      fulfillment_address: null,      // optional
 *      fulfillment_options: [],        // optional
 *      fulfillment_option_id: null,    // optional
 *
 *      totals: [
 *        {
 *          type: "total",
 *          display_text: "Total",
 *          amount: 1000 // 1000 - 0 - 0 + 0 + 0 + 0 = 1000
 *        }
 *      ],
 *
 *      messages: [],
 *
 *      links: [
 *        {
 *          type: "terms_of_use",
 *          url: "https://example.com/terms"
 *        }
 *      ]
 *    });
 *
 *   console.log("Checkout started ...");
 * };
 * ```
 */

export function useRequestCheckout() {
  const requestCheckout = useCallback(
      async (args: CheckoutSession): Promise<void> => {
        if (typeof window !== "undefined" && window?.openai?.requestCheckout) {
          return await window.openai.requestCheckout(args);
        }
        return;
      }, []
  );

  return requestCheckout;
}
