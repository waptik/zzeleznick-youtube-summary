import { YoutubeTranscript } from "./yt.ts";

if (import.meta.main) {
  Deno.serve(async (req: Request) => {
    const url = "https://www.youtube.com/watch?v=46IEp7_mpdw";
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    const body = JSON.stringify(transcript);
    
    return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
  });
}
