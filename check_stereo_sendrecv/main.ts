import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionSubscriber,
  type ConnectionOptions,
} from "sora-js-sdk";
import { generateChannelId, generateJwt } from "../src/misc";

document.addEventListener("DOMContentLoaded", async () => {
  // 環境変数の読み込み
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL;
  const secretKey = import.meta.env.VITE_SECRET_KEY;

  const channelId = generateChannelId();

  const sendrecv1 = new SendrecvClient(signalingUrl, channelId, secretKey, "1");
  const sendrecv2 = new SendrecvClient(signalingUrl, channelId, secretKey, "2");

  // デバイスリストの取得と設定
  await updateDeviceLists();

  // デバイスの変更を監視
  navigator.mediaDevices.addEventListener("devicechange", updateDeviceLists);

  document.querySelector("#sendrecv1-connect")?.addEventListener("click", async () => {
    const audioInputSelect = document.querySelector<HTMLSelectElement>("#sendrecv1-audio-input");
    const selectedAudioDeviceId = audioInputSelect?.value;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: selectedAudioDeviceId ? { exact: selectedAudioDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
      },
    });
    await sendrecv1.connect(stream);
  });

  document.querySelector("#sendrecv2-connect")?.addEventListener("click", async () => {
    const audioInputSelect = document.querySelector<HTMLSelectElement>("#sendrecv2-audio-input");
    const selectedAudioDeviceId = audioInputSelect?.value;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: selectedAudioDeviceId ? { exact: selectedAudioDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
      },
    });
    await sendrecv2.connect(stream);
  });
});

// デバイスリストを更新する関数
async function updateDeviceLists() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const audioInputSelect1 = document.querySelector<HTMLSelectElement>("#sendrecv1-audio-input");
  const audioInputSelect2 = document.querySelector<HTMLSelectElement>("#sendrecv2-audio-input");

  for (const audioInputSelect of [audioInputSelect1, audioInputSelect2]) {
    if (audioInputSelect) {
      audioInputSelect.innerHTML = "";
      const audioInputDevices = devices.filter((device) => device.kind === "audioinput");
      for (const device of audioInputDevices) {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `マイク ${audioInputSelect.length + 1}`;
        audioInputSelect.appendChild(option);
      }
    }
  }
}

class SendrecvClient {
  private debug = false;

  private channelId: string;
  private options: ConnectionOptions;
  private clientId: string;

  private secretKey: string;

  private sora: SoraConnection;
  private connection: ConnectionPublisher;

  private localCanvas: HTMLCanvasElement | null = null;
  private localCanvasCtx: CanvasRenderingContext2D | null = null;
  private remoteCanvas: HTMLCanvasElement | null = null;
  private remoteCanvasCtx: CanvasRenderingContext2D | null = null;

