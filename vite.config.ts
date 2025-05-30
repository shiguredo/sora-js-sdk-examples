import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname),
  server: {
    allowedHosts: ["many-large-weevil.ngrok-free.app"],
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        sendrecv: resolve(__dirname, "sendrecv/index.html"),
        sendonly: resolve(__dirname, "sendonly/index.html"),
        recvonly: resolve(__dirname, "recvonly/index.html"),
        check_stereo: resolve(__dirname, "check_stereo/index.html"),
        check_stereo_multi: resolve(__dirname, "check_stereo_multi/index.html"),
        replace_track: resolve(__dirname, "replace_track/index.html"),
        simulcast: resolve(__dirname, "simulcast/index.html"),
        spotlight_sendrecv: resolve(__dirname, "spotlight_sendrecv/index.html"),
        messaging: resolve(__dirname, "messaging/index.html"),
      },
    },
  },
});
