import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AudioPlayer } from "@/components/inbox/AudioPlayer";

const A = "https://upload.wikimedia.org/wikipedia/commons/4/4e/BWV_543-preview.ogg";
const B = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg";

function Page() {
  const [n, setN] = useState(0);
  return (
    <div className="p-4 space-y-4">
      <button type="button" onClick={() => setN((v) => v + 1)} aria-label="forcar rerender">
        rerender {n}
      </button>
      <AudioPlayer src={A} isVoice />
      <AudioPlayer src={B} />
    </div>
  );
}

export const Route = createFileRoute("/tmp-audio-check")({
  head: () => ({ meta: [{ title: "Teste de áudio" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});
