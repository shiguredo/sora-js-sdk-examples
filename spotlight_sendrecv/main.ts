import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionPublisher,
  SignalingNotifyMessage,
  ConnectionOptions,
} from "sora-js-sdk";
import { generateChannelId, generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const secretKey = import.meta.env.VITE_SECRET_KEY || "";

  const channelId = generateChannelId();

  const sendrecv = new SoraClient(signalingUrl, channelId, secretKey);

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    await sendrecv.connect(stream);
  });
  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await sendrecv.disconnect();
  });
});

class SoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly options: ConnectionOptions;

  private readonly secretKey: string;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.secretKey = secretKey;

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.channelId = channelId;
    this.options = {
      audio: true,
      video: true,
      simulcast: true,
      spotlight: true,
      spotlightNumber: 1,
    };

    this.connection = this.sora.sendrecv(this.channelId, undefined, this.options);

    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
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

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector<HTMLDivElement>("#connection-id");
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id;
      }
    }
  }

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    if (stream === undefined) {
      return;
    }
    const remoteVideoId = `remote-video-${stream.id}`;
    const remoteVideos = document.querySelector<HTMLDivElement>("#remote-videos");
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.style.border = "1px solid red";
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.controls = true;
      remoteVideo.width = 160;
      remoteVideo.height = 120;
      remoteVideo.srcObject = stream;
      remoteVideos.append(remoteVideo);
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target;
    if (!(target instanceof MediaStream)) {
      return;
    }
    const stream = target;
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${stream.id}`);
    if (remoteVideo) {
      remoteVideo.remove();
    }
  }
}
