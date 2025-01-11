import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionOptions,
} from "sora-js-sdk";
import { generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  // パラメータから channelName を取得
  const urlParams = new URLSearchParams(window.location.search);
  const channelName = urlParams.get("channelName") || "";
  const channelId = `${channelIdPrefix}:${channelName}:${channelIdSuffix}`;

  const client = new SoraClient(signalingUrl, channelId, secretKey);

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
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
      statsReportJson.push(report);
    }
    const statsReportJsonElement = document.querySelector<HTMLPreElement>("#stats-report-json");
    if (statsReportJsonElement) {
      statsReportJsonElement.textContent = JSON.stringify(statsReportJson, null, 2);
    }
  });
});

class SoraClient {
  private debug = false;

  private channelId: string;
  private options: ConnectionOptions;

  private secretKey: string;

  private sora: SoraConnection;
  private connection: ConnectionPublisher;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.options = {};

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.sendrecv(this.channelId, undefined, this.options);
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect(stream: MediaStream) {
    if (this.secretKey !== "") {
      const jwt = await generateJwt(this.channelId, this.secretKey);
      console.log(`jwt=${jwt}`);
      this.connection.metadata = {
        access_token: jwt,
      };
    }

    await this.connection.connect(stream);
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = stream;
    }
  }

  async disconnect() {
    await this.connection.disconnect();

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = null;
    }
    // お掃除
    const remoteVideos = document.querySelector("#remote-videos");
    if (remoteVideos) {
      remoteVideos.innerHTML = "";
    }
  }

  async getStats(): Promise<RTCStatsReport> {
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

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    const remoteVideoId = `remote-video-${stream.id}`;
    const remoteVideos = document.querySelector("#remote-videos");
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.style.border = "1px solid red";
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.controls = true;
      remoteVideo.width = 320;
      remoteVideo.height = 240;
      remoteVideo.srcObject = stream;
      remoteVideos.appendChild(remoteVideo);
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream;
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`);
    if (remoteVideo) {
      document.querySelector("#remote-videos")?.removeChild(remoteVideo);
    }
  }
}
