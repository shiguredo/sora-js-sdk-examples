import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  SignalingNotifyMessage,
  ConnectionSubscriber,
  ConnectionOptions,
} from "sora-js-sdk";
import { generateChannelId, generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", async () => {
  // 環境変数の読み込み
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  const channelId = generateChannelId();

  const client = new SoraClient(signalingUrl, channelId, secretKey);

  document.querySelector("#connect")?.addEventListener("click", async () => {
    await client.connect();
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
  private readonly connection: ConnectionSubscriber;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.options = {};

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.recvonly(this.channelId, undefined, this.options);
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect(): Promise<void> {
    if (this.secretKey !== "") {
      const jwt = await generateJwt(this.channelId, this.secretKey);
      this.connection.metadata = {
        access_token: jwt,
      };
    }

    await this.connection.connect();
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
    const remoteVideos = document.querySelector("#remote-videos");
    if (remoteVideos) {
      remoteVideos.innerHTML = "";
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  private onnotify(event: SignalingNotifyMessage) {
    // 自分の connection_id を取得する
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

  private ontrack(event: RTCTrackEvent): void {
    // Sora の場合、event.streams には MediaStream が 1 つだけ含まれる
    const stream = event.streams[0];
    const remoteVideoId = `remote-video-${stream.id}`;
    const remoteVideos = document.querySelector<HTMLDivElement>("#remote-videos");
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.style.border = "1px solid red";
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.controls = true;
      remoteVideo.srcObject = stream;
      remoteVideos.append(remoteVideo);
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    // このトラックが属している MediaStream の id を取得する
    const target = event.target;
    if (!(target instanceof MediaStream)) {
      return;
    }
    const stream = target;
    const remoteVideo = document.querySelector(`#remote-video-${stream.id}`);
    if (remoteVideo) {
      remoteVideo.remove();
    }
  }
}
