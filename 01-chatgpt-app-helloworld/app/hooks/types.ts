/**
 * Source: https://github.com/openai/openai-apps-sdk-examples/tree/main/src
 */

export type OpenAIGlobals<
  ToolInput = UnknownObject,
  ToolOutput = UnknownObject,
  ToolResponseMetadata = UnknownObject,
  WidgetState = UnknownObject
> = {
  // visuals
  theme: Theme;

  userAgent: UserAgent;
  locale: string;

  // layout
  maxHeight: number;
  displayMode: DisplayMode;
  safeArea: SafeArea;

  // state
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
  setWidgetState: (state: WidgetState) => Promise<void>;
};

type API = {
  callTool: CallTool;
  sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
  openExternal(payload: { href: string }): void;


  // Layout controls
  requestDisplayMode: RequestDisplayMode;
  requestModal: RequestModal;
  requestClose: RequestClose;

  // functions
  // callCompletion: CallCompletion;
  // downloadFile: DownloadFile;
  // uploadFile: UploadFile;
  // openPromptInput: OpenPromptInput;
  requestCheckout: RequestCheckout;
  // requestLinkToConnector: RequestLinkToConnector;
  // sendInstrument: SendInstrument;
  // streamCompletion: StreamCompletion;

  // notification
  notifyEscapeKey: NotificationHandler | null;
  notifyIntrinsicHeight: NotificationHandler | null;
  notifyNavigation: NotificationHandler | null;
  notifySecurityPolicyViolation: NotificationHandler | null;
};

export type UnknownObject = Record<string, unknown>;
type NotificationHandler<T = UnknownObject> = (params: T) => void;

export type CallCompletion = (args: UnknownObject) => Promise<UnknownObject>; // Wait for the task to complete
export type DownloadFile = (args: { fileId: string | number }) => Promise<UnknownObject>;
export type UploadFile = (args: UploadFileArgs) => Promise<UnknownObject>;
export type OpenPromptInput = (args: UnknownObject) => Promise<UnknownObject>;
export type RequestCheckout = (args: CheckoutSession) => Promise<void>;
export type RequestLinkToConnector = (params: { connectorId: string }) => Promise<UnknownObject>;
export type SendInstrument = (params: UnknownObject) => Promise<void>;
export type StreamCompletion = (params: UnknownObject) => AsyncIterable<UnknownObject>;

export interface UploadFileArgs {
  /**
   * A function that returns an ArrayBuffer with the file data.
   * Same contract as File/Blob: () => file.arrayBuffer()
   */
  arrayBuffer: () => Promise<ArrayBuffer> | ArrayBuffer;

  /** Optional, but useful for UI purposes */
  name?: string;
  mimeType?: string;
}

export type Theme = "light" | "dark";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type SafeArea = {
  insets: SafeAreaInsets;
};

export type DeviceType = "mobile" | "tablet" | "desktop" | "unknown";

export type UserAgent = {
  device: { type: DeviceType };
  capabilities: {
    hover: boolean;
    touch: boolean;
  };
};

/** Display mode */
export type DisplayMode = "pip" | "inline" | "fullscreen";
export type RequestDisplayMode = (args: { mode: DisplayMode }) => Promise<{
  /**
   * The granted display mode. The host may reject the request.
   * For mobile, PiP is always coerced to fullscreen.
   */
  mode: DisplayMode;
}>;

export type RequestModal = (args: { title: string }) => Promise<boolean>;
export type RequestClose = () => Promise<void>;

export type CallToolResponse = {
  result: string | number;
};

/** Calling APIs */
export type CallTool = (
  name: string,
  args: Record<string, unknown>
) => Promise<CallToolResponse>;

/** CheckoutSession */
export interface CheckoutSession {
  id: string;

  payment_provider: {
    merchant_id: string;
    supported_payment_methods: string[];
  };

  status: CheckoutStatus;

  currency: string;

  line_items: CheckoutLineItem[];

  fulfillment_address?: CheckoutAddress | null;
  fulfillment_options?: CheckoutFulfillmentOption[];
  fulfillment_option_id?: string | null;

  totals: CheckoutTotal[];

  messages: CheckoutMessage[];

  links: CheckoutLink[];
}

export type CheckoutStatus =
    | "ready_for_payment"
    | "payment_pending"
    | "paid"
    | "cancelled";

export interface CheckoutLineItem {
  id: string;
  item: {
    id: string;
    quantity: number;
  };

  base_amount: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
}

export interface CheckoutAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  [key: string]: unknown;
}

export interface CheckoutFulfillmentOption {
  id: string;
  label: string;
  amount: number;
  [key: string]: unknown;
}

export type CheckoutTotalType =
    | "items_base_amount"
    | "items_discount"
    | "subtotal"
    | "discount"
    | "fulfillment"
    | "tax"
    | "fee"
    | "total";

export interface CheckoutTotal {
  type: CheckoutTotalType;
  display_text: string;
  amount: number;
}

export interface CheckoutMessage {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface CheckoutLink {
  type: string;
  url: string;
}

/** Extra events */
export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";
export class SetGlobalsEvent extends CustomEvent<{
  globals: Partial<OpenAIGlobals>;
}> {
  readonly type = SET_GLOBALS_EVENT_TYPE;
}

/**
 * Global oai object injected by the web sandbox for communicating with chatgpt host page.
 */
declare global {
  interface Window {
    openai: API & OpenAIGlobals;
    innerBaseUrl: string;
    __isChatGptApp?: boolean;
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}


/**
 * MCP extra parameters
 */
export interface ToolExtra {
  /** AbortSignal to allow cancelling tool execution */
  signal: AbortSignal;

  /** May be undefined — do not rely on it */
  sessionId?: string;

  /** Metadata from OpenAI (subject, locale, userLocation, userAgent, ...) */
  _meta?: OpenAIMeta;

  /** Authorization info (if configured); currently undefined in your setup */
  authInfo?: unknown;

  /** Request ID, useful for logging */
  requestId?: number | string;

  /** HTTP request info (if available) */
  requestInfo?: RequestInfo;

  /** Task-related fields (may be undefined) */
  taskId?: string;
  taskStore?: unknown;
  taskRequestedTtl?: number;
  closeSSEStream?: () => void;
  closeStandaloneSSEStream?: () => void;

  /** Helper MCP RPC methods */
  sendNotification?: (data: unknown) => Promise<void>;
  sendRequest?: (data: unknown) => Promise<unknown>;

  [key: string]: unknown;
}

export interface AuthInfo {
  token?: string;
  clientId?: string;
  scopes?: string[];
  expiresAt?: string; // ISO date/time, if available

  [key: string]: unknown;
}

export interface OpenAIUserLocation {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
}

export interface OpenAIMeta {
  "openai/userAgent"?: string;
  "openai/locale"?: string;          // BCP-47, e.g. "en-US"
  "openai/userLocation"?: OpenAIUserLocation;
  "openai/subject"?: string;         // anonymous user/subject ID

  [key: string]: unknown;
}