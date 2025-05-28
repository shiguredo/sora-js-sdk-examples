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

  private sendonlyCanvas: HTMLCanvasElement | null = null;
  private sendonlyCanvasCtx: CanvasRenderingContext2D | null = null;
  private recvonlyCanvas: HTMLCanvasElement | null = null;
  private recvonlyCanvasCtx: CanvasRenderingContext2D | null = null;

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
    this.analyzeSendonlyAudioStream(new MediaStream([audioTrack]));

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
    this.sendonlyCanvas = document.querySelector<HTMLCanvasElement>(
      `#sendonly${this.clientId}-waveform`,
    );
    if (this.sendonlyCanvas) {
      this.sendonlyCanvasCtx = this.sendonlyCanvas.getContext("2d");
    }

    this.recvonlyCanvas = document.querySelector<HTMLCanvasElement>(
      `#recvonly${this.clientId}-waveform`,
    );
    if (this.recvonlyCanvas) {
      this.recvonlyCanvasCtx = this.recvonlyCanvas.getContext("2d");
    }
  }

  analyzeSendonlyAudioStream(stream: MediaStream) {
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

      this.drawSendonlyWaveforms(dataArrayL, dataArrayR);

      let difference = 0;
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i]);
      }

      const isStereo = difference !== 0;
      const result = isStereo ? "Stereo" : "Mono";

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>(
        `#sendonly${this.clientId}-difference-value`,
      );
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`;
      }

      // sendonly-stereo 要素に結果を反映
      const sendonlyStereoElement = document.querySelector<HTMLDivElement>(
        `#sendonly${this.clientId}-stereo`,
      );
      if (sendonlyStereoElement) {
        sendonlyStereoElement.textContent = result;
      }

      requestAnimationFrame(analyze);
    };

    analyze();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  analyzeRecvonlyAudioStream(stream: MediaStream) {
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

      this.drawRecvonlyWaveforms(dataArrayL, dataArrayR);

      let difference = 0;
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i]);
      }

      const isStereo = difference !== 0;
      const result = isStereo ? "Stereo" : "Mono";

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>(
        `#recvonly${this.clientId}-difference-value`,
      );
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`;
      }

      // 既存のコード
      const recvonlyStereoElement = document.querySelector<HTMLDivElement>(
        `#recvonly${this.clientId}-stereo`,
      );
      if (recvonlyStereoElement) {
        recvonlyStereoElement.textContent = result;
      }

      requestAnimationFrame(analyze);
    };

    analyze();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  private drawSendonlyWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.sendonlyCanvasCtx || !this.sendonlyCanvas) return;

    const width = this.sendonlyCanvas.width;
    const height = this.sendonlyCanvas.height;
    const bufferLength = dataArrayL.length;

    this.sendonlyCanvasCtx.fillStyle = "rgb(240, 240, 240)";
    this.sendonlyCanvasCtx.fillRect(0, 0, width, height);
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.sendonlyCanvasCtx) return;

      this.sendonlyCanvasCtx.lineWidth = 3;
      this.sendonlyCanvasCtx.strokeStyle = color;
      this.sendonlyCanvasCtx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = height / 2 + v * height * 0.8 + offset;

        if (i === 0) {
          this.sendonlyCanvasCtx?.moveTo(x, y);
        } else {
          this.sendonlyCanvasCtx?.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.sendonlyCanvasCtx?.lineTo(width, height / 2 + offset);
      this.sendonlyCanvasCtx?.stroke();
    };

    // 左チャンネル（青）を少し上にずらして描画
    this.sendonlyCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayL, "rgb(0, 0, 255)", -10);

    // 右チャンネル（赤）を少し下にずらして描画
    this.sendonlyCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayR, "rgb(255, 0, 0)", 10);

    // モノラルかステレオかを判定して表示
    const isMonaural = this.isMonaural(dataArrayL, dataArrayR);
    this.sendonlyCanvasCtx.fillStyle = "black";
    this.sendonlyCanvasCtx.font = "20px Arial";
    this.sendonlyCanvasCtx.fillText(isMonaural ? "Monaural" : "Stereo", 10, 30);
  }

  private drawRecvonlyWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.recvonlyCanvasCtx || !this.recvonlyCanvas) return;

    const width = this.recvonlyCanvas.width;
    const height = this.recvonlyCanvas.height;
    const bufferLength = dataArrayL.length;

    this.recvonlyCanvasCtx.fillStyle = "rgb(240, 240, 240)";
    this.recvonlyCanvasCtx.fillRect(0, 0, width, height);
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.recvonlyCanvasCtx) return;

      this.recvonlyCanvasCtx.lineWidth = 3;
      this.recvonlyCanvasCtx.strokeStyle = color;
      this.recvonlyCanvasCtx.beginPath();

      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i];
        const y = height / 2 + v * height * 0.8 + offset;

        if (i === 0) {
          this.recvonlyCanvasCtx?.moveTo(x, y);
        } else {
          this.recvonlyCanvasCtx?.lineTo(x, y);
        }

        x += sliceWidth;
      }

      this.recvonlyCanvasCtx?.lineTo(width, height / 2 + offset);
      this.recvonlyCanvasCtx?.stroke();
    };

    this.recvonlyCanvasCtx.globalAlpha = 0.7;
    drawChannel(dataArrayL, "rgb(0, 0, 255)", -10);
    drawChannel(dataArrayR, "rgb(255, 0, 0)", 10);

    const isMonaural = this.isMonaural(dataArrayL, dataArrayR);
    this.recvonlyCanvasCtx.fillStyle = "black";
    this.recvonlyCanvasCtx.font = "20px Arial";
    this.recvonlyCanvasCtx.fillText(isMonaural ? "Monaural" : "Stereo", 10, 30);
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
  }

  private ontrack(event: RTCTrackEvent) {
    // Sora の場合、event.streams には MediaStream が 1 つだけ含まれる
    const stream = event.streams[0];
    if (event.track.kind === "audio") {
      this.analyzeRecvonlyAudioStream(new MediaStream([event.track]));

      // <audio> 要素に音声ストリームを設定
      const audioElement = document.querySelector<HTMLAudioElement>(
        `#recvonly${this.clientId}-audio`,
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
        `#sendonly${this.clientId}-channels`,
      );
      if (channelElement) {
        channelElement.textContent =
          channels !== undefined ? `getParameters codecs channels: ${channels}` : "undefined";
      }
    }, 1000); // 1秒ごとにチェック
  }
}
