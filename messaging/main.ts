import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionMessaging,
  SignalingNotifyMessage,
  DataChannelMessageEvent,
  DataChannelEvent,
} from "sora-js-sdk";
import { generateChannelId, generateJwt } from "../src/misc";

// チェックボックスがチェックされているかを返す
const isChecked = (selector: string): boolean => {
  const element = document.querySelector(selector);
  return element instanceof HTMLInputElement && element.checked;
};

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  const channelId = generateChannelId();

  const client = new SoraClient(signalingUrl, channelId, secretKey);

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const compress = isChecked("#check-compress");
    const header = isChecked("#check-header");

    await client.connect(compress, header);
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await client.disconnect();
  });

  document.querySelector("#send-message")?.addEventListener("click", async () => {
    const value = document.querySelector<HTMLInputElement>("input[name=message]")?.value;
    if (value !== undefined && value !== "") {
      await client.sendMessage(value);
    }
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    const statsReport = await client.getStats();
    const statsReportJson: Record<string, unknown>[] = [];
    for (const report of statsReport.values()) {
      // RTCStatsReport の値は lib.dom.d.ts で any 型に定義されているため、ここだけ型アサーションを使う
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      statsReportJson.push(report as Record<string, unknown>);
    }
    const statsReportJsonElement = document.querySelector<HTMLPreElement>("#stats-report-json");
    if (statsReportJsonElement) {
      statsReportJsonElement.textContent = JSON.stringify(statsReportJson, null, 2);
    }
  });
});

class SoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly options: object;

  private readonly secretKey: string;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionMessaging;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId;
    this.secretKey = secretKey;

    this.options = {
      dataChannelSignaling: true,
      dataChannels: [
        {
          label: "#example",
          direction: "sendrecv",
          compress: true,
        },
      ],
    };

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.messaging(this.channelId, undefined, this.options);
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("datachannel", this.ondatachannel.bind(this));
    this.connection.on("message", this.onmessage.bind(this));
  }

  async connect(compress: boolean, header: boolean) {
    if (this.secretKey !== "") {
      const jwt = await generateJwt(this.channelId, this.secretKey);
      this.connection.metadata = {
        access_token: jwt,
      };
    }

    // dataChannels の compress の設定を上書きする
    this.connection.options.dataChannels = [
      {
        label: "#example",
        direction: "sendrecv",
        compress,
        // header が true の場合は sender_connection_id を追加
        ...(header ? { header: [{ type: "sender_connection_id" as const }] } : {}),
      },
    ];
    await this.connection.connect();
  }

  async disconnect() {
    await this.connection.disconnect();

    const receivedMessagesElement = document.querySelector("#received-messages");
    if (receivedMessagesElement) {
      receivedMessagesElement.innerHTML = "";
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error("PeerConnection is not ready"));
    }
    return this.connection.pc.getStats();
  }

  async sendMessage(message: string) {
    if (message !== "") {
      await this.connection.sendMessage("#example", new TextEncoder().encode(message));
    }
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const channelIdElement = document.querySelector("#channel-id");
      if (channelIdElement) {
        channelIdElement.textContent = this.channelId;
      }
      const sessionIdElement = document.querySelector("#session-id");
      if (sessionIdElement) {
        sessionIdElement.textContent = this.connection.sessionId;
      }
      const connectionIdElement = document.querySelector("#connection-id");
      if (connectionIdElement) {
        connectionIdElement.textContent = this.connection.connectionId;
      }

      // 送信ボタンを有効にする
      const sendMessageButton = document.querySelector<HTMLButtonElement>("#send-message");
      if (sendMessageButton) {
        sendMessageButton.disabled = false;
      }
    }
  }

  private ondatachannel(event: DataChannelEvent) {
    const openDataChannel = document.createElement("li");
    openDataChannel.textContent = new TextDecoder().decode(
      new TextEncoder().encode(event.datachannel.label),
    );
    document.querySelector("#messaging")?.append(openDataChannel);
  }

  private onmessage(event: DataChannelMessageEvent) {
    const message = document.createElement("li");
    message.textContent = new TextDecoder().decode(event.data);
    document.querySelector("#received-messages")?.append(message);
  }
}
