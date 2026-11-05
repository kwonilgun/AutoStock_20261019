import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppChrome } from "@/components/layout/AppChrome";
import "./globals.css";

export const dynamic = "force-dynamic";

/** 터널·내부망에서 개발용 실시간 갱신 연결이 브라우저 탭 로딩을 붙잡지 않게 막는다. */
const REMOTE_HMR_GUARD = `(function(){
  var host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return;
  function blocked(url){ return /webpack-hmr|turbopack-hmr|__nextjs_original-stack-frames/i.test(String(url)); }
  var WS = window.WebSocket;
  window.WebSocket = function(url, protocols){
    if (blocked(url)) {
      return { close:function(){}, addEventListener:function(){}, removeEventListener:function(){}, send:function(){}, readyState:3, CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 };
    }
    return protocols !== undefined ? new WS(url, protocols) : new WS(url);
  };
  window.WebSocket.prototype = WS.prototype;
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
  var ES = window.EventSource;
  if (ES) {
    window.EventSource = function(url, config){
      if (blocked(url)) {
        return { close:function(){}, addEventListener:function(){}, removeEventListener:function(){}, readyState:2 };
      }
      return config ? new ES(url, config) : new ES(url);
    };
  }
  var _fetch = window.fetch;
  window.fetch = function(input, init){
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (blocked(url)) return Promise.resolve(new Response("", { status: 204 }));
    return _fetch.apply(this, arguments);
  };
})();`;

export const metadata: Metadata = {
  title: "에그밸런스",
  description: "코스톨라니 달걀 국면에 맞춘 월간 리밸런싱 가이드",
  appleWebApp: { capable: true, title: "에그밸런스", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f4f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" style={{ background: "#f2f4f6" }}>
      <body style={{ background: "#f2f4f6", margin: 0 }}>
        {process.env.NODE_ENV === "development" ? (
          <Script id="remote-hmr-guard" strategy="beforeInteractive">
            {REMOTE_HMR_GUARD}
          </Script>
        ) : null}
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
