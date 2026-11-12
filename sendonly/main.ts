import Sora from "sora-js-sdk";
import type {
  SignalingNotifyMessage,
  ConnectionPublisher,
  SoraConnection,
  ConnectionOptions,
} from "sora-js-sdk";
import { generateChannelId, generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  const channelId = generateChannelId();

  const client = new SoraClient(signalingUrl, channelId, secretKey);

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    await client.connect(stream);
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await client.disconnect();
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
  private readonly options: ConnectionOptions;

  private readonly secretKey: string;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    options: ConnectionOptions = {},
  ) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.options = options;

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.sendonly(this.channelId, undefined, this.options);
    this.connection.on("notify", this.onnotify.bind(this));
  }

  async connect(stream: MediaStream): Promise<void> {
    if (this.secretKey !== "") {
      const jwt = await generateJwt(this.channelId, this.secretKey);
      this.connection.metadata = {
        access_token: jwt,
      };
    }

    await this.connection.connect(stream);

    const videoElement = document.querySelector<HTMLVideoElement>("#local-video");
    if (videoElement) {
      videoElement.srcObject = stream;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();

    const videoElement = document.querySelector<HTMLVideoElement>("#local-video");
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
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
    }
  }
}
