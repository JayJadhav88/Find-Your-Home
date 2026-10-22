"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows one of the team's HTML pages inside the site layout. The page runs in a sandbox
 * without "allow-same-origin", so its scripts work but cannot read this site's cookies,
 * storage or sign-ins. The page reports its height so the frame grows to fit.
 */
export function HtmlPageFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(800);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const value = (event.data as { fyhPageHeight?: unknown } | null)?.fyhPageHeight;
      if (typeof value === "number" && Number.isFinite(value)) setHeight(Math.min(Math.max(Math.ceil(value), 200), 30000));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation"
      referrerPolicy="strict-origin-when-cross-origin"
      className="block w-full border-0"
      style={{ height }}
    />
  );
}
