import Sora, {
  type SoraConnection,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
  type SimulcastRid,
  type ConnectionOptions,
} from "sora-js-sdk";
import { generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  // URL から channelName パラメータを取得
  const urlParams = new URLSearchParams(window.location.search);
  const channelName = urlParams.get("channelName") || "";
  const channelId = `${channelIdPrefix}:${channelName}:${channelIdSuffix}`;

  const sendonly = new SimulcastSendonlySoraClient(
    signalingUrl,
    channelId,
    secretKey,
    {
      audio: false,
      video: true,
      videoCodecType: "VP8",
      videoBitRate: 2500,
      simulcast: true,
    },
  );
  const recvonlyR0 = new SimulcastRecvonlySoraClient(
    signalingUrl,
    channelId,
    secretKey,
    {
      simulcast: true,
      simulcastRid: "r0",
    },
  );
  const recvonlyR1 = new SimulcastRecvonlySoraClient(
    signalingUrl,
    channelId,
    secretKey,
    {
      simulcast: true,
      simulcastRid: "r1",
    },
  );
  const recvonlyR2 = new SimulcastRecvonlySoraClient(
    signalingUrl,
    channelId,
    secretKey,
    {
      simulcast: true,
      simulcastRid: "r2",
    },
  );

  document.querySelector("#connect")?.addEventListener("click", async () => {
    // sendonly
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { exact: 1280 }, height: { exact: 720 } },
    });
    await sendonly.connect(stream);

    // recvonly r0
    await recvonlyR0.connect();
    // recvonly r1
    await recvonlyR1.connect();
    // recvonly r2
    await recvonlyR2.connect();
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await sendonly.disconnect();

    // recvonly r0
    await recvonlyR0.disconnect();
    // recvonly r1
    await recvonlyR1.disconnect();
    // recvonly r2
    await recvonlyR2.disconnect();
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    const statsReport = await sendonly.getStats();
    const statsReportJson: Record<string, unknown>[] = [];
    for (const report of statsReport.values()) {
      statsReportJson.push(report);
    }
    const statsReportJsonElement =
      document.querySelector<HTMLPreElement>("#stats-report-json");
    if (statsReportJsonElement) {
      statsReportJsonElement.textContent = JSON.stringify(
        statsReportJson,
        null,
        2,
      );
    }
  });
});

class SimulcastSendonlySoraClient {
  private debug = false;

  private channelId: string;
  private options: ConnectionOptions;

  private secretKey: string;

  private sora: SoraConnection;
  private connection: ConnectionPublisher;

  constructor(
    signaling_url: string,
    channelId: string,
    secretKey: string,
    options: ConnectionOptions,
  ) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.options = options;

    this.sora = Sora.connection(signaling_url, this.debug);
    this.connection = this.sora.sendonly(
      this.channelId,
      undefined,
      this.options,
    );
    this.connection.on("notify", this.onnotify.bind(this));
  }

  async connect(stream: MediaStream) {
    if (this.secretKey !== "") {
      const jwt = await generateJwt(this.channelId, this.secretKey);
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
    await this.connection?.disconnect();
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = null;
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error("PeerConnection is not ready"));
    }
    return this.connection.pc.getStats();
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === "connection.created" &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector(
        "#local-video-connection-id",
      );
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = `${event.connection_id}`;
      }
    }
  }
}

class SimulcastRecvonlySoraClient {
  private debug = false;

  private channelId: string;
  private options: ConnectionOptions;

  private secretKey: string;

  private sora: SoraConnection;
  private connection: ConnectionSubscriber;

  constructor(
    signaling_url: string,
    channelId: string,
    secretKey: string,
    options: ConnectionOptions,
  ) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.options = options;

    this.sora = Sora.connection(signaling_url, this.debug);
    this.connection = this.sora.recvonly(
      this.channelId,
      undefined,
      this.options,
    );
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect() {
    const jwt = await generateJwt(this.channelId, this.secretKey);
    this.connection.metadata = {
      access_token: jwt,
    };

    await this.connection.connect();
  }

  async disconnect() {
    if (!this.connection) {
      return;
    }
    await this.connection.disconnect();

    const remoteVideo = document.querySelector<HTMLVideoElement>(
      `#remote-video-${this.options.simulcastRid}`,
    );
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === "connection.created" &&
      event.connection_id === this.connection?.connectionId
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

  private ontrack(event: RTCTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(
      `#remote-video-${this.options.simulcastRid}`,
    );
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(
      `#remote-video-${this.options.simulcastRid}`,
    );
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
  }
}
