import type { ChannelsStatusSnapshot } from "../types";
import type { ChannelsState } from "./channels.types";

export type { ChannelsState };

type WhatsAppLoginResponse = {
  message?: string | null;
  qrDataUrl?: string | null;
  connected?: boolean | null;
};

export async function loadChannels(state: ChannelsState, probe: boolean) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.channelsLoading) {
    return;
  }
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    const res = await state.client.request("channels.status", {
      probe,
      timeoutMs: 8000,
    });
    state.channelsSnapshot = res as ChannelsStatusSnapshot;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    state.channelsError = String(err);
  } finally {
    state.channelsLoading = false;
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request("web.login.start", {
      force,
      timeoutMs: 30000,
    })) as WhatsAppLoginResponse;
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- client.request returns unknown, assertion is needed
    const res = (await state.client.request("web.login.wait", {
      timeoutMs: 120000,
    })) as WhatsAppLoginResponse;
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginConnected = res.connected ?? null;
    if (res.connected) {
      state.whatsappLoginQrDataUrl = null;
    }
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function logoutWhatsApp(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) {
    return;
  }
  state.whatsappBusy = true;
  try {
    await state.client.request("channels.logout", { channel: "whatsapp" });
    state.whatsappLoginMessage = "Logged out.";
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}
