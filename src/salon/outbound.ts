export type OutButton = {
  text: string;
  callback?: string;
  url?: string;
};

export type OutMessage = {
  text: string;
  buttons?: OutButton[][];
  requestContact?: boolean;
  removeKeyboard?: boolean;
};

export type SalonChannelName = "telegram" | "max";

export type InboundMessage = {
  channel: SalonChannelName;
  externalId: string;
  text?: string;
  callback?: string;
  phone?: string;
  firstName?: string;
  startPayload?: string;
};

export type Notifier = {
  send(channel: SalonChannelName, externalId: string, message: OutMessage): Promise<void>;
};

export const createNotifier = (): Notifier & {
  use(channel: SalonChannelName, send: (externalId: string, message: OutMessage) => Promise<void>): void;
} => {
  const handlers = new Map<SalonChannelName, (externalId: string, message: OutMessage) => Promise<void>>();
  return {
    use(channel, send) {
      handlers.set(channel, send);
    },
    async send(channel, externalId, message) {
      const handler = handlers.get(channel);
      if (!handler) {
        return;
      }
      await handler(externalId, message);
    },
  };
};
