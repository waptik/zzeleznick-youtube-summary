import { parse } from "https://deno.land/std@0.184.0/flags/mod.ts";
import { YoutubeTranscript } from "./yt.ts";
import { splitText, AIAgent} from "./extra.ts";
  
const flags = parse(Deno.args, {
  string: ["url", "lang", "country"],
  boolean: ["metadata", "summarize"],
  default: { 
    lang: "en",
    country: "US",
    metadata: false,
    summarize: false,
  },
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

if (flags.summarize) {
  const texts = await splitText(out);
  let summaryBatch = texts;
  if (texts.length > 1) {
    summaryBatch = await AIAgent.summarizeBatch(texts);
  }
  // TODO: enable additional rounds of split + summarize runs instead of assuming max of 1 compression pass
  out = await AIAgent.summarize(summaryBatch.join("\n"), undefined, "detailed tldr;");
}

console.log(out);