  private channelCheckInterval: number | undefined;

  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    clientId: string,
    options: ConnectionOptions = {},
  ) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.clientId = clientId;
    this.options = options;

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.sendrecv(this.channelId, null, this.options);
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));

    this.initializeCanvases();
  }

  async connect(stream: MediaStream): Promise<void> {
    if (this.secretKey) {
      const jwt = await generateJwt(this.channelId, this.secretKey);
      this.connection.metadata = {
        access_token: jwt,
      };
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error("Audio track not found");
    }

    // forceStereoOutputの設定
    const forceStereoOutputElement = document.querySelector<HTMLInputElement>(
      `#forceStereoOutput${this.clientId}`,
    );
    const forceStereoOutput = forceStereoOutputElement ? forceStereoOutputElement.checked : false;
    this.connection.options.forceStereoOutput = forceStereoOutput;

    await this.connection.connect(stream);
    this.analyzeLocalAudioStream(new MediaStream([audioTrack]));

    // チャネル数の定期チェックを開始
    this.startChannelCheck();
  }

  async getChannels(): Promise<number | undefined> {
    if (!this.connection.pc) {
      return undefined;
    }
    const sender = this.connection.pc.getSenders().find((sender) => sender.track?.kind === "audio");
    if (!sender) {
      return undefined;
    }
    return sender.getParameters().codecs[0].channels;
  }

  private initializeCanvases() {
    this.localCanvas = document.querySelector<HTMLCanvasElement>(`#local${this.clientId}-waveform`);
    if (this.localCanvas) {
      this.localCanvasCtx = this.localCanvas.getContext("2d");
    }

    this.remoteCanvas = document.querySelector<HTMLCanvasElement>(
      `#remote${this.clientId}-waveform`,
    );
    if (this.remoteCanvas) {
      this.remoteCanvasCtx = this.remoteCanvas.getContext("2d");
    }
  }

  analyzeLocalAudioStream(stream: MediaStream) {
    const audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    });
    const source = audioContext.createMediaStreamSource(stream);
    const splitter = audioContext.createChannelSplitter(2);
    const analyserL = audioContext.createAnalyser();
    const analyserR = audioContext.createAnalyser();

    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    analyserL.fftSize = 2048;
    analyserR.fftSize = 2048;

    const bufferLength = analyserL.frequencyBinCount;
    const dataArrayL = new Float32Array(bufferLength);
    const dataArrayR = new Float32Array(bufferLength);

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL);
      analyserR.getFloatTimeDomainData(dataArrayR);

      this.drawLocalWaveforms(dataArrayL, dataArrayR);

      let difference = 0;
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i]);
      }

      const isStereo = difference !== 0;
      const result = isStereo ? "Stereo" : "Mono";

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>(
        `#local${this.clientId}-difference-value`,
      );
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`;
      }

      // local-stereo 要素に結果を反映
      const localStereoElement = document.querySelector<HTMLDivElement>(
        `#local${this.clientId}-stereo`,
      );
      if (localStereoElement) {
        localStereoElement.textContent = result;
      }

      requestAnimationFrame(analyze);
    };

    analyze();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  analyzeRemoteAudioStream(stream: MediaStream) {
    const audioContext = new AudioContext({
      sampleRate: 48000,
      latencyHint: "interactive",
    });
    const source = audioContext.createMediaStreamSource(stream);
    const splitter = audioContext.createChannelSplitter(2);
    const analyserL = audioContext.createAnalyser();
    const analyserR = audioContext.createAnalyser();

    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    analyserL.fftSize = 2048;
    analyserR.fftSize = 2048;

    const bufferLength = analyserL.frequencyBinCount;
    const dataArrayL = new Float32Array(bufferLength);
    const dataArrayR = new Float32Array(bufferLength);

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL);
      analyserR.getFloatTimeDomainData(dataArrayR);

      this.drawRemoteWaveforms(dataArrayL, dataArrayR);

      let difference = 0;
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i]);
      }

      const isStereo = difference !== 0;
      const result = isStereo ? "Stereo" : "Mono";

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>(
        `#remote${this.clientId}-difference-value`,
      );
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`;
      }

      // 既存のコード
      const remoteStereoElement = document.querySelector<HTMLDivElement>(
        `#remote${this.clientId}-stereo`,
      );
      if (remoteStereoElement) {
        remoteStereoElement.textContent = result;
      }

      requestAnimationFrame(analyze);
    };

    analyze();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  private drawLocalWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.localCanvasCtx || !this.localCanvas) return;

    const width = this.localCanvas.width;
    const height = this.localCanvas.height;
    const bufferLength = dataArrayL.length;

    this.localCanvasCtx.fillStyle = "rgb(240, 240, 240)";
    this.localCanvasCtx.fillRect(0, 0, width, height);
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.localCanvasCtx) return;

      this.localCanvasCtx.lineWidth = 3;
      this.localCanvasCtx.strokeStyle = color;
      this.localCanvasCtx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = height / 2 + v * height * 0.8 + offset;

        if (i === 0) {
          this.localCanvasCtx?.moveTo(x, y);
        } else {
          this.localCanvasCtx?.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.localCanvasCtx?.lineTo(width, height / 2 + offset);
      this.localCanvasCtx?.stroke();
    };

    // 左チャンネル（青）を少し上にずらして描画
    this.localCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayL, "rgb(0, 0, 255)", -10);

    // 右チャンネル（赤）を少し下にずらして描画
    this.localCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayR, "rgb(255, 0, 0)", 10);

    // モノラルかステレオかを判定して表示
    const isMonaural = this.isMonaural(dataArrayL, dataArrayR);
    this.localCanvasCtx.fillStyle = "black";
    this.localCanvasCtx.font = "20px Arial";
    this.localCanvasCtx.fillText(isMonaural ? "Monaural" : "Stereo", 10, 30);
  }

  private drawRemoteWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.remoteCanvasCtx || !this.remoteCanvas) return;

    const width = this.remoteCanvas.width;
    const height = this.remoteCanvas.height;
    const bufferLength = dataArrayL.length;

    this.remoteCanvasCtx.fillStyle = "rgb(240, 240, 240)";
    this.remoteCanvasCtx.fillRect(0, 0, width, height);
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.remoteCanvasCtx) return;

      this.remoteCanvasCtx.lineWidth = 3;
      this.remoteCanvasCtx.strokeStyle = color;
      this.remoteCanvasCtx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = height / 2 + v * height * 0.8 + offset;

        if (i === 0) {
          this.remoteCanvasCtx?.moveTo(x, y);
        } else {
          this.remoteCanvasCtx?.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.remoteCanvasCtx?.lineTo(width, height / 2 + offset);
      this.remoteCanvasCtx?.stroke();
    };

    this.remoteCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayL, "rgb(0, 0, 255)", -10);
    drawChannel(dataArrayR, "rgb(255, 0, 0)", 10);

    const isMonaural = this.isMonaural(dataArrayL, dataArrayR);
    this.remoteCanvasCtx.fillStyle = "black";
    this.remoteCanvasCtx.font = "20px Arial";
    this.remoteCanvasCtx.fillText(isMonaural ? "Monaural" : "Stereo", 10, 30);
  }

  private isMonaural(dataArrayL: Float32Array, dataArrayR: Float32Array): boolean {
    const threshold = 0.001;
    for (let i = 0; i < dataArrayL.length; i++) {
      if (Math.abs(dataArrayL[i] - dataArrayR[i]) > threshold) {
        return false;
      }
    }
    return true;
  }

  private onnotify(event: SignalingNotifyMessage) {
    console.log(`Client ${this.clientId} notify:`, event);

    // 自分の connection_id を取得する
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector<HTMLDivElement>(
        `#sendrecv${this.clientId}-connection-id`,
      );
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id;
      }
    }

    // 他の connection が作成された場合も表示
    if (event.event_type === "connection.created") {
      console.log(`Client ${this.clientId}: New connection created - ${event.connection_id}`);
    }

    // connection が破棄された場合も表示
    if (event.event_type === "connection.destroyed") {
      console.log(`Client ${this.clientId}: Connection destroyed - ${event.connection_id}`);
    }
  }

  private ontrack(event: RTCTrackEvent) {
    // Sora の場合、event.streams には MediaStream が 1 つだけ含まれる
    const stream = event.streams[0];
    if (event.track.kind === "audio") {
      this.analyzeRemoteAudioStream(new MediaStream([event.track]));

      // 受信しているトラックの stream.id を表示する要素を動的に作成
      const remoteInfoSection = document.querySelector(
        `#remote${this.clientId}-stereo`,
      )?.parentElement;
      if (remoteInfoSection && !document.querySelector(`#remote${this.clientId}-stream-id`)) {
        const streamIdElement = document.createElement("div");
        streamIdElement.id = `remote${this.clientId}-stream-id`;
        streamIdElement.textContent = stream.id;
        remoteInfoSection.appendChild(streamIdElement);
      }

      // <audio> 要素に音声ストリームを設定
      const audioElement = document.querySelector<HTMLAudioElement>(
        `#remote${this.clientId}-audio`,
      );
      if (audioElement) {
        audioElement.srcObject = stream;
        audioElement.play().catch((error) => console.error("音声の再生に失敗しました:", error));
      }
    }
  }

  private startChannelCheck() {
    this.channelCheckInterval = window.setInterval(async () => {
      const channels = await this.getChannels();
      const channelElement = document.querySelector<HTMLDivElement>(
        `#local${this.clientId}-channels`,
      );
      if (channelElement) {
        channelElement.textContent =
          channels !== undefined ? `getParameters codecs channels: ${channels}` : "undefined";
      }
    }, 1000); // 1秒ごとにチェック
  }
}
