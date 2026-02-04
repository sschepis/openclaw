import type { GatewayBrowserClient } from "../gateway";
import type { ChannelsStatusSnapshot } from "../types";

export type ChannelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  /** Currently expanded channel key (accordion-style single expansion) */
  channelsExpandedChannel: string | null;
  /** Whether to show the debug health panel */
  channelsShowHealthDebug: boolean;
};
