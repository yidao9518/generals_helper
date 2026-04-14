(() => {
  if (window.__generalsHelperWsHookInstalled) {
    return;
  }
  window.__generalsHelperWsHookInstalled = true;

  const BRIDGE_SOURCE = "generals-helper-ws-hook";
  const NativeWebSocket = window.WebSocket;

  function capturePayload(payload) {
    if (typeof payload === "string") {
      return {
        type: "text",
        size: payload.length,
        preview: payload
      };
    }
    return {
      type: "text",
      size: 0,
      preview: "[unsupported payload]"
    };
  }

  function postFrame(frame) {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type: "WS_FRAME_CAPTURED",
        payload: {
          ...frame,
          capturedAt: Date.now()
        }
      },
      "*"
    );
  }

  function wrapSocket(ws, urlValue) {
    ws.addEventListener("message", (event) => {
      const payload = capturePayload(event.data);
      postFrame({
        direction: "inbound",
        url: String(urlValue || ws.url || ""),
        ...payload
      });
    });

    const nativeSend = ws.send;
    ws.send = function patchedSend(data) {
      const payload = capturePayload(data);
      postFrame({
        direction: "outbound",
        url: String(urlValue || ws.url || ""),
        ...payload
      });
      return nativeSend.call(this, data);
    };

    return ws;
  }

  function WrappedWebSocket(url, protocols) {
    const socket = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    return wrapSocket(socket, url);
  }

  WrappedWebSocket.prototype = NativeWebSocket.prototype;
  Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);

  window.WebSocket = WrappedWebSocket;
})();

