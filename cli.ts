import { parse } from "https://deno.land/std@0.184.0/flags/mod.ts";
import { YoutubeTranscript } from "./main.ts";

const flags = parse(Deno.args, {
  string: ["url", "lang", "country"],
  boolean: ["metadata"],
  default: { lang: "en", country: "US", metadata: false },
});

const url = flags.url || Deno.args[0];

const config = {
  lang: flags.lang,
  country: flags.country,
};

let out = "";

if (flags.metadata) {
  const transcript = await YoutubeTranscript.fetchTranscript(url, config);
  out = JSON.stringify(transcript, null, 2);
} else {
  out = await YoutubeTranscript.fetchTranscriptText(url, config);
}

console.log(out);
